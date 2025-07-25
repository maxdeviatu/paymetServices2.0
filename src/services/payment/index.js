const { Transaction, Order, Product, CobreCheckout, sequelize } = require('../../models')
const { Op } = require('sequelize')
const logger = require('../../config/logger')
const emailService = require('../email')
const TransactionManager = require('../../utils/transactionManager')
const AuthenticationManager = require('../../utils/authenticationManager')

// Payment providers
const MockProvider = require('./providers/mock')
const CobreProvider = require('./providers/cobre')
const EPaycoProvider = require('./providers/epayco')
// const PayUProvider = require('./providers/payu')

/**
 * Payment service factory and orchestrator
 */
class PaymentService {
  constructor () {
    this.providers = {
      mock: new MockProvider(),
      cobre: CobreProvider,
      epayco: new EPaycoProvider()
      // payu: new PayUProvider()
    }
    this.initialized = false

    // Registrar providers que requieren autenticación en el AuthenticationManager
    this.registerAuthProviders()
  }

  /**
   * Registra providers que requieren autenticación
   * @private
   */
  registerAuthProviders () {
    // Registrar providers que tienen método authenticate
    Object.entries(this.providers).forEach(([name, provider]) => {
      if (provider && typeof provider.authenticate === 'function') {
        try {
          AuthenticationManager.registerProvider(name, provider)
          logger.debug(`PaymentService: Registered ${name} with AuthenticationManager`)
        } catch (error) {
          logger.warn(`PaymentService: Failed to register ${name} with AuthenticationManager: ${error.message}`)
        }
      }
    })
  }

  /**
   * Initialize all payment providers
   */
  async initialize () {
    if (this.initialized) {
      return
    }

    try {
      logger.info('🔍 Validando proveedores de pago...')

      // Get list of available providers
      const availableProviders = Object.keys(this.providers).filter(name => name !== 'mock')

      logger.info('📦 Proveedores de pago encontrados:')
      availableProviders.forEach(provider => {
        logger.info(`   - ${provider.charAt(0).toUpperCase() + provider.slice(1)}`)
      })

      // Initialize each provider concurrently
      const initPromises = availableProviders.map(async (providerName) => {
        const provider = this.providers[providerName]
        if (provider && typeof provider.authenticate === 'function') {
          logger.info(`\n🔐 ${providerName.charAt(0).toUpperCase() + providerName.slice(1)} - Autenticación:`)
          try {
            await provider.authenticate()
            logger.info(`✅ ${providerName} authentication successful on startup`)

            // Verificación adicional para Cobre
            if (providerName === 'cobre') {
              if (provider.isTokenValid && provider.isTokenValid()) {
                logger.info(`✅ ${providerName} token validation successful`)
              } else {
                logger.warn(`⚠️ ${providerName} token validation failed`)
              }
            }

            return { provider: providerName, status: 'success' }
          } catch (error) {
            logger.error(`❌ Error inicializando ${providerName}:`, error.message)
            return { provider: providerName, status: 'error', error: error.message }
          }
        }
        return { provider: providerName, status: 'skipped' }
      })

      const results = await Promise.allSettled(initPromises)

      // Log initialization results
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success').length
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status === 'error')).length

      logger.info('\n📊 Inicialización de proveedores completada:')
      logger.info(`   ✅ Exitosos: ${successful}`)
      if (failed > 0) {
        logger.info(`   ❌ Fallidos: ${failed}`)
      }

      // Verificación final de estado de proveedores
      logger.info('\n🔍 Estado final de proveedores:')
      availableProviders.forEach(providerName => {
        const isReady = this.isProviderReady(providerName)
        const status = isReady ? '✅ Ready' : '❌ Not Ready'
        logger.info(`   ${providerName}: ${status}`)
      })

