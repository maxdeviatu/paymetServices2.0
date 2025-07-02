const waitlistService = require('../services/waitlist.service')
const logger = require('../config/logger')

/**
 * Controlador para gestión de la cola de correos de lista de espera
 */
class EmailQueueController {
  /**
   * Obtener estadísticas de la cola de correos
   */
  async getQueueStats(req, res) {
    try {
      const stats = waitlistService.getEmailQueueStats()
      
      res.json({
        success: true,
        data: stats
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'getQueueStats',
        userId: req.user?.id
      })

      res.status(500).json({
        success: false,
        message: 'Error retrieving queue statistics',
        error: error.message
      })
    }
  }

  /**
   * Limpiar la cola de correos (solo administradores)
   */
  async clearQueue(req, res) {
    try {
      const result = waitlistService.clearEmailQueue()
      
      logger.logBusiness('emailQueue:cleared.manual', {
        adminId: req.user?.id,
        clearedCount: result.clearedCount
      })

      res.json({
        success: true,
        message: 'Email queue cleared successfully',
        data: result
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'clearQueue',
        userId: req.user?.id
      })

      res.status(500).json({
        success: false,
        message: 'Error clearing queue',
        error: error.message
      })
    }
  }

  /**
   * Procesar manualmente la cola de correos
   */
  async processQueue(req, res) {
    try {
      const result = await waitlistService.processEmailQueue()
      
      logger.logBusiness('emailQueue:processed.manual', {
        adminId: req.user?.id
      })

      res.json({
        success: true,
        message: 'Email queue processed manually',
        data: result
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'processQueue',
        userId: req.user?.id
      })

      res.status(500).json({
        success: false,
        message: 'Error processing queue',
        error: error.message
      })
    }
  }

  /**
   * Test del email queue service
   */
  async testQueue(req, res) {
    try {
      const emailQueueService = require('../services/emailQueue.service')
      const result = await emailQueueService.testEmailQueue()
      
      logger.logBusiness('emailQueue:test.manual', {
        adminId: req.user?.id,
        testEmailId: result.testEmailId
      })

      res.json({
        success: true,
        message: 'Email queue test initiated',
        data: result
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'testQueue',
        userId: req.user?.id
      })

      res.status(500).json({
        success: false,
        message: 'Error testing queue',
        error: error.message
      })
    }
  }

  /**
   * Obtener métricas completas de waitlist incluyendo cola
   */
  async getFullMetrics(req, res) {
    try {
      const { productRef } = req.query
      const metrics = await waitlistService.getWaitlistMetrics(productRef)
      
      res.json({
        success: true,
        data: metrics
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'getFullMetrics',
        userId: req.user?.id,
        productRef: req.query.productRef
      })

      res.status(500).json({
        success: false,
        message: 'Error retrieving metrics',
        error: error.message
      })
    }
  }
}

module.exports = new EmailQueueController()
