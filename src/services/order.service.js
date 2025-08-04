const { Order, Transaction, Product, User, License, sequelize } = require('../models')
const { Op } = require('sequelize')
const logger = require('../config/logger')
const userService = require('./user.service')
const TransactionManager = require('../utils/transactionManager')

/**
 * Create order with auto user creation and transaction
 */
async function createOrder (orderData) {
  try {
    logger.logBusiness('order:create', {
      productRef: orderData.productRef,
      qty: orderData.qty,
      provider: orderData.provider,
      customerEmail: orderData.customer?.email
    })

    return await TransactionManager.executePaymentTransaction(async (t) => {
      // 1. Get or create customer
      let customerId
      if (orderData.customer) {
        customerId = await getOrCreateCustomer(orderData.customer, t)
      } else {
        throw new Error('Customer information is required')
      }

      // 2. Get product and validate
      const product = await Product.findOne({
        where: { productRef: orderData.productRef },
        include: [{ association: 'discount' }],
        transaction: t
      })

      if (!product) {
        throw new Error(`Product with reference ${orderData.productRef} not found`)
      }

      if (!product.isActive) {
        throw new Error(`Product ${orderData.productRef} is not available`)
      }

      // 3. Calculate totals
      const qty = orderData.qty || 1
      const subtotal = product.price * qty

      let discountTotal = 0
      if (product.hasDiscount && product.discount) {
        const now = new Date()
        if (product.discount.isActive &&
            product.discount.startDate <= now &&
            product.discount.endDate >= now) {
          discountTotal = Math.floor((subtotal * product.discount.amount) / 100)
        }
      }

      // Simple tax calculation (can be enhanced)
      const taxTotal = 0 // TODO: implement tax calculation based on customer location
      const grandTotal = subtotal - discountTotal + taxTotal

      // 4. Create order
      const order = await Order.create({
        customerId,
        productRef: orderData.productRef,
        qty,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        status: 'PENDING',
        shippingInfo: orderData.shippingInfo || null
      }, { transaction: t })

      // 5. Create initial transaction
      const transaction = await Transaction.create({
        orderId: order.id,
        gateway: orderData.provider || 'mock',
        gatewayRef: `temp-${order.id}-${Date.now()}`, // Will be updated when payment intent is created
        amount: grandTotal,
        currency: product.currency || 'USD',
        status: 'CREATED'
      }, { transaction: t })

      logger.logBusiness('order:create.success', {
        orderId: order.id,
        customerId,
        transactionId: transaction.id,
        grandTotal
      })

      return {
        order,
        transaction,
        customer: { id: customerId }
      }
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'createOrder',
      productRef: orderData.productRef,
      customerEmail: orderData.customer?.email
    })
    throw error
  }
}

/**
 * Get or create customer from order data
 */
async function getOrCreateCustomer (customerData, transaction) {
  const { email, documentType, documentNumber, firstName, lastName, phone } = customerData

  if (!email && !documentNumber) {
    throw new Error('Either email or documentNumber is required')
  }

  // Try to find existing user
  let user = null

  if (email) {
    user = await User.findOne({
      where: { email },
      transaction
    })
  }

  if (!user && documentType && documentNumber) {
    user = await User.findOne({
      where: {
        document_type: documentType,
        document_number: documentNumber
      },
      transaction
    })
  }

  // If user exists, return their ID
  if (user) {
    logger.logBusiness('customer:found', {
      userId: user.id,
      email: user.email
    })
    return user.id
  }

  // Create new user
  if (!firstName || !lastName) {
    throw new Error('firstName and lastName are required for new customers')
  }

  if (!email) {
    throw new Error('Email is required for new customers')
  }

  const newUser = await User.create({
    first_name: firstName,
    last_name: lastName,
    email: email.toLowerCase(),
    document_type: documentType || 'CC',
    document_number: documentNumber || `AUTO-${Date.now()}`,
    phone,
    birth_date: null,
    consent_accepted: true // Auto-accept for order flow
  }, { transaction })

  logger.logBusiness('customer:created', {
    userId: newUser.id,
    email: newUser.email
  })

  return newUser.id
}

/**
 * Get order by ID with all relations
 */
async function getOrderById (orderId, includeCustomer = true) {
  try {
    const include = [
      { association: 'product' },
      { association: 'transactions' }
    ]

    if (includeCustomer) {
      include.push({ association: 'customer' })
    }

    const order = await Order.findByPk(orderId, { include })

    if (!order) {
      throw new Error('Order not found')
    }

    return order
  } catch (error) {
    logger.logError(error, {
      operation: 'getOrderById',
      orderId
    })
    throw error
  }
}

