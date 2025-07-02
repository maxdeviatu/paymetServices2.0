const emailQueueService = require('../services/emailQueue.service')
const logger = require('../config/logger')

/**
 * Controlador simplificado para gestión de email queue v2.0
 * Solo mantiene funcionalidad de testing y estadísticas básicas
 */
class EmailQueueController {
  /**
   * Obtener estadísticas de la cola de correos (compatibilidad)
   */
  async getQueueStats(req, res) {
    try {
      const stats = emailQueueService.getQueueStats()
      
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
   * Test del email queue service
   */
  async testQueue(req, res) {
    try {
      const { testEmail } = req.body
      const result = await emailQueueService.testEmailQueue(testEmail)
      
      logger.logBusiness('emailQueue:test.manual', {
        adminId: req.user?.id,
        testEmail: testEmail || 'default'
      })

      res.json({
        success: true,
        message: 'Email test completed successfully',
        data: result
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'testQueue',
        userId: req.user?.id
      })

      res.status(500).json({
        success: false,
        message: 'Error testing email functionality',
        error: error.message
      })
    }
  }
}

module.exports = new EmailQueueController()