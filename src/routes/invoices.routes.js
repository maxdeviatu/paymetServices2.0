const express = require('express')
const router = express.Router()
const invoicesController = require('../controllers/invoices.controller')
const { authenticate } = require('../middlewares/auth')
const { requireRole } = require('../middlewares/role')

// Todas las rutas de facturas requieren autenticación
router.use(authenticate)

/**
 * @route GET /api/invoices
 * @desc Obtener todas las facturas con paginación y filtros
 * @access READ_ONLY+
 */
router.get('/',
  requireRole('READ_ONLY'),
  invoicesController.getAllInvoices
)

/**
 * @route GET /api/invoices/stats
 * @desc Obtener estadísticas de facturación
 * @access READ_ONLY+
 */
router.get('/stats',
  requireRole('READ_ONLY'),
  invoicesController.getInvoiceStats
)

/**
 * @route GET /api/invoices/:id
 * @desc Obtener una factura específica por ID
 * @access READ_ONLY+
 */
router.get('/:id',
  requireRole('READ_ONLY'),
  invoicesController.getInvoiceById
)

/**
 * @route POST /api/invoices/execute
 * @desc Ejecutar proceso de facturación para transacciones pendientes
 * @access EDITOR+
 */
router.post('/execute',
  requireRole('EDITOR'),
  invoicesController.executeInvoicing
)

/**
 * @route PUT /api/invoices/:id/status
 * @desc Actualizar estado de una factura consultando al proveedor
 * @access EDITOR+
 */
router.put('/:id/status',
  requireRole('EDITOR'),
  invoicesController.updateInvoiceStatus
)

/**
 * @route POST /api/invoices/fix-failed-status
 * @desc Corregir estados de transacciones con facturas generadas pero marcadas como FAILED
 * @access EDITOR+
 */
router.post('/fix-failed-status',
  requireRole('EDITOR'),
  invoicesController.fixFailedInvoiceStatus
)

module.exports = router
