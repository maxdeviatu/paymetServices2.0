const { WaitlistEntry, License, Order, User, Product } = require('../models')
const { Op } = require('sequelize')
const logger = require('../config/logger')
const TransactionManager = require('../utils/transactionManager')
const emailService = require('./email')
const emailQueueService = require('./emailQueue.service')

/**
 * Servicio de gestión de lista de espera para productos sin stock
 */
class WaitlistService {
  /**
   * Agregar orden a la lista de espera
   */
  async addToWaitlist(order, reason = 'OUT_OF_STOCK') {
    try {
      logger.logBusiness('waitlist:add', {
        orderId: order.id,
        customerId: order.customerId,
        productRef: order.productRef,
        reason
      })

      return await TransactionManager.executeInventoryTransaction(async (t) => {
        // Verificar que no esté ya en la lista de espera
        const existingEntry = await WaitlistEntry.findOne({
          where: { orderId: order.id },
          transaction: t
        })

        if (existingEntry) {
          throw new Error('Order already in waitlist')
        }

        // Crear entrada en lista de espera
        const waitlistEntry = await WaitlistEntry.create({
          orderId: order.id,
          customerId: order.customerId,
          productRef: order.productRef,
          qty: order.qty,
          status: 'PENDING',
          priority: new Date()
        }, { transaction: t })

        // Enviar email de notificación usando la cola
        setImmediate(async () => {
          try {
            await emailQueueService.queueWaitlistNotification(waitlistEntry)
          } catch (emailError) {
            logger.logError(emailError, {
              operation: 'queueWaitlistNotification',
              waitlistEntryId: waitlistEntry.id
            })
          }
        })

        logger.logBusiness('waitlist:add.success', {
          waitlistEntryId: waitlistEntry.id,
          orderId: order.id
        })

        return waitlistEntry
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'addToWaitlist',
        orderId: order.id
      })
      throw error
    }
  }

  /**
   * Reservar licencias disponibles para lista de espera
   */
  async reserveAvailableLicenses(productRef) {
    try {
      logger.logBusiness('waitlist:reserve', { productRef })

      return await TransactionManager.executeInventoryTransaction(async (t) => {
        // Contar usuarios en lista de espera
        const waitlistCount = await WaitlistEntry.count({
          where: {
            productRef,
            status: 'PENDING'
          },
          transaction: t
        })

        if (waitlistCount === 0) {
          return {
            reserved: 0,
            waitlistCount: 0,
            message: 'No pending waitlist entries'
          }
        }

        // Contar licencias disponibles
        const availableLicenses = await License.count({
          where: {
            productRef,
            status: 'AVAILABLE'
          },
          transaction: t
        })

        const licensesToReserve = Math.min(waitlistCount, availableLicenses)

        if (licensesToReserve === 0) {
          return {
            reserved: 0,
            waitlistCount,
            availableLicenses: 0,
            message: 'No available licenses to reserve'
          }
        }

        // Obtener licencias disponibles
        const licenses = await License.findAll({
          where: {
            productRef,
            status: 'AVAILABLE'
          },
          limit: licensesToReserve,
          lock: t.LOCK.UPDATE,
          transaction: t
        })

        // Obtener entradas de lista de espera ordenadas por prioridad
        const waitlistEntries = await WaitlistEntry.findAll({
          where: {
            productRef,
            status: 'PENDING'
          },
          order: [['priority', 'ASC']],
          limit: licensesToReserve,
          lock: t.LOCK.UPDATE,
          transaction: t
        })

        // Reservar licencias y actualizar entradas
        const reservations = []
        for (let i = 0; i < licenses.length; i++) {
          const license = licenses[i]
          const entry = waitlistEntries[i]

          // Reservar licencia
          await license.update({
            status: 'RESERVED',
            waitlistEntryId: entry.id,
            reservedAt: new Date()
          }, { transaction: t })

          // Actualizar entrada de lista de espera
          await entry.update({
            status: 'RESERVED',
            licenseId: license.id
          }, { transaction: t })

          reservations.push({
            licenseId: license.id,
            waitlistEntryId: entry.id,
            orderId: entry.orderId
          })
        }

        logger.logBusiness('waitlist:reserve.success', {
          productRef,
          reserved: reservations.length,
          waitlistCount,
          availableLicenses
        })

        return {
          reserved: reservations.length,
          waitlistCount,
          availableLicenses,
          reservations,
          message: `Reserved ${reservations.length} licenses for waitlist`
        }
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'reserveAvailableLicenses',
        productRef
      })
      throw error
    }
  }

