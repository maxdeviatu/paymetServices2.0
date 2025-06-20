const express = require('express')
const router = express.Router()
const webhookController = require('../controllers/webhook.controller')
const { authenticate } = require('../middlewares/auth')
const { requireRole } = require('../middlewares/role')
const { webhookLimiter } = require('../middlewares/rateLimiter')
const { securityHeaders, logPublicRequest, sanitizeInput } = require('../middlewares/security')

// Apply security middleware to all webhook routes
router.use(securityHeaders)
router.use(logPublicRequest)
router.use(sanitizeInput)
router.use(webhookLimiter)

// Endpoint principal of webhooks (no authentication required - verified by signature)
// Use express.raw() to preserve the original body for signature validation
router.post('/:provider',
  express.raw({ type: 'application/json' }),
  webhookController.handleWebhook.bind(webhookController)
)

// Health check for webhooks
router.get('/:provider/health', webhookController.healthCheck.bind(webhookController))

// Mock payment completion (for testing only)
if (process.env.NODE_ENV === 'development') {
  router.post('/mock-payment/:gatewayRef/complete',
    webhookController.mockPaymentComplete.bind(webhookController)
  )
}

// Administrative endpoints (require authentication)
router.use(authenticate)

// Get webhook statistics (READ_ONLY+)
router.get('/admin/statistics',
  requireRole('READ_ONLY'),
  webhookController.getStatistics.bind(webhookController)
)

// Get webhook events with pagination (READ_ONLY+)
router.get('/admin/events',
  requireRole('READ_ONLY'),
  webhookController.getWebhookEvents.bind(webhookController)
)

module.exports = router
