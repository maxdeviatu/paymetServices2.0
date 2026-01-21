const express = require('express')
const { body } = require('express-validator')
const multer = require('multer')
const router = express.Router()
const productsController = require('../controllers/products.controller')
const { authenticate } = require('../middlewares/auth')
const { requireRole } = require('../middlewares/role')
const { validateRequest } = require('../middlewares/validator')

// Configure multer for memory storage (CSV files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true)
    } else {
      cb(new Error('Solo se permiten archivos CSV'), false)
    }
  }
})

// Validaciones para productos
const productValidations = [
  body('name').isString().notEmpty().withMessage('El nombre es requerido'),
  body('productRef').isString().notEmpty().withMessage('La referencia es requerida'),
  body('price').isInt({ min: 1 }).withMessage('El precio debe ser un número entero mayor a 0'),
  body('description').optional().isString(),
  body('features').optional().isString(),
  body('image').optional().isURL().withMessage('La imagen debe ser una URL válida'),
  body('provider').optional().isString(),
  body('license_type').optional().isBoolean().withMessage('El tipo de licencia debe ser un valor booleano')
]

// Rutas públicas
router.get('/', productsController.getProducts)
router.get('/:id', productsController.getProductById)
router.get('/ref/:productRef', productsController.getProductByRef)

// Rutas protegidas - requieren autenticación
router.use(authenticate)

// READ_ONLY puede ver todos los productos (activos e inactivos)
router.get('/all', requireRole('READ_ONLY'), productsController.getAllProducts)

// EDITOR puede crear y editar productos
router.post('/',
  requireRole('EDITOR'),
  productValidations,
  validateRequest,
  productsController.createProduct
)

// Bulk upload productos desde CSV - requiere EDITOR
router.post('/upload',
  requireRole('EDITOR'),
  upload.single('file'),
  productsController.bulkUpload
)

router.put('/:id',
  requireRole('EDITOR'),
  productValidations,
  validateRequest,
  productsController.updateProduct
)

// EDITOR puede cambiar estado y vincular descuentos
router.patch('/:id/status',
  requireRole('EDITOR'),
  productsController.toggleProductStatus
)

router.patch('/:id/discount',
  requireRole('EDITOR'),
  [
    body('discountId')
      .optional({ nullable: true })
      .isInt().withMessage('El ID del descuento debe ser un número entero')
  ],
  validateRequest,
  productsController.updateProductDiscount
)

// SUPER_ADMIN puede eliminar productos
router.delete('/:id',
  requireRole('SUPER_ADMIN'),
  productsController.deleteProduct
)

module.exports = router
