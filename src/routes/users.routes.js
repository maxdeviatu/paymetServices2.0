const express = require('express')
const { body } = require('express-validator')
const router = express.Router()
const usersController = require('../controllers/users.controller')
const { authenticateUser } = require('../middlewares/auth')
const { validateRequest } = require('../middlewares/validator')
const { DOCUMENT_TYPES } = require('../models')

// Validaciones para creación de usuario
const createUserValidations = [
  body('firstName')
    .isString()
    .isLength({ min: 2, max: 80 })
    .withMessage('El nombre debe tener entre 2 y 80 caracteres'),
  body('lastName')
    .isString()
    .isLength({ min: 2, max: 80 })
    .withMessage('El apellido debe tener entre 2 y 80 caracteres'),
  body('phone')
    .optional()
    .isString()
    .isLength({ max: 20 })
    .withMessage('El teléfono no puede superar los 20 caracteres'),
  body('email')
    .isEmail()
    .isLength({ max: 120 })
    .withMessage('Debe proporcionar un email válido de máximo 120 caracteres'),
  body('documentType')
    .isIn(DOCUMENT_TYPES)
    .withMessage(`Tipo de documento debe ser uno de: ${DOCUMENT_TYPES.join(', ')}`),
  body('documentNumber')
    .isString()
    .isLength({ min: 1, max: 30 })
    .withMessage('El número de documento debe tener entre 1 y 30 caracteres'),
  body('birthDate')
    .optional()
    .isISO8601()
    .withMessage('La fecha de nacimiento debe ser una fecha válida'),
  body('consentAccepted')
    .isBoolean()
    .equals('true')
    .withMessage('Debe aceptar el consentimiento para crear la cuenta')
]

// Validaciones para solicitar OTP
const requestOtpValidations = [
  body('email')
    .isEmail()
    .withMessage('Debe proporcionar un email válido')
]

// Validaciones para verificar OTP
const verifyOtpValidations = [
  body('email')
    .isEmail()
    .withMessage('Debe proporcionar un email válido'),
  body('code')
    .isString()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('El código debe ser de 6 dígitos numéricos')
]

// Validaciones para actualizar perfil
const updateProfileValidations = [
  body('firstName')
    .optional()
    .isString()
    .isLength({ min: 2, max: 80 })
    .withMessage('El nombre debe tener entre 2 y 80 caracteres'),
  body('lastName')
    .optional()
    .isString()
    .isLength({ min: 2, max: 80 })
    .withMessage('El apellido debe tener entre 2 y 80 caracteres'),
  body('phone')
    .optional()
    .isString()
    .isLength({ max: 20 })
    .withMessage('El teléfono no puede superar los 20 caracteres'),
  body('birthDate')
    .optional()
    .isISO8601()
    .withMessage('La fecha de nacimiento debe ser una fecha válida')
]

// Rutas públicas (sin autenticación)
router.post('/register',
  createUserValidations,
  validateRequest,
  usersController.createUser
)

router.post('/request-otp',
  requestOtpValidations,
  validateRequest,
  usersController.requestOtp
)

router.post('/verify-otp',
  verifyOtpValidations,
  validateRequest,
  usersController.verifyOtp
)

// Rutas protegidas (requieren autenticación de usuario)
router.use(authenticateUser)

router.get('/profile', usersController.getUserProfile)

router.patch('/profile',
  updateProfileValidations,
  validateRequest,
  usersController.updateUserProfile
)

module.exports = router
