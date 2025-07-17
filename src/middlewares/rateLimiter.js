const rateLimit = require('express-rate-limit')
const slowDown = require('express-slow-down')
const logger = require('../config/logger')

/**
 * Custom key generator that handles trusted proxies safely
 * Uses X-Forwarded-For only for specific trusted proxy scenarios
 */
const generateKey = (req) => {
  // In production with reverse proxy, use the forwarded IP
  // In development or direct access, use the connection IP
  return req.ip || req.connection.remoteAddress || 'unknown'
}

/**
 * Rate limiter for order creation - Optimizado para alto volumen
 * Prevents abuse of the public order endpoint
 */
const orderCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.ORDER_RATE_LIMIT_MAX ? parseInt(process.env.ORDER_RATE_LIMIT_MAX) : 100, // Aumentado a 100 órdenes por IP
  keyGenerator: generateKey,
  message: {
    success: false,
    message: 'Demasiadas órdenes creadas desde esta IP. Intenta nuevamente en 15 minutos.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Skip para IPs confiables o usuarios autenticados
    const trustedIP = req.headers['x-trusted-ip'] === 'true'
    const isAuthenticated = req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
    const isWhitelistedIP = process.env.WHITELISTED_IPS && process.env.WHITELISTED_IPS.split(',').includes(req.ip)

    return trustedIP || isAuthenticated || isWhitelistedIP
  },
  handler: (req, res) => {
    logger.logError(new Error('Rate limit exceeded for order creation'), {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      currentLimit: req.rateLimit.limit,
      remaining: req.rateLimit.remaining
    })

    res.status(429).json({
      success: false,
      message: 'Demasiadas órdenes creadas desde esta IP. Intenta nuevamente en 15 minutos.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000),
      limit: req.rateLimit.limit,
      remaining: req.rateLimit.remaining
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
  keyGenerator: generateKey,
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
 * General API rate limiter - Optimizado para alto volumen
 * Applied to all public endpoints
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.GENERAL_RATE_LIMIT_MAX ? parseInt(process.env.GENERAL_RATE_LIMIT_MAX) : 500, // Aumentado a 500 requests por IP
  keyGenerator: generateKey,
  message: {
    success: false,
    message: 'Demasiadas solicitudes desde esta IP. Intenta nuevamente más tarde.',
    code: 'GENERAL_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for authenticated admin requests, trusted IPs, and health checks
    const isAuthenticated = req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
    const trustedIP = req.headers['x-trusted-ip'] === 'true'
    const isWhitelistedIP = process.env.WHITELISTED_IPS && process.env.WHITELISTED_IPS.split(',').includes(req.ip)
    const isHealthCheck = req.path === '/health' || req.path === '/api/health'

    return isAuthenticated || trustedIP || isWhitelistedIP || isHealthCheck
  },
  handler: (req, res) => {
    logger.logError(new Error('General rate limit exceeded'), {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      currentLimit: req.rateLimit.limit,
      remaining: req.rateLimit.remaining
    })

    res.status(429).json({
      success: false,
      message: 'Demasiadas solicitudes desde esta IP. Intenta nuevamente más tarde.',
      code: 'GENERAL_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000),
      limit: req.rateLimit.limit,
      remaining: req.rateLimit.remaining
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
    const delayAfter = req.slowDown.limit
    return (used - delayAfter) * 500
  },
  maxDelayMs: 20000, // max delay of 20 seconds
  skipFailedRequests: true,
  skipSuccessfulRequests: false,
  validate: { delayMs: false } // Disable warning
})

/**
 * Rate limiter for webhooks - Optimizado para alto volumen
 * More permissive but still protected
 */
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: process.env.WEBHOOK_RATE_LIMIT_MAX ? parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX) : 1000, // Aumentado a 1000 webhooks por minuto
  keyGenerator: generateKey,
  message: {
    success: false,
    message: 'Webhook rate limit exceeded',
    code: 'WEBHOOK_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip para IPs conocidos de proveedores de pago
    const knownProviderIPs = process.env.PAYMENT_PROVIDER_IPS
      ? process.env.PAYMENT_PROVIDER_IPS.split(',')
      : ['54.173.144.191'] // IP conocida de Cobre

    return knownProviderIPs.includes(req.ip)
  },
  handler: (req, res) => {
    logger.logError(new Error('Webhook rate limit exceeded'), {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      currentLimit: req.rateLimit.limit,
      remaining: req.rateLimit.remaining
    })

    res.status(429).json({
      success: false,
      message: 'Webhook rate limit exceeded',
      code: 'WEBHOOK_RATE_LIMIT_EXCEEDED',
      limit: req.rateLimit.limit,
      remaining: req.rateLimit.remaining
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
