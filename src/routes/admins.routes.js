const express = require('express')
const { body } = require('express-validator')
const router = express.Router()
const adminsController = require('../controllers/admins.controller')
const { authenticate } = require('../middlewares/auth')
const { requireRole } = require('../middlewares/role')
const { validateRequest } = require('../middlewares/validator')

// Ruta pública para login
router.post('/login', 
  [
    body('email').isEmail().withMessage('Debe proporcionar un email válido'),
    body('password').notEmpty().withMessage('La contraseña es requerida')
  ],
  validateRequest,
  adminsController.login
)

// Todas las demás rutas requieren autenticación como SUPER_ADMIN
router.use(authenticate)
router.use(requireRole('SUPER_ADMIN'))

// Validaciones para administradores
const adminValidations = [
  body('name').isString().notEmpty().withMessage('El nombre es requerido'),
  body('email').isEmail().withMessage('Debe proporcionar un email válido'),
  body('phone').optional().isString(),
  body('role').isIn(['READ_ONLY', 'EDITOR', 'SUPER_ADMIN']).withMessage('Rol no válido'),
  body('isActive').optional().isBoolean().withMessage('isActive debe ser un valor booleano')
]

// Validación adicional para la creación de administradores
const createAdminValidations = [
  ...adminValidations,
  body('passwordHash').isString().isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
]

// Listado y CRUD de administradores
router.get('/', adminsController.getAdmins)
router.get('/:id', adminsController.getAdminById)

router.post('/', 
  createAdminValidations,
  validateRequest,
  adminsController.createAdmin
)

router.put('/:id', 
  adminValidations,
  validateRequest,
  adminsController.updateAdmin
)

router.delete('/:id', adminsController.deleteAdmin)

// Restablecer contraseña
router.post('/:id/reset-password',
  [
    body('newPassword').isString().isLength({ min: 6 }).withMessage('La nueva contraseña debe tener al menos 6 caracteres')
  ],
  validateRequest,
  adminsController.resetPassword
)

module.exports = router
