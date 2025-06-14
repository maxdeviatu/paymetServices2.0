const orderService = require('../services/order.service')
const paymentService = require('../services/payment')
const logger = require('../config/logger')

/**
 * Create new order with customer auto-creation
 */
exports.createOrder = async (req, res) => {
  try {
    const { productRef, qty = 1, provider = 'mock', customer, shippingInfo } = req.body

    // Validate required fields
    if (!productRef) {
      return res.status(400).json({
        success: false,
        message: 'productRef is required'
      })
    }

    if (!customer) {
      return res.status(400).json({
        success: false,
        message: 'customer information is required'
      })
    }

    // Validate customer data
    if (!customer.email && !customer.documentNumber) {
      return res.status(400).json({
        success: false,
        message: 'Either email or documentNumber is required'
      })
    }

    // Create order
    const result = await orderService.createOrder({
      productRef,
      qty,
      provider,
      customer,
      shippingInfo
    })

    res.status(201).json({
      success: true,
      data: {
        orderId: result.order.id,
        customerId: result.customer.id,
        transactionId: result.transaction.id,
        productRef: result.order.productRef,
        qty: result.order.qty,
        subtotal: result.order.subtotal,
        discountTotal: result.order.discountTotal,
        taxTotal: result.order.taxTotal,
        grandTotal: result.order.grandTotal,
        currency: result.transaction.currency,
        status: result.order.status,
        provider: result.transaction.gateway
      },
      message: 'Order created successfully'
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'createOrder',
      body: req.body
    })

    res.status(400).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Create payment intent for order
 */
exports.payOrder = async (req, res) => {
  try {
    const { orderId } = req.params
    const { provider } = req.body

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'orderId is required'
      })
    }

    // Create payment intent
    const paymentIntent = await paymentService.createPaymentIntent(orderId, {
      provider
    })

    res.status(200).json({
      success: true,
      data: {
        transactionId: paymentIntent.transactionId,
        gatewayRef: paymentIntent.gatewayRef,
        paymentUrl: paymentIntent.redirectUrl,
        provider: paymentIntent.provider,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency
      },
      message: 'Payment intent created successfully'
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'payOrder',
      orderId: req.params.orderId,
      body: req.body
    })

    const statusCode = error.message === 'Order not found' ? 404 : 
                      error.message.includes('Cannot create payment') ? 409 : 400

    res.status(statusCode).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Get order by ID
 */
exports.getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params
    const includeCustomer = req.query.includeCustomer !== 'false'

    const order = await orderService.getOrderById(orderId, includeCustomer)

    res.status(200).json({
      success: true,
      data: {
        id: order.id,
        customerId: order.customerId,
        customer: includeCustomer ? {
          id: order.customer.id,
          firstName: order.customer.firstName,
          lastName: order.customer.lastName,
          email: order.customer.email
        } : undefined,
        product: {
          productRef: order.product.productRef,
          name: order.product.name,
          price: order.product.price,
          currency: order.product.currency,
          license_type: order.product.license_type
        },
        qty: order.qty,
        subtotal: order.subtotal,
        discountTotal: order.discountTotal,
        taxTotal: order.taxTotal,
        grandTotal: order.grandTotal,
        status: order.status,
        shippingInfo: order.shippingInfo,
        transactions: order.transactions.map(t => ({
          id: t.id,
          gateway: t.gateway,
          gatewayRef: t.gatewayRef,
          amount: t.amount,
          currency: t.currency,
          status: t.status,
          paymentMethod: t.paymentMethod,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt
        })),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      }
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'getOrderById',
      orderId: req.params.orderId
    })

    const statusCode = error.message === 'Order not found' ? 404 : 500

    res.status(statusCode).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Get orders by customer
 */
exports.getOrdersByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params
    const { page = 1, limit = 20, status } = req.query

    const result = await orderService.getOrdersByCustomer(customerId, {
      page: parseInt(page),
      limit: parseInt(limit),
      status
    })

    res.status(200).json({
      success: true,
      data: result.orders.map(order => ({
        id: order.id,
        productRef: order.productRef,
        product: {
          name: order.product.name,
          price: order.product.price,
          currency: order.product.currency
        },
        qty: order.qty,
        grandTotal: order.grandTotal,
        status: order.status,
        createdAt: order.createdAt,
        transactions: order.transactions.map(t => ({
          id: t.id,
          gateway: t.gateway,
          status: t.status,
          amount: t.amount,
          currency: t.currency
        }))
      })),
      pagination: result.pagination
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'getOrdersByCustomer',
      customerId: req.params.customerId,
      query: req.query
    })

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Cancel order
 */
exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params
    const { reason = 'MANUAL' } = req.body

    const order = await orderService.cancelOrder(orderId, reason)

    res.status(200).json({
      success: true,
      data: {
        id: order.id,
        status: order.status,
        canceledAt: order.updatedAt
      },
      message: 'Order canceled successfully'
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'cancelOrder',
      orderId: req.params.orderId,
      body: req.body
    })

    const statusCode = error.message === 'Order not found' ? 404 :
                      error.message.includes('Cannot cancel') ? 409 : 400

    res.status(statusCode).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Get transaction status
 */
exports.getTransactionStatus = async (req, res) => {
  try {
    const { transactionId } = req.params

    const transaction = await paymentService.getTransactionStatus(transactionId)

    res.status(200).json({
      success: true,
      data: transaction
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'getTransactionStatus',
      transactionId: req.params.transactionId
    })

    const statusCode = error.message === 'Transaction not found' ? 404 : 500

    res.status(statusCode).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Get all orders (Admin only)
 */
exports.getAllOrders = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      customerId, 
      productRef,
      startDate,
      endDate 
    } = req.query

    const result = await orderService.getAllOrders({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      customerId: customerId ? parseInt(customerId) : undefined,
      productRef,
      startDate,
      endDate
    })

    res.status(200).json({
      success: true,
      data: result.orders.map(order => ({
        id: order.id,
        customerId: order.customerId,
        customer: {
          id: order.customer.id,
          firstName: order.customer.firstName,
          lastName: order.customer.lastName,
          email: order.customer.email
        },
        productRef: order.productRef,
        product: {
          name: order.product.name,
          price: order.product.price,
          currency: order.product.currency
        },
        qty: order.qty,
        subtotal: order.subtotal,
        discountTotal: order.discountTotal,
        grandTotal: order.grandTotal,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        transactions: order.transactions.map(t => ({
          id: t.id,
          gateway: t.gateway,
          status: t.status,
          amount: t.amount,
          currency: t.currency
        }))
      })),
      pagination: result.pagination
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'getAllOrders',
      query: req.query
    })

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Update order status (Admin only)
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params
    const { status } = req.body

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status is required'
      })
    }

    const validStatuses = ['PENDING', 'IN_PROCESS', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELED']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${validStatuses.join(', ')}`
      })
    }

    const order = await orderService.updateOrderStatus(orderId, status)

    res.status(200).json({
      success: true,
      data: {
        id: order.id,
        status: order.status,
        updatedAt: order.updatedAt
      },
      message: 'Order status updated successfully'
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'updateOrderStatus',
      orderId: req.params.orderId,
      body: req.body
    })

    const statusCode = error.message === 'Order not found' ? 404 :
                      error.message.includes('Cannot update') ? 409 : 400

    res.status(statusCode).json({
      success: false,
      message: error.message
    })
  }
}