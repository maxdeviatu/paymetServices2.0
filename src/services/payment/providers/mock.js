const logger = require('../../../config/logger')

/**
 * Mock payment provider for testing and development
 */
class MockPaymentProvider {
  constructor() {
    this.name = 'mock'
  }

  /**
   * Create payment intent
   */
  async createIntent({ order, transaction }) {
    try {
      logger.logBusiness('payment:intent', {
        orderId: order.id,
        transactionId: transaction.id,
        gateway: this.name,
        amount: transaction.amount
      })

      // Simulate gateway reference
      const gatewayRef = `mock-${order.id}-${transaction.id}-${Date.now()}`
      
      // Create mock payment URL
      const redirectUrl = `http://localhost:3000/mock-payment/${gatewayRef}?amount=${transaction.amount}&currency=${transaction.currency}`

      return {
        gatewayRef,
        redirectUrl,
        meta: {
          provider: this.name,
          simulatedDelay: 1000, // 1 second to simulate processing
          testMode: true
        }
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'mockPayment:createIntent',
        orderId: order.id,
        transactionId: transaction.id
      })
      throw error
    }
  }

  /**
   * Parse webhook payload
   */
  parseWebhook(req) {
    try {
      const { body, headers } = req
      
      // Mock webhook structure
      const webhook = {
        gatewayRef: body.reference || body.gatewayRef,
        status: body.status || 'PAID', // Default to success for testing
        amount: body.amount,
        currency: body.currency || 'USD',
        paymentMethod: body.paymentMethod || 'test_card',
        transactionId: body.transactionId,
        timestamp: new Date().toISOString(),
        signature: headers['x-mock-signature'] || 'mock-signature',
        rawData: body
      }

      // Validate signature (mock validation)
      if (!this.validateSignature(webhook.signature, body)) {
        throw new Error('Invalid webhook signature')
      }

      logger.logBusiness('payment:webhook', {
        gateway: this.name,
        gatewayRef: webhook.gatewayRef,
        status: webhook.status,
        amount: webhook.amount
      })

      return webhook
    } catch (error) {
      logger.logError(error, {
        operation: 'mockPayment:parseWebhook',
        body: req.body
      })
      throw error
    }
  }

  /**
   * Validate webhook signature (mock implementation)
   */
  validateSignature(signature, payload) {
    // In real implementation, this would validate against provider's secret
    // For mock, we just check if signature exists
    return signature && signature.length > 0
  }

  /**
   * Refund transaction
   */
  async refund({ transaction, amount, reason }) {
    try {
      logger.logBusiness('payment:refund', {
        transactionId: transaction.id,
        gatewayRef: transaction.gatewayRef,
        amount,
        reason
      })

      // Simulate refund processing
      const refundRef = `refund-${transaction.gatewayRef}-${Date.now()}`
      
      return {
        refundRef,
        status: 'REFUNDED',
        amount,
        processedAt: new Date().toISOString(),
        meta: {
          provider: this.name,
          reason,
          originalTransaction: transaction.gatewayRef
        }
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'mockPayment:refund',
        transactionId: transaction.id
      })
      throw error
    }
  }

  /**
   * Get transaction status from gateway
   */
  async getTransactionStatus(gatewayRef) {
    try {
      // Mock status check
      return {
        gatewayRef,
        status: 'PAID', // Default to paid for testing
        amount: 10000, // Mock amount
        currency: 'USD',
        paymentMethod: 'test_card',
        lastUpdated: new Date().toISOString()
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'mockPayment:getTransactionStatus',
        gatewayRef
      })
      throw error
    }
  }
}

module.exports = MockPaymentProvider