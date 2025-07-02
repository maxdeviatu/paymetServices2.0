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
   * Inicializar el servicio de cola de emails
   * Método explícito para inicialización desde app.js
   */
  initialize() {
    logger.info('EmailQueueService: Starting initialization', {
      queueSize: this.queue.length,
      isProcessing: this.isProcessing,
      intervalSeconds: this.intervalSeconds
    })

    // Si hay elementos en la cola al inicializar, comenzar procesamiento
    if (this.queue.length > 0 && !this.isProcessing) {
      this.startProcessing()
    }

    logger.info('EmailQueueService: Initialization completed', {
      ready: true,
      intervalSeconds: this.intervalSeconds
    })
  }

  /**
   * Agregar correo de licencia a la cola
   */
  async queueLicenseEmail(waitlistEntry) {
    try {
      logger.info('EmailQueueService: queueLicenseEmail called', {
        waitlistEntryId: waitlistEntry.id,
        orderId: waitlistEntry.orderId,
        queueSize: this.queue.length,
        isProcessing: this.isProcessing
      })

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
        queueSize: this.queue.length,
        wasProcessing: this.isProcessing
      })

      // Iniciar procesamiento si no está corriendo
      if (!this.isProcessing) {
        logger.info('EmailQueueService: Starting processing because queue was not active')
        this.startProcessing()
      } else {
        logger.info('EmailQueueService: Processing already active, item added to queue')
      }

      return emailItem.id
    } catch (error) {
      logger.logError(error, {
        operation: 'queueLicenseEmail',
        waitlistEntryId: waitlistEntry.id,
        errorMessage: error.message,
        errorStack: error.stack
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
      logger.info('EmailQueueService: startProcessing called but already processing')
      return
    }

    this.isProcessing = true
    logger.logBusiness('emailQueue:processing.start', {
      queueSize: this.queue.length,
      intervalSeconds: this.intervalSeconds,
      timestamp: new Date().toISOString()
    })

    this.processingInterval = setInterval(async () => {
      await this.processNextEmail()
    }, this.intervalSeconds * 1000)

    logger.info('EmailQueueService: Processing interval started', {
      intervalMs: this.intervalSeconds * 1000,
      queueSize: this.queue.length
    })
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
        retryCount: emailItem.retryCount,
        queueSizeRemaining: this.queue.length
      })

      await this.sendEmail(emailItem)
      
      logger.logBusiness('emailQueue:processing.success', {
        emailId: emailItem.id,
        type: emailItem.type,
        waitlistEntryId: emailItem.waitlistEntryId,
        message: 'Email sent successfully from queue'
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

      case 'TEST_EMAIL':
        await this.sendTestEmail(emailItem)
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

    logger.logBusiness('emailQueue:license.preparing', {
      emailId: emailItem.id,
      waitlistEntryId: emailItem.waitlistEntryId
    })

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

    logger.logBusiness('emailQueue:license.sending', {
      emailId: emailItem.id,
      waitlistEntryId: waitlistEntry.id,
      orderId: order.id,
      licenseId: license.id,
      customerEmail: order.customer.email
    })

    await emailService.sendLicenseEmail({
      customer: order.customer,
      product: order.product,
      license,
      order
    })

    logger.logBusiness('emailQueue:license.sent', {
      emailId: emailItem.id,
      waitlistEntryId: waitlistEntry.id,
      orderId: order.id,
      licenseId: license.id,
      customerEmail: order.customer.email,
      message: 'License email sent successfully'
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
   * Enviar email de test
   */
  async sendTestEmail(emailItem) {
    logger.logBusiness('emailQueue:test.sending', {
      emailId: emailItem.id,
      timestamp: new Date().toISOString()
    })

    // Simular envío de email
    await new Promise(resolve => setTimeout(resolve, 100))

    logger.logBusiness('emailQueue:test.sent', {
      emailId: emailItem.id,
      message: 'Test email processed successfully',
      timestamp: new Date().toISOString()
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
   * Forzar procesamiento manual de cola de correos
   */
  async processEmailQueue() {
    try {
      await this.processNextEmail()
      return { success: true, message: 'Email queue processed manually' }
    } catch (error) {
      logger.logError(error, {
        operation: 'processEmailQueue'
      })
      throw error
    }
  }

  /**
   * Método de test para verificar el funcionamiento del email queue
   */
  async testEmailQueue() {
    try {
      logger.info('EmailQueueService: Running test', {
        queueSize: this.queue.length,
        isProcessing: this.isProcessing,
        intervalSeconds: this.intervalSeconds
      })

      // Crear un email de prueba
      const testEmailItem = {
        id: `test_${Date.now()}`,
        type: 'TEST_EMAIL',
        waitlistEntryId: null,
        orderId: null,
        retryCount: 0,
        createdAt: new Date(),
        status: 'PENDING'
      }

      this.queue.push(testEmailItem)

      logger.info('EmailQueueService: Test email added to queue', {
        emailId: testEmailItem.id,
        queueSize: this.queue.length
      })

      // Iniciar procesamiento si no está corriendo
      if (!this.isProcessing) {
        this.startProcessing()
      }

      return {
        success: true,
        testEmailId: testEmailItem.id,
        queueSize: this.queue.length,
        isProcessing: this.isProcessing
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'testEmailQueue'
      })
      throw error
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
