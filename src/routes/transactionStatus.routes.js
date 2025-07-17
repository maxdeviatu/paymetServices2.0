const express = require('express')
const router = express.Router()
const transactionStatusController = require('../controllers/transactionStatus.controller')
const { authenticate } = require('../middlewares/auth')
const { requireRole } = require('../middlewares/role')
const { validateTransactionLookup, validateMultipleTransactions } = require('../middlewares/validator')
const {
  securityHeaders,
  logPublicRequest,
  sanitizeInput
} = require('../middlewares/security')

// Apply security middleware to all routes
router.use(securityHeaders)
router.use(logPublicRequest)
router.use(sanitizeInput)

// All routes require authentication
router.use(authenticate)

/**
 * @route GET /api/transaction-status/stats
 * @desc Obtener estadísticas de transacciones pendientes
 * @access EDITOR+
 */
router.get('/stats',
  requireRole('EDITOR'),
  transactionStatusController.getPendingTransactionsStats
)

/**
 * @route POST /api/transaction-status/verify/:transactionId
 * @desc Verificar estado de una transacción específica
 * @access EDITOR+
 */
router.post('/verify/:transactionId',
  requireRole('EDITOR'),
  validateTransactionLookup,
  transactionStatusController.verifyTransactionStatus
)

/**
 * @route POST /api/transaction-status/verify-multiple
 * @desc Verificar múltiples transacciones pendientes
 * @access EDITOR+
 */
router.post('/verify-multiple',
  requireRole('EDITOR'),
  validateMultipleTransactions,
  transactionStatusController.verifyMultipleTransactions
)

/**
 * @route POST /api/transaction-status/verify-email/:orderId
 * @desc Verificar si se envió el email de licencia y reenviarlo si es necesario
 * @access EDITOR+
 */
router.post('/verify-email/:orderId',
  requireRole('EDITOR'),
  transactionStatusController.verifyAndResendLicenseEmail
)

module.exports = router
