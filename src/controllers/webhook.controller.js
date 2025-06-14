const paymentService = require('../services/payment')
const logger = require('../config/logger')

/**
 * Handle payment webhooks from providers
 */
exports.handlePaymentWebhook = async (req, res) => {
  try {
    const { provider } = req.params
    
    if (!provider) {
      return res.status(400).json({
        success: false,
        message: 'Provider parameter is required'
      })
    }

    logger.logBusiness('webhook:received', {
      provider,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type')
    })

    // Process webhook with payment service
    const result = await paymentService.processWebhook(provider, req)

    // Always respond with 200 for valid webhooks to prevent retries
    res.status(200).json({
      success: true,
      data: {
        status: result.status,
        transactionId: result.transactionId,
        orderId: result.orderId,
        newStatus: result.newStatus
      },
      message: 'Webhook processed successfully'
    })

    logger.logBusiness('webhook:processed', {
      provider,
      result: result.status,
      transactionId: result.transactionId,
      orderId: result.orderId
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'handlePaymentWebhook',
      provider: req.params.provider,
      body: req.body,
      headers: req.headers
    })

    // For webhooks, we should still return 200 to prevent provider retries
    // unless it's a validation error
    const shouldReturn200 = !error.message.includes('signature') && 
                           !error.message.includes('validation') &&
                           !error.message.includes('provider')

    const statusCode = shouldReturn200 ? 200 : 400

    res.status(statusCode).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

/**
 * Mock payment completion endpoint (for testing)
 */
exports.mockPaymentComplete = async (req, res) => {
  try {
    const { gatewayRef } = req.params
    const { status = 'PAID', amount, currency = 'USD' } = req.body

    if (!gatewayRef) {
      return res.status(400).json({
        success: false,
        message: 'gatewayRef is required'
      })
    }

    // Simulate webhook payload
    const mockWebhookReq = {
      params: { provider: 'mock' },
      body: {
        reference: gatewayRef,
        gatewayRef,
        status,
        amount,
        currency,
        paymentMethod: 'test_card',
        timestamp: new Date().toISOString()
      },
      headers: {
        'x-mock-signature': 'mock-signature-' + Date.now(),
        'content-type': 'application/json'
      },
      ip: req.ip,
      get: (header) => req.get(header)
    }

    // Process through webhook handler
    const result = await paymentService.processWebhook('mock', mockWebhookReq)

    res.status(200).json({
      success: true,
      data: result,
      message: 'Mock payment completed successfully'
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'mockPaymentComplete',
      gatewayRef: req.params.gatewayRef,
      body: req.body
    })

    res.status(400).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Health check for webhook endpoints
 */
exports.webhookHealthCheck = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Webhook endpoint is healthy',
    timestamp: new Date().toISOString(),
    provider: req.params.provider || 'unknown'
  })
}