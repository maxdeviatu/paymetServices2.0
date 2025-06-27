const logger = require('../config/logger')
const emailService = require('./email')

/**
 * Servicio de cola de correos para gestión controlada de envíos
 * Evita saturar el servidor de correos con envíos masivos
 */
class EmailQueueService {
  constructor() {
    this.queue = []
    this.isProcessing = false
    this.intervalSeconds = parseInt(process.env.WAITLIST_EMAIL_INTERVAL_SECONDS) || 30
    this.maxRetries = parseInt(process.env.WAITLIST_EMAIL_MAX_RETRIES) || 3
    this.maxQueueSize = parseInt(process.env.WAITLIST_EMAIL_QUEUE_MAX_SIZE) || 1000
    this.processingInterval = null
    
    logger.info('EmailQueueService initialized', {
      intervalSeconds: this.intervalSeconds,
      maxRetries: this.maxRetries,
      maxQueueSize: this.maxQueueSize
    })
  }

  /**
   * Agregar correo de licencia a la cola
   */
  async queueLicenseEmail(waitlistEntry) {
    try {
      if (this.queue.length >= this.maxQueueSize) {
        throw new Error('Email queue is full')
      }

      const emailItem = {
        id: `license_${waitlistEntry.id}_${Date.now()}`,
        type: 'LICENSE_EMAIL',
        waitlistEntryId: waitlistEntry.id,
        orderId: waitlistEntry.orderId,
        retryCount: 0,
        createdAt: new Date(),
        status: 'PENDING'
      }

      this.queue.push(emailItem)

      logger.logBusiness('emailQueue:license.queued', {
        emailId: emailItem.id,
        waitlistEntryId: waitlistEntry.id,
        queueSize: this.queue.length
      })

      // Iniciar procesamiento si no está corriendo
      if (!this.isProcessing) {
        this.startProcessing()
      }

      return emailItem.id
    } catch (error) {
      logger.logError(error, {
        operation: 'queueLicenseEmail',
        waitlistEntryId: waitlistEntry.id
      })
      throw error
    }
  }

  /**
   * Agregar correo de notificación de lista de espera a la cola
   */
  async queueWaitlistNotification(waitlistEntry) {
    try {
      if (this.queue.length >= this.maxQueueSize) {
        throw new Error('Email queue is full')
      }

      const emailItem = {
        id: `waitlist_${waitlistEntry.id}_${Date.now()}`,
        type: 'WAITLIST_NOTIFICATION',
        waitlistEntryId: waitlistEntry.id,
        orderId: waitlistEntry.orderId,
        retryCount: 0,
        createdAt: new Date(),
        status: 'PENDING'
      }

      this.queue.push(emailItem)

      logger.logBusiness('emailQueue:waitlist.queued', {
        emailId: emailItem.id,
        waitlistEntryId: waitlistEntry.id,
        queueSize: this.queue.length
      })

      // Iniciar procesamiento si no está corriendo
      if (!this.isProcessing) {
        this.startProcessing()
      }

      return emailItem.id
    } catch (error) {
      logger.logError(error, {
        operation: 'queueWaitlistNotification',
        waitlistEntryId: waitlistEntry.id
      })
      throw error
    }
  }

  /**
   * Iniciar el procesamiento de la cola
   */
  startProcessing() {
    if (this.isProcessing) {
      return
    }

    this.isProcessing = true
    logger.logBusiness('emailQueue:processing.start', {
      queueSize: this.queue.length,
      intervalSeconds: this.intervalSeconds
    })

    this.processingInterval = setInterval(async () => {
      await this.processNextEmail()
    }, this.intervalSeconds * 1000)
  }