  /**
   * Procesar licencias reservadas (llamado por el job)
   * Ahora solo actualiza estados, no envía correos inmediatamente
   */
  async processReservedLicenses() {
    try {
      logger.logBusiness('waitlist:process.start')

      const results = {
        processed: 0,
        failed: 0,
        queued: 0,
        errors: []
      }

      // Obtener entradas con licencias reservadas
      const reservedEntries = await WaitlistEntry.findAll({
        where: {
          status: 'RESERVED'
        },
        include: [
          {
            association: 'order',
            include: ['customer', 'product']
          },
          {
            association: 'license'
          }
        ],
        order: [['priority', 'ASC']]
      })

      if (reservedEntries.length === 0) {
        logger.logBusiness('waitlist:process.noEntries')
        return results
      }

      // Procesar cada entrada secuencialmente para mantener el orden
      for (const entry of reservedEntries) {
        try {
          await this.processSingleEntryWithQueue(entry)
          results.processed++
          results.queued++
        } catch (error) {
          logger.logError(error, {
            operation: 'processSingleEntryWithQueue',
            waitlistEntryId: entry.id,
            orderId: entry.orderId
          })

          // Marcar como fallido si excede reintentos
          if (entry.retryCount >= 3) {
            await entry.update({
              status: 'FAILED',
              errorMessage: error.message,
              processedAt: new Date()
            })
            results.failed++
          } else {
            // Incrementar contador de reintentos
            await entry.update({
              retryCount: entry.retryCount + 1,
              errorMessage: error.message
            })
          }

          results.errors.push({
            waitlistEntryId: entry.id,
            orderId: entry.orderId,
            error: error.message
          })
        }
      }

      logger.logBusiness('waitlist:process.completed', results)
      return results
    } catch (error) {
      logger.logError(error, {
        operation: 'processReservedLicenses'
      })
      throw error
    }
  }

  /**
   * Procesar una entrada individual de la lista de espera (nueva versión con cola)
   * Actualiza estados pero delega el envío de correo a la cola
   */
  async processSingleEntryWithQueue(entry) {
    return await TransactionManager.executeInventoryTransaction(async (t) => {
      // Verificar que la entrada sigue reservada
      const currentEntry = await WaitlistEntry.findByPk(entry.id, {
        where: { status: 'RESERVED' },
        lock: t.LOCK.UPDATE,
        transaction: t
      })

      if (!currentEntry) {
        throw new Error('Entry no longer reserved')
      }

      // Marcar como procesando
      await currentEntry.update({
        status: 'PROCESSING'
      }, { transaction: t })

      // Obtener licencia
      const license = await License.findByPk(entry.licenseId, {
        where: { status: 'RESERVED' },
        lock: t.LOCK.UPDATE,
        transaction: t
      })

      if (!license) {
        throw new Error('License not found or not reserved')
      }

      // Asignar licencia a la orden
      await license.update({
        status: 'SOLD',
        orderId: entry.orderId,
        soldAt: new Date()
      }, { transaction: t })

      // Marcar entrada como completada (sin completar la orden aún)
      await currentEntry.update({
        status: 'COMPLETED',
        processedAt: new Date()
      }, { transaction: t })

      logger.logBusiness('waitlist:process.entry.success', {
        waitlistEntryId: entry.id,
        orderId: entry.orderId,
        licenseId: license.id
      })
    })

    // Después de la transacción, agregar a la cola de correos
    try {
      await emailQueueService.queueLicenseEmail(entry)
      logger.logBusiness('waitlist:process.entry.queued', {
        waitlistEntryId: entry.id,
        orderId: entry.orderId
      })
    } catch (emailError) {
      logger.logError(emailError, {
        operation: 'queueLicenseEmail',
        waitlistEntryId: entry.id
      })
      // No lanzamos el error aquí para no fallar la transacción principal
    }
  }

