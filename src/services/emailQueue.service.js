const logger = require('../config/logger')
const emailService = require('./email')

/**
 * Servicio simplificado de estadísticas de email para lista de espera
 * v2.0: Solo mantiene compatibilidad con métricas, el envío es directo
 */
class EmailQueueService {
  constructor () {
    this.intervalSeconds = parseInt(process.env.WAITLIST_EMAIL_INTERVAL_SECONDS) || 30
    this.maxRetries = parseInt(process.env.WAITLIST_EMAIL_MAX_RETRIES) || 3
    this.maxQueueSize = parseInt(process.env.WAITLIST_EMAIL_QUEUE_MAX_SIZE) || 1000

    logger.info('EmailQueueService initialized (v2.0 - Direct sending mode)', {
      intervalSeconds: this.intervalSeconds,
      maxRetries: this.maxRetries,
      maxQueueSize: this.maxQueueSize
    })
  }

  /**
   * Inicializar el servicio (compatibilidad)
   */
  initialize () {
    logger.info('EmailQueueService: Starting initialization', {
      queueSize: 0,
      isProcessing: false,
      intervalSeconds: this.intervalSeconds
    })

    logger.info('EmailQueueService: Initialization completed', {
      ready: true,
      intervalSeconds: this.intervalSeconds
    })
  }

  /**
   * Agregar notificación de lista de espera (compatibilidad - envío directo)
   */
  async queueWaitlistNotification (waitlistEntry) {
    try {
      // v2.0: Envío directo en lugar de cola
      const { Order } = require('../models')

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

      logger.logBusiness('emailQueue:waitlistNotification.sent', {
        waitlistEntryId: waitlistEntry.id,
        orderId: order.id,
        customerEmail: order.customer.email,
        mode: 'direct'
      })

      return { success: true, mode: 'direct' }
    } catch (error) {
      logger.logError(error, {
        operation: 'queueWaitlistNotification',
        waitlistEntryId: waitlistEntry.id
      })
      throw error
    }
  }

  /**
   * Obtener estadísticas de la cola (compatibilidad)
   */
  getQueueStats () {
    return {
      queueSize: 0, // v2.0: No usa cola
      isProcessing: false,
      intervalSeconds: this.intervalSeconds,
      maxRetries: this.maxRetries,
      maxQueueSize: this.maxQueueSize,
      typeStats: {},
      statusStats: {},
      mode: 'direct_v2'
    }
  }

  /**
   * Enviar email de prueba
   */
  async testEmailQueue (testEmail = 'test@example.com') {
    try {
      logger.info('EmailQueueService: Testing email functionality', {
        testEmail,
        mode: 'direct'
      })

      await emailService.sendTestEmail(testEmail)

      logger.info('EmailQueueService: Test email sent successfully', {
        testEmail,
        success: true
      })

      return {
        success: true,
        testEmail,
        mode: 'direct',
        message: 'Test email sent successfully via direct mode'
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'testEmailQueue',
        testEmail
      })
      throw error
    }
  }
}

module.exports = new EmailQueueService()
