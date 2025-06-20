const express = require('express')
const router = express.Router()
const ordersController = require('../controllers/orders.controller')
const { authenticate } = require('../middlewares/auth')
const { requireRole } = require('../middlewares/role')
const {
  orderCreationLimiter,
  paymentLimiter,
  orderLookupSlowDown
} = require('../middlewares/rateLimiter')
const {
  validateOrderCreation,
  validatePaymentInitiation,
  validateOrderLookup,
  validateCustomerOrdersLookup,
  validateTransactionLookup,
  handleValidationErrors,
  securityHeaders,
  logPublicRequest,
  sanitizeInput
} = require('../middlewares/security')

// Apply security middleware to all routes
router.use(securityHeaders)
router.use(logPublicRequest)
router.use(sanitizeInput)

// Public order creation (no auth required for customer orders)
router.post('/',
  orderCreationLimiter,
  validateOrderCreation,
  handleValidationErrors,
  ordersController.createOrder
)

// Payment initiation (no auth required)
router.post('/:orderId/payment',
  paymentLimiter,
  validatePaymentInitiation,
  handleValidationErrors,
  ordersController.payOrder
)

// Public order lookup (customers need to access their orders)
router.get('/:orderId',
  orderLookupSlowDown,
  validateOrderLookup,
  handleValidationErrors,
  ordersController.getOrderById
)

// Customer order history (no auth required, filtering by customerId in query)
router.get('/customer/:customerId',
  orderLookupSlowDown,
  validateCustomerOrdersLookup,
  handleValidationErrors,
  ordersController.getOrdersByCustomer
)

// Transaction status check (no auth required)
router.get('/transactions/:transactionId/status',
  validateTransactionLookup,
  handleValidationErrors,
  ordersController.getTransactionStatus
)

// Administrative endpoints require authentication
router.use(authenticate)

// Admin: List all orders with filters
router.get('/', requireRole('READ_ONLY'), ordersController.getAllOrders)

// Admin: Update order status
router.put('/:orderId/status',
  requireRole('EDITOR'),
  validateOrderLookup,
  handleValidationErrors,
  ordersController.updateOrderStatus
)

// Admin: Cancel order (EDITOR+ role required)
router.post('/:orderId/cancel',
  requireRole('EDITOR'),
  validateOrderLookup,
  handleValidationErrors,
  ordersController.cancelOrder
)

module.exports = router
