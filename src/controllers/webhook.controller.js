const webhookService = require('../services/webhook')
const logger = require('../config/logger')

/**
 * Controlador principal para webhooks
 * Maneja webhooks de múltiples proveedores de forma unificada
 */
class WebhookController {
  /**
   * Maneja webhooks de todos los proveedores
   * @param {express.Request} req - Request de Express
   * @param {express.Response} res - Response de Express
   */
  async handleWebhook (req, res) {
    try {
      const { provider } = req.params

      if (!provider) {
        return res.status(400).json({
          success: false,
          message: 'Provider parameter is required'
        })
      }

      // Preservar el raw body para la verificación de firma
      if (req.originalRawBody) {
        req.rawBody = req.originalRawBody
        logger.debug('WebhookController: Using original raw body', {
          provider,
          rawBodyLength: req.rawBody.length
        })
      } else if (Buffer.isBuffer(req.body)) {
        req.rawBody = req.body
        logger.debug('WebhookController: Using buffer body as fallback', {
          provider,
          rawBodyLength: req.rawBody.length
        })
      }

      logger.info('WebhookController: Received webhook', {
        provider,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentType: req.get('Content-Type'),
        bodySize: req.body ? req.body.length : 0,
        hasRawBody: !!req.rawBody
      })

      // Procesar webhook con el servicio
      const result = await webhookService.process(provider, req)

      // Siempre responder con 200 para evitar reintentos del proveedor
      res.status(200).json({
        success: true,
        data: {
          status: result.status,
          summary: result.summary,
          results: result.results,
          processingTime: result.processingTime
        },
        message: `Webhook processed successfully: ${result.summary.processedEvents} events processed, ${result.summary.failedEvents} failed, ${result.summary.duplicateEvents} duplicates`
      })

      logger.info('WebhookController: Webhook processed successfully', {
        provider,
        status: result.status,
        summary: result.summary,
        processingTime: result.processingTime
      })
    } catch (error) {
      logger.error('WebhookController: Error processing webhook', {
        provider: req.params.provider,
        error: error.message,
        stack: error.stack,
        body: req.body ? req.body.toString().substring(0, 200) + '...' : 'No body'
      })

      // Para webhooks, debemos responder 200 para evitar reintentos del proveedor
      // a menos que sea un error de validación específico
      const shouldReturn200 = !error.message.includes('signature') &&
                             !error.message.includes('validation') &&
                             !error.message.includes('Unsupported provider')

      const statusCode = shouldReturn200 ? 200 : 400

      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    }
  }

  /**
   * Health check para endpoints de webhook
   * @param {express.Request} req - Request de Express
   * @param {express.Response} res - Response de Express
   */
  healthCheck (req, res) {
    const { provider } = req.params

    res.status(200).json({
      success: true,
      message: 'Webhook endpoint is healthy',
      timestamp: new Date().toISOString(),
      provider: provider || 'unknown',
      environment: process.env.NODE_ENV || 'development'
    })
  }

  /**
   * Mock payment completion endpoint (solo para desarrollo)
   * @param {express.Request} req - Request de Express
   * @param {express.Response} res - Response de Express
   */
  async mockPaymentComplete (req, res) {
    try {
      const { gatewayRef } = req.params
      const { status = 'PAID', amount, currency = 'USD' } = req.body

      if (!gatewayRef) {
        return res.status(400).json({
          success: false,
          message: 'gatewayRef is required'
        })
      }

      logger.info('WebhookController: Mock payment completion', {
        gatewayRef,
        status,
        amount,
        currency
      })

      // Simular payload de webhook
      const mockWebhookReq = {
        params: { provider: 'mock' },
        body: Buffer.from(JSON.stringify({
          reference: gatewayRef,
          gatewayRef,
          status,
          amount,
          currency,
          paymentMethod: 'test_card',
          timestamp: new Date().toISOString(),
          eventId: `mock_${Date.now()}`
        })),
        headers: {
          'x-mock-signature': 'mock-signature-' + Date.now(),
          'content-type': 'application/json'
        },
        ip: req.ip,
        get: (header) => req.get(header)
      }

      // Procesar a través del servicio de webhooks
      const result = await webhookService.process('mock', mockWebhookReq)

      res.status(200).json({
        success: true,
        data: result,
        message: 'Mock payment completed successfully'
      })
    } catch (error) {
      logger.error('WebhookController: Error in mock payment completion', {
        gatewayRef: req.params.gatewayRef,
        error: error.message
      })

      res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Obtiene estadísticas de webhooks (solo para administradores)
   * @param {express.Request} req - Request de Express
   * @param {express.Response} res - Response de Express
   */
  async getStatistics (req, res) {
    try {
      const filters = {
        provider: req.query.provider,
        status: req.query.status,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      }

      const stats = await webhookService.getStatistics(filters)

      res.status(200).json({
        success: true,
        data: stats
      })
    } catch (error) {
      logger.error('WebhookController: Error getting statistics', {
        error: error.message
      })

      res.status(500).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Obtiene eventos de webhook con paginación (solo para administradores)
   * @param {express.Request} req - Request de Express
   * @param {express.Response} res - Response de Express
   */
  async getWebhookEvents (req, res) {
    try {
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        provider: req.query.provider,
        status: req.query.status,
        eventType: req.query.eventType,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      }

      const result = await webhookService.getWebhookEvents(options)

      res.status(200).json({
        success: true,
        data: result
      })
    } catch (error) {
      logger.error('WebhookController: Error getting webhook events', {
        error: error.message
      })

      res.status(500).json({
        success: false,
        message: error.message
      })
    }
  }
}

// Exportar instancia del controlador
module.exports = new WebhookController()
