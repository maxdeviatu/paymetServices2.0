const { Transaction, Order, sequelize } = require('../../models')
const { Op } = require('sequelize')
const logger = require('../../config/logger')
const emailService = require('../email')

// Payment providers
const MockProvider = require('./providers/mock')
// const EPaycoProvider = require('./providers/epayco')
// const CobreProvider = require('./providers/cobre')

/**
 * Payment service factory and orchestrator
 */
class PaymentService {
  constructor() {
    this.providers = {
      mock: new MockProvider()
      // epayco: new EPaycoProvider(),
      // cobre: new CobreProvider()
    }
  }

  /**
   * Get payment provider instance
   */
  getProvider(providerName) {
    const provider = this.providers[providerName]
    if (!provider) {
      throw new Error(`Payment provider '${providerName}' not supported`)
    }
    return provider
  }

  /**
   * Create payment intent for order
   */
  async createPaymentIntent(orderId, options = {}) {
    try {
      logger.logBusiness('payment:createIntent', { orderId, options })

      return await sequelize.transaction(async (t) => {
        // Get order with transactions
        const order = await Order.findByPk(orderId, {
          include: [
            { 
              association: 'transactions',
              where: { status: { [Op.in]: ['CREATED', 'PENDING'] } },
              required: false
            },
            { association: 'product' }
          ],
          lock: t.LOCK.UPDATE,
          transaction: t
        })

        if (!order) {
          throw new Error('Order not found')
        }

        if (order.status !== 'PENDING') {
          throw new Error(`Cannot create payment intent for order with status ${order.status}`)
        }

        // Find or create transaction
        let transaction = order.transactions?.[0]
        
        if (!transaction) {
          // Create new transaction if none exists
          transaction = await Transaction.create({
            orderId: order.id,
            gateway: options.provider || 'mock',
            gatewayRef: `temp-${order.id}-${Date.now()}`,
            amount: order.grandTotal,
            currency: order.product?.currency || 'USD',
            status: 'CREATED'
          }, { transaction: t })
        }

        // Get payment provider
        const provider = this.getProvider(transaction.gateway)

        // Create payment intent with provider
        const intentResult = await provider.createIntent({ order, transaction })

        // Update transaction with gateway reference
        await transaction.update({
          gatewayRef: intentResult.gatewayRef,
          status: 'PENDING',
          meta: intentResult.meta || {}
        }, { transaction: t })

        logger.logBusiness('payment:createIntent.success', {
          orderId,
          transactionId: transaction.id,
          gatewayRef: intentResult.gatewayRef,
          provider: transaction.gateway
        })

        return {
          transactionId: transaction.id,
          gatewayRef: intentResult.gatewayRef,
          redirectUrl: intentResult.redirectUrl,
          provider: transaction.gateway,
          amount: transaction.amount,
          currency: transaction.currency
        }
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'createPaymentIntent',
        orderId,
        options
      })
      throw error
    }
  }

