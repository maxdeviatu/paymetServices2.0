const { validationResult, param, body } = require('express-validator')

/**
 * Middleware para validar resultados de express-validator
 * Verifica si hay errores de validación y devuelve una respuesta de error si los hay
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Error de validación',
      errors: errors.array().map(error => ({
        field: error.param,
        message: error.msg
      }))
    })
  }
  next()
}

/**
 * Validaciones para transacciones
 */
const validateTransactionLookup = [
  param('transactionId')
    .isInt({ min: 1 })
    .withMessage('transactionId debe ser un número entero positivo'),
  validateRequest
]

const validateMultipleTransactions = [
  body('transactionIds')
    .optional()
    .isArray()
    .withMessage('transactionIds debe ser un array'),
  body('transactionIds.*')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Cada transactionId debe ser un número entero positivo'),
  body('status')
    .optional()
    .isIn(['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED'])
    .withMessage('status debe ser uno de: PENDING, PAID, FAILED, CANCELLED, EXPIRED'),
  body('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit debe ser entre 1 y 100'),
  validateRequest
]

module.exports = {
  validateRequest,
  validateTransactionLookup,
  validateMultipleTransactions
}
