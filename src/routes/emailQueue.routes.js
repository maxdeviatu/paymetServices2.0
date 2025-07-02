const express = require('express')
const router = express.Router()
const emailQueueController = require('../controllers/emailQueue.controller')
const { authenticate } = require('../middlewares/auth')
const { requireRole } = require('../middlewares/role')

/**
 * Rutas para gestión de la cola de correos de lista de espera
 * Requieren autenticación y permisos de administrador
 */

/**
 * @route GET /api/email-queue/stats
 * @desc Obtener estadísticas de la cola de correos
 * @access Administrador
 */
router.get('/stats', 
  authenticate, 
  requireRole('SUPER_ADMIN'), 
  emailQueueController.getQueueStats
)

/**
 * @route POST /api/email-queue/clear
 * @desc Limpiar la cola de correos
 * @access Super Administrador
 */
router.post('/clear', 
  authenticate, 
  requireRole('SUPER_ADMIN'), 
  emailQueueController.clearQueue
)

/**
 * @route POST /api/email-queue/process
 * @desc Procesar manualmente la cola de correos
 * @access Administrador
 */
router.post('/process', 
  authenticate, 
  requireRole('SUPER_ADMIN'), 
  emailQueueController.processQueue
)

/**
 * @route POST /api/email-queue/test
 * @desc Test del sistema de cola de correos
 * @access Super Administrador
 */
router.post('/test', 
  authenticate, 
  requireRole('SUPER_ADMIN'), 
  emailQueueController.testQueue
)

/**
 * @route GET /api/email-queue/metrics
 * @desc Obtener métricas completas de waitlist y cola de correos
 * @access Administrador
 */
router.get('/metrics', 
  authenticate, 
  requireRole('SUPER_ADMIN'), 
  emailQueueController.getFullMetrics
)

module.exports = router