  /**
   * Procesar una entrada individual de la lista de espera (versión original)
   * Mantener para compatibilidad con envío inmediato
   */
  async processSingleEntry(entry) {
    return await TransactionManager.executeInventoryTransaction(async (t) => {
      // Verificar que la entrada sigue reservada
      const currentEntry = await WaitlistEntry.findByPk(entry.id, {
        where: { status: 'RESERVED' },
        lock: t.LOCK.UPDATE,
        transaction: t
      })

      if (!currentEntry) {
        throw new Error('Entry no longer reserved')
      }

      // Marcar como procesando
      await currentEntry.update({
        status: 'PROCESSING'
      }, { transaction: t })

      // Obtener licencia
      const license = await License.findByPk(entry.licenseId, {
        where: { status: 'RESERVED' },
        lock: t.LOCK.UPDATE,
        transaction: t
      })

      if (!license) {
        throw new Error('License not found or not reserved')
      }

      // Asignar licencia a la orden
      await license.update({
        status: 'SOLD',
        orderId: entry.orderId,
        soldAt: new Date()
      }, { transaction: t })

      // Completar la orden
      await Order.update({
        status: 'COMPLETED'
      }, {
        where: { id: entry.orderId },
        transaction: t
      })

      // Marcar entrada como completada
      await currentEntry.update({
        status: 'COMPLETED',
        processedAt: new Date()
      }, { transaction: t })

      // Enviar email con licencia
      setImmediate(async () => {
        try {
          await this.sendLicenseEmail(entry)
        } catch (emailError) {
          logger.logError(emailError, {
            operation: 'sendLicenseEmail',
            waitlistEntryId: entry.id
          })
        }
      })

      logger.logBusiness('waitlist:process.entry.success', {
        waitlistEntryId: entry.id,
        orderId: entry.orderId,
        licenseId: license.id
      })
    })
  }

  /**
   * Enviar email de notificación de lista de espera
   */
  async sendWaitlistNotification(waitlistEntry) {
    try {
      const order = await Order.findByPk(waitlistEntry.orderId, {
        include: ['customer', 'product']
      })

      if (!order) {
        throw new Error('Order not found')
      }

      await emailService.sendWaitlistNotification({
        customer: order.customer,
        product: order.product,
        order,
        waitlistEntry
      })

      logger.logBusiness('waitlist:email.notification.sent', {
        waitlistEntryId: waitlistEntry.id,
        orderId: order.id,
        customerEmail: order.customer.email
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'sendWaitlistNotification',
        waitlistEntryId: waitlistEntry.id
      })
      throw error
    }
  }

  /**
   * Enviar email con licencia
   */
  async sendLicenseEmail(waitlistEntry) {
    try {
      const order = await Order.findByPk(waitlistEntry.orderId, {
        include: ['customer', 'product']
      })

      const license = await License.findByPk(waitlistEntry.licenseId)

      if (!order || !license) {
        throw new Error('Order or license not found')
      }

      await emailService.sendLicenseEmail({
        customer: order.customer,
        product: order.product,
        license,
        order
      })

      logger.logBusiness('waitlist:email.license.sent', {
        waitlistEntryId: waitlistEntry.id,
        orderId: order.id,
        licenseId: license.id,
        customerEmail: order.customer.email
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'sendLicenseEmail',
        waitlistEntryId: waitlistEntry.id
      })
      throw error
    }
  }

