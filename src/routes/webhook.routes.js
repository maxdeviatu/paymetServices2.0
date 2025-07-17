const express = require('express')
const router = express.Router()
const webhookController = require('../controllers/webhook.controller')
const { authenticate } = require('../middlewares/auth')
const { requireRole } = require('../middlewares/role')
const { webhookLimiter } = require('../middlewares/rateLimiter')
const { securityHeaders, logPublicRequest } = require('../middlewares/security')

// Apply security middleware to all webhook routes
router.use(securityHeaders)
router.use(logPublicRequest)
router.use(webhookLimiter)

// Custom raw body middleware for webhooks with size limit
const captureRawBody = (req, res, next) => {
  const MAX_BODY_SIZE = 10 * 1024 * 1024 // 10MB limit
  let rawBody = Buffer.alloc(0)
  let totalSize = 0
  
  req.on('data', (chunk) => {
    totalSize += chunk.length
    
    if (totalSize > MAX_BODY_SIZE) {
      const error = new Error('Webhook payload too large')
      error.status = 413
      return next(error)
    }
    
    rawBody = Buffer.concat([rawBody, chunk])
  })
  
  req.on('end', () => {
    req.rawBody = rawBody
    req.body = rawBody // Keep as Buffer for express.raw compatibility
    next()
  })
  
  req.on('error', (err) => {
    next(err)
  })
}

// Webhook validation middleware
const webhookMiddleware = (req, res, next) => {
  // Basic validation
  if (!req.rawBody || req.rawBody.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Empty webhook body'
    })
  }
  
  // Validate Content-Type
  const contentType = req.get('Content-Type')
  if (!contentType || !contentType.includes('application/json')) {
    return res.status(400).json({
      success: false,
      message: 'Invalid Content-Type, expected application/json'
    })
  }
  
  next()
}

// Endpoint principal of webhooks (no authentication required - verified by signature)
// Use custom raw body capture to preserve exact bytes for signature verification
router.post('/:provider',
  captureRawBody,
  webhookMiddleware,
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
