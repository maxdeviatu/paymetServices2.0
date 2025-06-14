const { body, param, query, validationResult } = require('express-validator')
const logger = require('../config/logger')

/**
 * Validation middleware for order creation
 */
const validateOrderCreation = [
  // Product validation
  body('productRef')
    .notEmpty()
    .withMessage('productRef es requerido')
    .isLength({ min: 3, max: 50 })
    .withMessage('productRef debe tener entre 3 y 50 caracteres')
    .matches(/^[A-Z0-9-_]+$/)
    .withMessage('productRef solo puede contener letras mayúsculas, números, guiones y guiones bajos'),

  // Quantity validation
  body('qty')
    .isInt({ min: 1, max: 10 })
    .withMessage('qty debe ser un número entero entre 1 y 10'),

  // Customer validation
  body('customer.firstName')
    .notEmpty()
    .withMessage('firstName es requerido')
    .isLength({ min: 2, max: 80 })
    .withMessage('firstName debe tener entre 2 y 80 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
    .withMessage('firstName solo puede contener letras y espacios'),

  body('customer.lastName')
    .notEmpty()
    .withMessage('lastName es requerido')
    .isLength({ min: 2, max: 80 })
    .withMessage('lastName debe tener entre 2 y 80 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
    .withMessage('lastName solo puede contener letras y espacios'),

  body('customer.email')
    .isEmail()
    .withMessage('email debe ser válido')
    .normalizeEmail()
    .isLength({ max: 120 })
    .withMessage('email no puede exceder 120 caracteres'),

  body('customer.documentType')
    .isIn(['CC', 'CE', 'NIT', 'TI', 'PP'])
    .withMessage('documentType debe ser uno de: CC, CE, NIT, TI, PP'),

  body('customer.documentNumber')
    .notEmpty()
    .withMessage('documentNumber es requerido')
    .isLength({ min: 5, max: 30 })
    .withMessage('documentNumber debe tener entre 5 y 30 caracteres')
    .matches(/^[0-9A-Z-]+$/)
    .withMessage('documentNumber solo puede contener números, letras mayúsculas y guiones'),

  body('customer.phone')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('phone debe ser un número de teléfono válido con código de país'),

  body('customer.birthDate')
    .optional()
    .isISO8601({ strict: true })
    .withMessage('birthDate debe ser una fecha válida (YYYY-MM-DD)')
    .custom((value) => {
      const birthDate = new Date(value)
      const today = new Date()
      const age = today.getFullYear() - birthDate.getFullYear()
      
      if (age < 13 || age > 120) {
        throw new Error('La edad debe estar entre 13 y 120 años')
      }
      
      return true
    }),

  // Optional discount validation
  body('discountId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('discountId debe ser un número entero positivo')
]

/**
 * Validation middleware for payment initiation
 */
const validatePaymentInitiation = [
  param('orderId')
    .isInt({ min: 1 })
    .withMessage('orderId debe ser un número entero positivo'),

  body('provider')
    .optional()
    .isIn(['mock', 'epayco', 'cobre'])
    .withMessage('provider debe ser uno de: mock, epayco, cobre')
]

/**
 * Validation middleware for order lookup
 */
const validateOrderLookup = [
  param('orderId')
    .isInt({ min: 1 })
    .withMessage('orderId debe ser un número entero positivo')
]

/**
 * Validation middleware for customer orders lookup
 */
const validateCustomerOrdersLookup = [
  param('customerId')
    .isInt({ min: 1 })
    .withMessage('customerId debe ser un número entero positivo'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page debe ser un número entero positivo'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit debe ser un número entero entre 1 y 50'),

  query('status')
    .optional()
    .isIn(['PENDING', 'IN_PROCESS', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELED'])
    .withMessage('status debe ser uno de los estados válidos')
]

/**
 * Validation middleware for transaction status lookup
 */
const validateTransactionLookup = [
  param('transactionId')
    .isInt({ min: 1 })
    .withMessage('transactionId debe ser un número entero positivo')
]

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req)
  
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value
    }))

    logger.logError(new Error('Validation failed'), {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      method: req.method,
      errors: errorDetails,
      body: req.body
    })

    return res.status(400).json({
      success: false,
      message: 'Datos de entrada inválidos',
      errors: errorDetails
    })
  }

  next()
}

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
  // Remove server header
  res.removeHeader('X-Powered-By')
  
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  // CORS headers for public endpoints
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age', '86400') // 24 hours
  
  next()
}

/**
 * Request logging middleware for public endpoints
 */
const logPublicRequest = (req, res, next) => {
  const startTime = Date.now()
  
  // Log request
  logger.logBusiness('api:public.request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentLength: req.get('Content-Length'),
    timestamp: new Date().toISOString()
  })

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime
    
    logger.logBusiness('api:public.response', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      timestamp: new Date().toISOString()
    })
  })

  next()
}

/**
 * Input sanitization middleware
 */
const sanitizeInput = (req, res, next) => {
  // Recursively sanitize object
  const sanitizeObject = (obj) => {
    if (typeof obj === 'string') {
      // Remove potentially dangerous characters but preserve valid input
      return obj
        .trim()
        .replace(/[<>]/g, '') // Remove < and > to prevent XSS
        .substring(0, 1000) // Limit string length
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject)
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized = {}
      for (const [key, value] of Object.entries(obj)) {
        // Only allow alphanumeric keys with underscores and dots
        if (/^[a-zA-Z0-9_.]+$/.test(key)) {
          sanitized[key] = sanitizeObject(value)
        }
      }
      return sanitized
    }
    
    return obj
  }

  if (req.body) {
    req.body = sanitizeObject(req.body)
  }

  if (req.query) {
    req.query = sanitizeObject(req.query)
  }

  next()
}

module.exports = {
  validateOrderCreation,
  validatePaymentInitiation,
  validateOrderLookup,
  validateCustomerOrdersLookup,
  validateTransactionLookup,
  handleValidationErrors,
  securityHeaders,
  logPublicRequest,
  sanitizeInput
}