  /**
   * Obtener métricas de la lista de espera incluyendo cola de correos
   */
  async getWaitlistMetrics(productRef = null) {
    try {
      const whereClause = productRef ? { productRef } : {}

      const [pending, reserved, processing, completed, failed] = await Promise.all([
        WaitlistEntry.count({ where: { ...whereClause, status: 'PENDING' } }),
        WaitlistEntry.count({ where: { ...whereClause, status: 'RESERVED' } }),
        WaitlistEntry.count({ where: { ...whereClause, status: 'PROCESSING' } }),
        WaitlistEntry.count({ where: { ...whereClause, status: 'COMPLETED' } }),
        WaitlistEntry.count({ where: { ...whereClause, status: 'FAILED' } })
      ])

      const total = pending + reserved + processing + completed + failed

      // Obtener estadísticas de la cola de correos
      const emailQueueStats = emailQueueService.getQueueStats()

      return {
        waitlist: {
          total,
          pending,
          reserved,
          processing,
          completed,
          failed,
          productRef
        },
        emailQueue: emailQueueStats
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'getWaitlistMetrics',
        productRef
      })
      throw error
    }
  }

  /**
   * Obtener lista de espera con filtros
   */
  async getWaitlist(filters = {}) {
    try {
      const whereClause = {}

      if (filters.status) {
        whereClause.status = filters.status
      }
      if (filters.productRef) {
        whereClause.productRef = filters.productRef
      }
      if (filters.customerId) {
        whereClause.customerId = filters.customerId
      }

      const entries = await WaitlistEntry.findAll({
        where: whereClause,
        include: [
          {
            association: 'order',
            include: ['customer', 'product']
          },
          {
            association: 'license'
          }
        ],
        order: [['priority', 'ASC']]
      })

      return entries
    } catch (error) {
      logger.logError(error, {
        operation: 'getWaitlist',
        filters
      })
      throw error
    }
  }

  /**
   * Remover entrada de la lista de espera (con liberación de licencia)
   */
  async removeFromWaitlist(waitlistEntryId, reason = 'MANUAL') {
    try {
      logger.logBusiness('waitlist:remove', { waitlistEntryId, reason })

      return await TransactionManager.executeInventoryTransaction(async (t) => {
        const entry = await WaitlistEntry.findByPk(waitlistEntryId, {
          lock: t.LOCK.UPDATE,
          transaction: t
        })

        if (!entry) {
          throw new Error('Waitlist entry not found')
        }

        // Si tiene licencia reservada, liberarla
        if (entry.licenseId) {
          const license = await License.findByPk(entry.licenseId, {
            lock: t.LOCK.UPDATE,
            transaction: t
          })

          if (license && license.status === 'RESERVED') {
            await license.update({
              status: 'AVAILABLE',
              waitlistEntryId: null,
              reservedAt: null
            }, { transaction: t })
          }
        }

        // Eliminar entrada
        await entry.destroy({ transaction: t })

        logger.logBusiness('waitlist:remove.success', {
          waitlistEntryId,
          reason,
          hadLicense: !!entry.licenseId
        })

        return { success: true, message: 'Entry removed from waitlist' }
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'removeFromWaitlist',
        waitlistEntryId
      })
      throw error
    }
  }

  /**
   * Obtener estadísticas de la cola de correos
   */
  getEmailQueueStats() {
    return emailQueueService.getQueueStats()
  }

  /**
   * Limpiar la cola de correos (solo para mantenimiento)
   */
  clearEmailQueue() {
    return emailQueueService.clearQueue()
  }

  /**
   * Forzar procesamiento manual de cola de correos
   */
  async processEmailQueue() {
    try {
      await emailQueueService.processNextEmail()
      return { success: true, message: 'Email queue processed manually' }
    } catch (error) {
      logger.logError(error, {
        operation: 'processEmailQueue'
      })
      throw error
    }
  }
}

module.exports = new WaitlistService() 