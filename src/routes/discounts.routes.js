const express = require('express')
const { body } = require('express-validator')
const router = express.Router()
const discountsController = require('../controllers/discounts.controller')
const { authenticate } = require('../middlewares/auth')
const { requireRole } = require('../middlewares/role')
const { validateRequest } = require('../middlewares/validator')

// Todas las rutas de descuentos requieren autenticación
router.use(authenticate)

// Validaciones para descuentos
const discountValidations = [
  body('name').isString().notEmpty().withMessage('El nombre es requerido'),
  body('amount').isInt({ min: 1 }).withMessage('El monto debe ser un número entero mayor a 0'),
  body('startDate').isISO8601().withMessage('La fecha de inicio debe ser una fecha válida'),
  body('endDate').isISO8601().withMessage('La fecha de fin debe ser una fecha válida'),
  body('isActive').optional().isBoolean().withMessage('isActive debe ser un valor booleano')
]

// Listado de descuentos (disponible para todos los roles)
router.get('/', discountsController.getDiscounts)
router.get('/:id', discountsController.getDiscountById)

// EDITOR puede crear y actualizar descuentos
router.post('/', 
  requireRole('EDITOR'),
  discountValidations,
  validateRequest,
  discountsController.createDiscount
)

router.put('/:id', 
  requireRole('EDITOR'),
  discountValidations,
  validateRequest,
  discountsController.updateDiscount
)

// EDITOR puede activar/desactivar descuentos
router.patch('/:id/status', 
  requireRole('EDITOR'),
  discountsController.toggleDiscountStatus
)

module.exports = router
