const rateLimit = require('express-rate-limit')
const slowDown = require('express-slow-down')
const logger = require('../config/logger')

/**
 * Rate limiter for order creation
 * Prevents abuse of the public order endpoint
 */
const orderCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 order creation requests per windowMs
  message: {
    success: false,
    message: 'Demasiadas órdenes creadas desde esta IP. Intenta nuevamente en 15 minutos.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.logError(new Error('Rate limit exceeded for order creation'), {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    })
    
    res.status(429).json({
      success: false,
      message: 'Demasiadas órdenes creadas desde esta IP. Intenta nuevamente en 15 minutos.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    })
  }
})

/**
 * Rate limiter for payment initiation
 * More restrictive than order creation
 */
const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // limit each IP to 5 payment requests per windowMs
  message: {
    success: false,
    message: 'Demasiados intentos de pago desde esta IP. Intenta nuevamente en 5 minutos.',
    code: 'PAYMENT_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.logError(new Error('Rate limit exceeded for payment initiation'), {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      orderId: req.params.orderId
    })
    
    res.status(429).json({
      success: false,
      message: 'Demasiados intentos de pago desde esta IP. Intenta nuevamente en 5 minutos.',
      code: 'PAYMENT_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    })
  }
})

/**
 * General API rate limiter
 * Applied to all public endpoints
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Demasiadas solicitudes desde esta IP. Intenta nuevamente más tarde.',
    code: 'GENERAL_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for authenticated admin requests
    return req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
  },
  handler: (req, res) => {
    logger.logError(new Error('General rate limit exceeded'), {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    })
    
    res.status(429).json({
      success: false,
      message: 'Demasiadas solicitudes desde esta IP. Intenta nuevamente más tarde.',
      code: 'GENERAL_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    })
  }
})

/**
 * Slow down middleware for order lookup
 * Gradually increases delay for repeated requests
 */
const orderLookupSlowDown = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 5, // allow 5 requests per windowMs without delay
  delayMs: (used, req) => {
    // Add 500ms of delay per request after delayAfter
    const delayAfter = req.slowDown.limit;
    return (used - delayAfter) * 500;
  },
  maxDelayMs: 20000, // max delay of 20 seconds
  skipFailedRequests: true,
  skipSuccessfulRequests: false,
  validate: { delayMs: false } // Disable warning
})

/**
 * Rate limiter for webhooks
 * More permissive but still protected
 */
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50, // allow up to 50 webhook calls per minute per IP
  message: {
    success: false,
    message: 'Webhook rate limit exceeded',
    code: 'WEBHOOK_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.logError(new Error('Webhook rate limit exceeded'), {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    })
    
    res.status(429).json({
      success: false,
      message: 'Webhook rate limit exceeded',
      code: 'WEBHOOK_RATE_LIMIT_EXCEEDED'
    })
  }
})

module.exports = {
  orderCreationLimiter,
  paymentLimiter,
  generalLimiter,
  orderLookupSlowDown,
  webhookLimiter
}