/**
 * Update order status
 */
async function updateOrderStatus (orderId, status, transaction = null) {
  try {
    logger.logBusiness('order:statusUpdate', { orderId, status })

    const options = transaction ? { transaction } : {}

    const [updatedRows] = await Order.update(
      { status },
      {
        where: { id: orderId },
        ...options
      }
    )

    if (updatedRows === 0) {
      throw new Error('Order not found or not updated')
    }

    logger.logBusiness('order:statusUpdate.success', { orderId, status })

    return true
  } catch (error) {
    logger.logError(error, {
      operation: 'updateOrderStatus',
      orderId,
      status
    })
    throw error
  }
}

/**
 * Get orders by customer ID
 */
async function getOrdersByCustomer (customerId, options = {}) {
  try {
    const { page = 1, limit = 20, status } = options
    const offset = (page - 1) * limit

    const where = { customerId }
    if (status) {
      where.status = status
    }

    const { count, rows } = await Order.findAndCountAll({
      where,
      include: [
        { association: 'product' },
        { association: 'transactions' }
      ],
      offset,
      limit,
      order: [['createdAt', 'DESC']]
    })

    return {
      orders: rows,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    }
  } catch (error) {
    logger.logError(error, {
      operation: 'getOrdersByCustomer',
      customerId,
      options
    })
    throw error
  }
}

/**
 * Cancel order (timeout or manual)
 */
async function cancelOrder (orderId, reason = 'MANUAL') {
  try {
    logger.logBusiness('order:cancel', { orderId, reason })

    return await TransactionManager.executePaymentTransaction(async (t) => {
      const order = await Order.findByPk(orderId, {
        include: [{ association: 'transactions' }],
        lock: t.LOCK.UPDATE,
        transaction: t
      })

      if (!order) {
        throw new Error('Order not found')
      }

      if (!['PENDING', 'IN_PROCESS'].includes(order.status)) {
        throw new Error(`Cannot cancel order with status ${order.status}`)
      }

      // Update order status
      await order.update({ status: 'CANCELED' }, { transaction: t })

      // Update all transactions to FAILED
      await Transaction.update(
        { status: 'FAILED' },
        {
          where: { orderId },
          transaction: t
        }
      )

      // TODO: Return any reserved licenses
      // This will be implemented when we integrate with license service

      logger.logBusiness('order:cancel.success', { orderId, reason })

      return order
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'cancelOrder',
      orderId,
      reason
    })
    throw error
  }
}

/**
 * Get all orders with filters and pagination (Admin only)
 */
async function getAllOrders (options = {}) {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      customerId,
      productRef,
      startDate,
      endDate
    } = options

    logger.logBusiness('order:getAll', {
      page,
      limit,
      status,
      customerId,
      productRef,
      startDate,
      endDate
    })

    const offset = (page - 1) * limit
    const where = {}

    // Apply filters
    if (status) {
      where.status = status
    }
    if (customerId) {
      where.customerId = customerId
    }
    if (productRef) {
      where.productRef = productRef
    }
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) {
        where.createdAt[Op.gte] = new Date(startDate)
      }
      if (endDate) {
        where.createdAt[Op.lte] = new Date(endDate)
      }
    }

    const { count, rows } = await Order.findAndCountAll({
      where,
      include: [
        { association: 'product' },
        { association: 'transactions' },
        { association: 'customer' }
      ],
      offset,
      limit,
      order: [['createdAt', 'DESC']]
    })

    logger.logBusiness('order:getAll.success', {
      total: count,
      page,
      limit,
      returned: rows.length,
      filters: { status, customerId, productRef, startDate, endDate }
    })

    return {
      orders: rows,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    }
  } catch (error) {
    logger.logError(error, {
      operation: 'getAllOrders',
      options
    })
    throw error
  }
}

/**
 * Revive a canceled order by assigning license and completing it
 * @param {number} orderId - Order ID to revive
 * @param {string} reason - Reason for revival
 * @param {number} adminId - Admin ID making the change
 * @returns {Promise<Object>} - Revival result
 */