  /**
   * Process webhook from payment provider
   */
  async processWebhook(providerName, req) {
    try {
      logger.logBusiness('payment:webhook.received', { 
        provider: providerName,
        headers: req.headers,
        bodyPreview: JSON.stringify(req.body).substring(0, 200)
      })

      // Get provider and parse webhook
      const provider = this.getProvider(providerName)
      const webhookData = provider.parseWebhook(req)

      return await sequelize.transaction(async (t) => {
        // Find transaction by gateway reference
        const transaction = await Transaction.findOne({
          where: {
            gateway: providerName,
            gatewayRef: webhookData.gatewayRef
          },
          include: [{ 
            association: 'order',
            include: [
              { association: 'product' },
              { association: 'customer' }
            ]
          }],
          lock: t.LOCK.UPDATE,
          transaction: t
        })

        if (!transaction) {
          logger.logError(new Error('Transaction not found for webhook'), {
            provider: providerName,
            gatewayRef: webhookData.gatewayRef
          })
          return { status: 'ignored', reason: 'transaction_not_found' }
        }

        // Check if already processed (idempotency)
        if (transaction.status === 'PAID' && webhookData.status === 'PAID') {
          logger.logBusiness('payment:webhook.duplicate', {
            transactionId: transaction.id,
            gatewayRef: webhookData.gatewayRef
          })
          return { status: 'duplicate', transactionId: transaction.id }
        }

        // Update transaction status
        const oldStatus = transaction.status
        await transaction.update({
          status: this.mapWebhookStatus(webhookData.status),
          paymentMethod: webhookData.paymentMethod,
          meta: {
            ...transaction.meta,
            webhook: webhookData,
            lastWebhookAt: new Date().toISOString()
          }
        }, { transaction: t })

        // Handle status-specific logic
        if (webhookData.status === 'PAID' && oldStatus !== 'PAID') {
          await this.handlePaymentSuccess(transaction, t)
        } else if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(webhookData.status)) {
          await this.handlePaymentFailure(transaction, t)
        }

        logger.logBusiness('payment:webhook.processed', {
          transactionId: transaction.id,
          orderId: transaction.order.id,
          oldStatus,
          newStatus: transaction.status,
          gatewayRef: webhookData.gatewayRef
        })

        return {
          status: 'processed',
          transactionId: transaction.id,
          orderId: transaction.order.id,
          newStatus: transaction.status
        }
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'processWebhook',
        provider: providerName,
        body: req.body
      })
      throw error
    }
  }

  /**
   * Handle successful payment
   */
  async handlePaymentSuccess(transaction, dbTransaction) {
    try {
      const order = transaction.order

      // Update order status to IN_PROCESS
      await order.update({
        status: 'IN_PROCESS'
      }, { transaction: dbTransaction })

      // Send order confirmation email
      try {
        await emailService.sendOrderConfirmation({
          customer: order.customer,
          product: order.product,
          order,
          transaction
        })
      } catch (emailError) {
        logger.logError(emailError, {
          operation: 'sendOrderConfirmation',
          orderId: order.id
        })
        // Don't fail the payment process for email errors
      }

      // If product has licenses, start fulfillment process
      if (order.product && order.product.license_type) {
        const license = await this.reserveLicenseForOrder(order, dbTransaction)
        
        // For digital products, complete immediately and send license
        await order.update({
          status: 'COMPLETED'
        }, { transaction: dbTransaction })

        // Send license email after transaction commits
        setImmediate(async () => {
          try {
            await emailService.sendLicenseEmail({
              customer: order.customer,
              product: order.product,
              license,
              order
            })
          } catch (emailError) {
            logger.logError(emailError, {
              operation: 'sendLicenseEmail',
              orderId: order.id,
              licenseId: license.id
            })
          }
        })
      }

      logger.logBusiness('payment:success.handled', {
        orderId: order.id,
        transactionId: transaction.id,
        hasLicense: order.product?.license_type || false
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'handlePaymentSuccess',
        transactionId: transaction.id,
        orderId: transaction.order.id
      })
      throw error
    }
  }

  /**
   * Handle payment failure
   */
  async handlePaymentFailure(transaction, dbTransaction) {
    try {
      const order = transaction.order

      // Check if there are other pending transactions
      const otherTransactions = await Transaction.findAll({
        where: {
          orderId: order.id,
          id: { [Op.ne]: transaction.id },
          status: { [Op.in]: ['CREATED', 'PENDING'] }
        },
        transaction: dbTransaction
      })

      // If no other pending transactions, cancel the order
      if (otherTransactions.length === 0) {
        await order.update({
          status: 'CANCELED'
        }, { transaction: dbTransaction })
      }

      logger.logBusiness('payment:failure.handled', {
        orderId: order.id,
        transactionId: transaction.id,
        orderCanceled: otherTransactions.length === 0
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'handlePaymentFailure',
        transactionId: transaction.id
      })
      throw error
    }
  }

  /**
   * Reserve license for paid order
   */
  async reserveLicenseForOrder(order, dbTransaction) {
    try {
      const { License } = require('../../models')

      // Find available license for this product
      const license = await License.findOne({
        where: {
          productRef: order.productRef,
          status: 'AVAILABLE'
        },
        lock: dbTransaction.LOCK.UPDATE,
        transaction: dbTransaction
      })

      if (!license) {
        throw new Error(`No available licenses for product ${order.productRef}`)
      }

      // Reserve license for this order
      await license.update({
        status: 'SOLD',
        orderId: order.id,
        soldAt: new Date()
      }, { transaction: dbTransaction })

      logger.logBusiness('license:reserve', {
        licenseId: license.id,
        orderId: order.id,
        productRef: order.productRef
      })

      return license
    } catch (error) {
      logger.logError(error, {
        operation: 'reserveLicenseForOrder',
        orderId: order.id,
        productRef: order.productRef
      })
      throw error
    }
  }

  /**
   * Map webhook status to internal status
   */
  mapWebhookStatus(webhookStatus) {
    const statusMap = {
      'PAID': 'PAID',
      'SUCCESS': 'PAID',
      'COMPLETED': 'PAID',
      'APPROVED': 'PAID',
      'FAILED': 'FAILED',
      'CANCELLED': 'FAILED',
      'CANCELED': 'FAILED',
      'EXPIRED': 'FAILED',
      'REJECTED': 'FAILED',
      'PENDING': 'PENDING',
      'PROCESSING': 'PENDING'
    }

    return statusMap[webhookStatus?.toUpperCase()] || 'FAILED'
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(transactionId) {
    try {
      const transaction = await Transaction.findByPk(transactionId, {
        include: [{ association: 'order' }]
      })

      if (!transaction) {
        throw new Error('Transaction not found')
      }

      return {
        id: transaction.id,
        orderId: transaction.orderId,
        gateway: transaction.gateway,
        gatewayRef: transaction.gatewayRef,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        paymentMethod: transaction.paymentMethod,
        meta: transaction.meta,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'getTransactionStatus',
        transactionId
      })
      throw error
    }
  }
}

module.exports = new PaymentService()