  /**
   * Detener el procesamiento de la cola
   */
  stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
    }
    this.isProcessing = false

    logger.logBusiness('emailQueue:processing.stop', {
      queueSize: this.queue.length
    })
  }

  /**
   * Procesar el siguiente correo en la cola
   */
  async processNextEmail() {
    if (this.queue.length === 0) {
      this.stopProcessing()
      return
    }

    const emailItem = this.queue.shift()

    try {
      logger.logBusiness('emailQueue:processing.email', {
        emailId: emailItem.id,
        type: emailItem.type,
        waitlistEntryId: emailItem.waitlistEntryId,
        retryCount: emailItem.retryCount
      })

      await this.sendEmail(emailItem)
      
      logger.logBusiness('emailQueue:processing.success', {
        emailId: emailItem.id,
        type: emailItem.type,
        waitlistEntryId: emailItem.waitlistEntryId
      })

    } catch (error) {
      logger.logError(error, {
        operation: 'processNextEmail',
        emailId: emailItem.id,
        type: emailItem.type,
        waitlistEntryId: emailItem.waitlistEntryId,
        retryCount: emailItem.retryCount
      })

      // Reencolar si no ha superado el máximo de reintentos
      if (emailItem.retryCount < this.maxRetries) {
        emailItem.retryCount++
        emailItem.status = 'RETRYING'
        this.queue.push(emailItem)

        logger.logBusiness('emailQueue:processing.retry', {
          emailId: emailItem.id,
          retryCount: emailItem.retryCount,
          maxRetries: this.maxRetries
        })
      } else {
        logger.logError(error, {
          operation: 'processNextEmail.maxRetriesExceeded',
          emailId: emailItem.id,
          type: emailItem.type,
          waitlistEntryId: emailItem.waitlistEntryId,
          finalRetryCount: emailItem.retryCount
        })
      }
    }
  }

  /**
   * Enviar un correo específico según su tipo
   */
  async sendEmail(emailItem) {
    const { WaitlistEntry, Order, License } = require('../models')

    switch (emailItem.type) {
      case 'LICENSE_EMAIL':
        await this.sendLicenseEmail(emailItem)
        break

      case 'WAITLIST_NOTIFICATION':
        await this.sendWaitlistNotification(emailItem)
        break

      default:
        throw new Error(`Unknown email type: ${emailItem.type}`)
    }
  }

  /**
   * Enviar correo de licencia
   */
  async sendLicenseEmail(emailItem) {
    const { WaitlistEntry, Order, License } = require('../models')

    const waitlistEntry = await WaitlistEntry.findByPk(emailItem.waitlistEntryId)
    if (!waitlistEntry) {
      throw new Error('Waitlist entry not found')
    }

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

    // Actualizar el estado de la orden a COMPLETED después del envío exitoso
    await Order.update({
      status: 'COMPLETED'
    }, {
      where: { id: order.id }
    })

    logger.logBusiness('emailQueue:license.sent', {
      emailId: emailItem.id,
      waitlistEntryId: waitlistEntry.id,
      orderId: order.id,
      licenseId: license.id,
      customerEmail: order.customer.email
    })
  }

  /**
   * Enviar correo de notificación de lista de espera
   */
  async sendWaitlistNotification(emailItem) {
    const { WaitlistEntry, Order } = require('../models')

    const waitlistEntry = await WaitlistEntry.findByPk(emailItem.waitlistEntryId)
    if (!waitlistEntry) {
      throw new Error('Waitlist entry not found')
    }

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

    logger.logBusiness('emailQueue:waitlist.sent', {
      emailId: emailItem.id,
      waitlistEntryId: waitlistEntry.id,
      orderId: order.id,
      customerEmail: order.customer.email
    })
  }

  /**
   * Obtener estadísticas de la cola
   */
  getQueueStats() {
    const stats = {
      queueSize: this.queue.length,
      isProcessing: this.isProcessing,
      intervalSeconds: this.intervalSeconds,
      maxRetries: this.maxRetries,
      maxQueueSize: this.maxQueueSize
    }

    const typeStats = this.queue.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1
      return acc
    }, {})

    const statusStats = this.queue.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {})

    return {
      ...stats,
      typeStats,
      statusStats
    }
  }

  /**
   * Limpiar la cola (solo para testing/mantenimiento)
   */
  clearQueue() {
    const clearedCount = this.queue.length
    this.queue = []
    this.stopProcessing()

    logger.logBusiness('emailQueue:cleared', {
      clearedCount
    })

    return { clearedCount }
  }
}

module.exports = new EmailQueueService()