async function reviveOrder (orderId, reason = 'MANUAL', adminId = null) {
  try {
    logger.logBusiness('order:revive', { orderId, reason, adminId })

    // 1. Encontrar la orden (sin transacción primero)
    const order = await Order.findByPk(orderId, {
      include: [
        { association: 'product' },
        { association: 'customer' },
        { association: 'transactions' }
      ]
    })

    if (!order) {
      throw new Error('Order not found')
    }

    // Validar que la orden esté cancelada
    if (order.status !== 'CANCELED') {
      throw new Error(`Cannot revive order with status ${order.status}. Order must be CANCELED`)
    }

    // 2. Validar que la orden tenga una transacción asignada
    if (!order.transactions || order.transactions.length === 0) {
      throw new Error('Order has no transactions assigned')
    }

    // 3. Comprobar la transacción (buscar una transacción válida)
    const validTransaction = order.transactions.find(tx => 
      ['CREATED', 'PENDING', 'PAID', 'FAILED'].includes(tx.status)
    )

    if (!validTransaction) {
      throw new Error('No valid transaction found for this order')
    }

    // 4. Identificar que licencia busca el usuario y asignar una disponible
    let licenseResult = null
    if (order.product && order.product.license_type) {
      // Buscar licencia disponible
      const availableLicense = await License.findOne({
        where: {
          productRef: order.productRef,
          status: 'AVAILABLE'
        }
      })

      if (!availableLicense) {
        throw new Error(`No available licenses for product ${order.productRef}`)
      }

      licenseResult = availableLicense
    }

    // 5. Ejecutar transacción para actualizar todo
    const result = await TransactionManager.executeWebhookTransaction(async (t) => {
      // Asignar licencia si existe
      if (licenseResult) {
        await licenseResult.update({
          status: 'SOLD',
          orderId: order.id,
          soldAt: new Date()
        }, { transaction: t })

        logger.logBusiness('order:revive.licenseAssigned', {
          orderId: order.id,
          licenseId: licenseResult.id,
          productRef: order.productRef
        })
      }

      // Actualizar orden
      await order.update({
        status: 'COMPLETED',
        meta: {
          ...order.meta,
          revived: {
            revivedAt: new Date().toISOString(),
            reason: reason,
            adminId: adminId,
            emailSent: false,
            licenseAssigned: !!licenseResult
          }
        }
      }, { transaction: t })

      // Actualizar transacción
      await validTransaction.update({
        status: 'PAID',
        meta: {
          ...validTransaction.meta,
          revived: {
            revivedAt: new Date().toISOString(),
            reason: reason,
            adminId: adminId
          }
        }
      }, { transaction: t })

      return {
        success: true,
        orderId: order.id,
        transactionId: validTransaction.id,
        status: 'COMPLETED',
        licenseAssigned: !!licenseResult,
        emailSent: false,
        revivedAt: new Date().toISOString(),
        reason: reason,
        adminId: adminId,
        customer: order.customer,
        product: order.product,
        license: licenseResult
      }
    })

    // 6. Enviar correo con la licencia (FUERA de la transacción)
    let emailSent = false
    if (result.license) {
      try {
        const emailService = require('./email')
        await emailService.sendLicenseEmail({
          customer: result.customer,
          product: result.product,
          license: result.license,
          order: { 
            id: result.orderId,
            createdAt: new Date() // Usar fecha actual para ordenes revividas
          }
        })
        emailSent = true

        logger.logBusiness('order:revive.emailSent', {
          orderId: result.orderId,
          customerEmail: result.customer.email,
          licenseId: result.license.id
        })
      } catch (emailError) {
        logger.logError(emailError, {
          operation: 'reviveOrder.sendEmail',
          orderId: result.orderId,
          customerEmail: result.customer?.email
        })
        // No fallar si el email no se puede enviar
      }
    }

    // 7. Actualizar metadata con el detalle de revivida y correo
    await Order.update({
      meta: {
        revived: {
          revivedAt: result.revivedAt,
          reason: result.reason,
          adminId: result.adminId,
          emailSent: emailSent,
          licenseAssigned: result.licenseAssigned
        }
      }
    }, {
      where: { id: result.orderId }
    })

    result.emailSent = emailSent

    logger.logBusiness('order:revive.success', {
      orderId: result.orderId,
      emailSent: emailSent,
      licenseAssigned: result.licenseAssigned
    })

    return result
  } catch (error) {
    logger.logError(error, {
      operation: 'reviveOrder',
      orderId,
      reason,
      adminId
    })
    throw error
  }
}

module.exports = {
  createOrder,
  getOrderById,
  updateOrderStatus,
  getOrdersByCustomer,
  cancelOrder,
  getOrCreateCustomer,
  getAllOrders,
  reviveOrder
}
