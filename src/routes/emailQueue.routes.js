const express = require('express')
const router = express.Router()
const emailQueueController = require('../controllers/emailQueue.controller')
const { authenticate } = require('../middlewares/auth')
const { requireRole } = require('../middlewares/role')

/**
 * Rutas simplificadas para email queue v2.0
 * Solo testing y estadísticas básicas de compatibilidad
 */

/**
 * @route GET /api/email-queue/stats
 * @desc Obtener estadísticas de la cola de correos (compatibilidad)
 * @access Super Administrador
 */
router.get('/stats', 
  authenticate, 
  requireRole('SUPER_ADMIN'), 
  emailQueueController.getQueueStats
)

/**
 * @route POST /api/email-queue/test
 * @desc Test del sistema de envío de correos
 * @access Super Administrador
 */
router.post('/test', 
  authenticate, 
  requireRole('SUPER_ADMIN'), 
  emailQueueController.testQueue
)

module.exports = router