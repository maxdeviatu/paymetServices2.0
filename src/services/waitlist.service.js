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
  async addToWaitlist (order, reason = 'OUT_OF_STOCK') {
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
  async reserveAvailableLicenses (productRef) {
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

        // PASO 3: Apartar licencias como RESERVED y preparar para envío de emails
        const reservations = []

        for (let i = 0; i < licenses.length; i++) {
          const license = licenses[i]
          const entry = waitlistEntries[i]

          // Apartar licencia como RESERVED (no SOLD todavía)
          await license.update({
            status: 'RESERVED',
            reservedAt: new Date()
          }, { transaction: t })

          // Actualizar entrada de lista de espera a READY_FOR_EMAIL
          // Las órdenes permanecen en IN_PROCESS hasta confirmar email
          await entry.update({
            status: 'READY_FOR_EMAIL',
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
   * Procesar una entrada lista para envío de email (llamado por el job)
   * Envía UN email cada vez que se ejecuta (intervalo de 30 segundos)
   */
  async processNextReservedEntry () {
    try {
      logger.logBusiness('waitlist:emailProcess.start')

      const results = {
        processed: 0,
        failed: 0,
        queued: 0,
        errors: []
      }

      // Obtener UNA entrada lista para email (FIFO)
      const readyEntry = await WaitlistEntry.findOne({
        where: {
          status: 'READY_FOR_EMAIL'
        },
        include: [
          {
            association: 'order',
            include: ['customer', 'product'],
            required: true
          },
          {
            association: 'license',
            required: true
          }
        ],
        order: [['priority', 'ASC']] // FIFO - el más antiguo primero
      })

      if (!readyEntry) {
        logger.logBusiness('waitlist:emailProcess.noEntries')
        return results
      }

      // Procesar UNA SOLA entrada por ejecución
      try {
        await this.processWaitlistEntryWithEmail(readyEntry)
        results.processed++
        results.queued++

        logger.logBusiness('waitlist:emailProcess.singleSuccess', {
          waitlistEntryId: readyEntry.id,
          orderId: readyEntry.orderId,
          customerEmail: readyEntry.order?.customer?.email
        })
      } catch (error) {
        logger.logError(error, {
          operation: 'processWaitlistEntryWithEmail',
          waitlistEntryId: readyEntry.id,
          orderId: readyEntry.orderId
        })

        // Marcar como fallido si excede reintentos
        if (readyEntry.retryCount >= 3) {
          await readyEntry.update({
            status: 'FAILED',
            errorMessage: error.message
          })
          results.failed++
        } else {
          // Incrementar contador de reintentos
          await readyEntry.update({
            retryCount: readyEntry.retryCount + 1,
            errorMessage: error.message
          })
        }

        results.errors.push({
          waitlistEntryId: readyEntry.id,
          orderId: readyEntry.orderId,
          error: error.message
        })
      }

      logger.logBusiness('waitlist:emailProcess.completed', results)
      return results
    } catch (error) {
      logger.logError(error, {
        operation: 'processReservedLicenses'
      })
      throw error
    }
  }

  /**
   * Procesar una entrada individual para envío de email
   * SOLO después del envío exitoso: completa orden y vende licencia
   */
  async processWaitlistEntryWithEmail (entry) {
    try {
      // Validar que todos los datos necesarios están disponibles
      if (!entry.order) {
        throw new Error('Order data not available')
      }
      if (!entry.order.customer) {
        throw new Error('Customer data not available')
      }
      if (!entry.order.product) {
        throw new Error('Product data not available')
      }
      if (!entry.license) {
        throw new Error('License data not available')
      }
      if (!entry.order.customer.email) {
        throw new Error('Customer email not available')
      }

      // Marcar como PROCESSING
      await entry.update({ status: 'PROCESSING' })

      logger.logBusiness('waitlist:emailProcess.sendingEmail', {
        waitlistEntryId: entry.id,
        orderId: entry.orderId,
        licenseId: entry.licenseId,
        customerEmail: entry.order.customer.email
      })

      // Usar la cola de emails para mejor confiabilidad
      await emailQueueService.queueLicenseEmail({
        customer: entry.order.customer,
        product: entry.order.product,
        license: entry.license,
        order: entry.order
      })

      // ✅ EMAIL EN COLA - AHORA SÍ COMPLETAR TODO
      // El sistema de cola se encarga del envío real
      await this.completeOrderAfterEmailSent(entry)

      logger.logBusiness('waitlist:emailProcess.emailQueued', {
        waitlistEntryId: entry.id,
        orderId: entry.orderId,
        customerEmail: entry.order.customer.email,
        message: 'License email queued and order completed successfully'
      })
    } catch (error) {
      // Revertir a READY_FOR_EMAIL para reintentar
      await entry.update({ 
        status: 'READY_FOR_EMAIL',
        errorMessage: error.message
      })
      
      logger.logError(error, {
        operation: 'processSingleEmailEntry',
        waitlistEntryId: entry.id,
        orderId: entry.orderId
      })
      throw error
    }
  }

  /**
   * Completar orden y vender licencia SOLO después de confirmar envío de email
   */
  async completeOrderAfterEmailSent (entry) {
    return await TransactionManager.executeInventoryTransaction(async (t) => {
      const { Order } = require('../models')

      // 1. Actualizar licencia de RESERVED → SOLD
      await License.update({
        status: 'SOLD',
        orderId: entry.orderId,
        soldAt: new Date()
      }, {
        where: { id: entry.licenseId },
        transaction: t
      })

      // 2. Completar la orden de IN_PROCESS → COMPLETED
      await Order.update({
        status: 'COMPLETED'
      }, {
        where: { id: entry.orderId },
        transaction: t
      })

      // 3. Marcar entrada como completada
      await entry.update({
        status: 'COMPLETED',
        processedAt: new Date()
      }, { transaction: t })

      logger.logBusiness('waitlist:orderCompleted', {
        waitlistEntryId: entry.id,
        orderId: entry.orderId,
        licenseId: entry.licenseId,
        message: 'Order completed after email confirmation'
      })
    })
  }

  /**
   * Obtener métricas de la lista de espera incluyendo cola de correos
   */
  async getWaitlistMetrics (productRef = null) {
    try {
      const whereClause = productRef ? { productRef } : {}

      const [pending, reserved, processing, readyForEmail, completed, failed] = await Promise.all([
        WaitlistEntry.count({ where: { ...whereClause, status: 'PENDING' } }),
        WaitlistEntry.count({ where: { ...whereClause, status: 'RESERVED' } }),
        WaitlistEntry.count({ where: { ...whereClause, status: 'PROCESSING' } }),
        WaitlistEntry.count({ where: { ...whereClause, status: 'READY_FOR_EMAIL' } }),
        WaitlistEntry.count({ where: { ...whereClause, status: 'COMPLETED' } }),
        WaitlistEntry.count({ where: { ...whereClause, status: 'FAILED' } })
      ])

      const total = pending + reserved + processing + readyForEmail + completed + failed

      // Obtener estadísticas de la cola de correos
      const emailQueueStats = emailQueueService.getQueueStats()

      return {
        waitlist: {
          total,
          pending,
          reserved,
          processing,
          readyForEmail,
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
  async getWaitlist (filters = {}) {
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
  async removeFromWaitlist (waitlistEntryId, reason = 'MANUAL') {
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
}

module.exports = new WaitlistService()
