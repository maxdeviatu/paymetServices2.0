const express = require('express')
const router = express.Router()
const webhookController = require('../controllers/webhook.controller')
const { authenticate } = require('../middlewares/auth')
const { requireRole } = require('../middlewares/role')
const { webhookLimiter } = require('../middlewares/rateLimiter')
const { securityHeaders, logPublicRequest } = require('../middlewares/security')
const logger = require('../config/logger')

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

    // Parse body based on content type
    const contentType = req.get('Content-Type')
    const provider = req.params.provider

    if (provider === 'epayco') {
      // ePayco sends form-urlencoded data, parse it
      try {
        const formData = rawBody.toString('utf8')
        const parsedBody = {}

        // Parse form-urlencoded data
        formData.split('&').forEach(pair => {
          const [key, value] = pair.split('=')
          if (key && value !== undefined) {
            parsedBody[decodeURIComponent(key)] = decodeURIComponent(value)
          }
        })

        req.body = parsedBody
      } catch (error) {
        logger.error('Error parsing ePayco form data', {
          error: error.message,
          rawBody: rawBody.toString('utf8')
        })
        req.body = {}
      }
    } else {
      // Other providers send JSON
      req.body = rawBody // Keep as Buffer for express.raw compatibility
    }

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

  // Validate Content-Type - ePayco sends form-urlencoded, others send JSON
  const contentType = req.get('Content-Type')
  const provider = req.params.provider

  if (provider === 'epayco') {
    // ePayco sends form-urlencoded data
    if (!contentType || !contentType.includes('application/x-www-form-urlencoded')) {
      logger.warn('EPayco webhook: Unexpected Content-Type', {
        contentType,
        expected: 'application/x-www-form-urlencoded'
      })
      // Continue anyway, as some ePayco webhooks might use different content types
    }
  } else {
    // Other providers send JSON
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Content-Type, expected application/json'
      })
    }
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