      this.initialized = true
    } catch (error) {
      logger.error('❌ Error durante la inicialización de proveedores:', error.message)
      throw error
    }
  }

  /**
   * Get list of available and initialized providers
   */
  getAvailableProviders () {
    return Object.keys(this.providers).filter(name => {
      const provider = this.providers[name]
      return provider && (name === 'mock' || this.isProviderReady(name))
    })
  }

  /**
   * Check if a provider is ready for use
   */
  isProviderReady (providerName) {
    const provider = this.providers[providerName]
    if (!provider) return false

    // For providers with authentication, check if they have a valid token
    if (typeof provider.isTokenValid === 'function') {
      return provider.isTokenValid()
    }

    return true
  }

  /**
   * Get payment provider instance with thread-safe authentication
   */
  async getProvider (providerName) {
    const provider = this.providers[providerName]
    if (!provider) {
      throw new Error(`Payment provider '${providerName}' not supported`)
    }

    // For providers that require authentication, use AuthenticationManager
    if (typeof provider.authenticate === 'function') {
      try {
        return await AuthenticationManager.getAuthenticatedProvider(providerName)
      } catch (error) {
        logger.error(`Failed to get authenticated provider '${providerName}':`, error.message)
        throw new Error(`Payment provider '${providerName}' authentication failed: ${error.message}`)
      }
    }

    // For providers without authentication (like mock), return directly
    return provider
  }

  /**
   * Create payment intent for order
   */
  async createPaymentIntent (orderId, options = {}) {
    try {
      logger.logBusiness('payment:createIntent', { orderId, options })

      return await TransactionManager.executePaymentTransaction(async (t) => {
        // First, get order with lock WITHOUT includes to avoid FOR UPDATE with outer joins
        const order = await Order.findByPk(orderId, {
          lock: t.LOCK.UPDATE,
          transaction: t
        })

        if (!order) {
          throw new Error('Order not found')
        }

        if (order.status !== 'PENDING') {
          throw new Error(`Cannot create payment intent for order with status ${order.status}`)
        }

        // Get product separately
        const product = await Product.findOne({
          where: { productRef: order.productRef },
          transaction: t
        })

        // Get customer data for ePayco
        let customer = null
        if (options.provider === 'epayco') {
          if (options.customer) {
            // Use customer data from request (frontend form)
            customer = options.customer
            logger.logBusiness('payment:customer.fromRequest', {
              orderId,
              hasCustomerData: true,
              customerEmail: customer.email,
              customerName: `${customer.firstName} ${customer.lastName}`,
              documentType: customer.documentType,
              documentNumber: customer.documentNumber
            })
          } else {
            // Fallback: load from database
            const { User } = require('../../models')
            customer = await User.findByPk(order.customerId, {
              transaction: t
            })
            logger.logBusiness('payment:customer.fromDatabase', {
              orderId,
              customerId: order.customerId,
              hasCustomerData: !!customer
            })
          }
        }

        // Get existing transactions separately
        const existingTransactions = await Transaction.findAll({
          where: {
            orderId: order.id,
            gateway: options.provider || 'mock',
            status: { [Op.in]: ['CREATED', 'PENDING'] }
          },
          transaction: t
        })

        logger.logBusiness('payment:order.loaded', {
          orderId,
          orderFound: !!order,
          orderStatus: order?.status,
          transactionsCount: existingTransactions?.length || 0,
          firstTransactionStatus: existingTransactions?.[0]?.status
        })

        // Find or create transaction for the specified provider
        let transaction = existingTransactions?.[0]

        if (!transaction) {
          // Create new transaction if none exists for this provider
          transaction = await Transaction.create({
            orderId: order.id,
            gateway: options.provider || 'mock',
            gatewayRef: `temp-${order.id}-${Date.now()}`,
            amount: order.grandTotal,
            currency: product?.currency || 'USD',
            status: 'CREATED'
          }, { transaction: t })
        }

        // Get payment provider
        const provider = await this.getProvider(transaction.gateway)

        // Create payment intent with provider
        const intentResult = await provider.createIntent({ order, transaction, product, customer })

        logger.logBusiness('payment:intentResult.debug', {
          orderId: order.id,
          provider: transaction.gateway,
          hasIntentResult: !!intentResult,
          intentKeys: intentResult ? Object.keys(intentResult) : [],
          hasMeta: !!intentResult?.meta,
          metaKeys: intentResult?.meta ? Object.keys(intentResult.meta) : [],
          gatewayRef: intentResult?.gatewayRef
        })

        // Update transaction with gateway reference
        await transaction.update({
          gatewayRef: intentResult.gatewayRef,
          status: 'PENDING',
          meta: intentResult.meta || {}
        }, { transaction: t })

        // If using Cobre, save checkout data
        if (transaction.gateway === 'cobre' && intentResult.meta) {
          await CobreCheckout.create({
            transactionId: transaction.id,
            checkoutId: intentResult.meta.checkoutId,
            checkoutUrl: intentResult.redirectUrl,
            amount: transaction.amount,
            currency: transaction.currency,
            status: 'PENDING',
            validUntil: new Date(intentResult.meta.validUntil),
            metadata: intentResult.meta
          }, { transaction: t })

          logger.logBusiness('cobre:checkout.created', {
            transactionId: transaction.id,
            checkoutId: intentResult.meta.checkoutId,
            checkoutUrl: intentResult.redirectUrl
          })
        }

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
          currency: transaction.currency,
          meta: intentResult.meta // ✅ Include meta data in return
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
  async processWebhook (providerName, req) {
    try {
      logger.logBusiness('payment:webhook.received', {
        provider: providerName,
        headers: req.headers,
        bodyPreview: JSON.stringify(req.body).substring(0, 200)
      })

      // Get provider and parse webhook
      const provider = await this.getProvider(providerName)
      const webhookData = provider.parseWebhook(req)

      return await TransactionManager.executeWebhookTransaction(async (t) => {
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
  async handlePaymentSuccess (transaction, dbTransaction) {
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
        try {
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
        } catch (licenseError) {
          // If no licenses available, add to waitlist
          if (licenseError.message.includes('No available licenses')) {
            logger.logBusiness('payment:success.waitlist', {
              orderId: order.id,
              productRef: order.productRef,
              reason: 'No available licenses'
            })

            // Add to waitlist after transaction commits
            setImmediate(async () => {
              try {
                const waitlistService = require('./waitlist.service')
                await waitlistService.addToWaitlist(order, 'OUT_OF_STOCK')
              } catch (waitlistError) {
                logger.logError(waitlistError, {
                  operation: 'addToWaitlist',
                  orderId: order.id
                })
              }
            })
          } else {
            // Re-throw other license errors
            throw licenseError
          }
        }
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
  async handlePaymentFailure (transaction, dbTransaction) {
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
  async reserveLicenseForOrder (order, dbTransaction) {
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
  mapWebhookStatus (webhookStatus) {
    const statusMap = {
      PAID: 'PAID',
      SUCCESS: 'PAID',
      COMPLETED: 'PAID',
      APPROVED: 'PAID',
      FAILED: 'FAILED',
      CANCELLED: 'FAILED',
      CANCELED: 'FAILED',
      EXPIRED: 'FAILED',
      REJECTED: 'FAILED',
      PENDING: 'PENDING',
      PROCESSING: 'PENDING'
    }

    return statusMap[webhookStatus?.toUpperCase()] || 'FAILED'
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus (transactionId) {
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
