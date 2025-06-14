const express = require('express')
const router = express.Router()
const webhookController = require('../controllers/webhook.controller')
const { webhookLimiter } = require('../middlewares/rateLimiter')
const { securityHeaders, logPublicRequest, sanitizeInput } = require('../middlewares/security')

// Apply security middleware to all webhook routes
router.use(securityHeaders)
router.use(logPublicRequest)
router.use(sanitizeInput)
router.use(webhookLimiter)

// Webhook endpoints (no authentication required - verified by signature)
router.post('/payment/:provider', webhookController.handlePaymentWebhook)

// Health check for webhooks
router.get('/payment/:provider/health', webhookController.webhookHealthCheck)

// Mock payment completion (for testing only)
if (process.env.NODE_ENV === 'development') {
  router.post('/mock-payment/:gatewayRef/complete', webhookController.mockPaymentComplete)
}

module.exports = router