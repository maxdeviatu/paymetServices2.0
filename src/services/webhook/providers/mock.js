const logger = require('../../../config/logger')

/**
 * Adaptador Mock para webhooks de testing
 * Implementa la misma interfaz que CobreAdapter
 */
class MockAdapter {
  constructor () {
    this.provider = 'mock'
  }

  /**
   * Verifica la firma del webhook (mock implementation)
   * @param {express.Request} req - Request de Express
   * @returns {boolean} - true si la firma es válida
   */
  verifySignature (req) {
    try {
      const signature = req.headers['x-mock-signature']

      if (!signature) {
        logger.warn('Mock webhook: Missing signature header')
        return false
      }

      // Mock validation: solo verificar que existe y tiene longitud
      const isValid = signature && signature.length > 0

      if (!isValid) {
        logger.warn('Mock webhook: Invalid signature', {
          signature
        })
      }

      return isValid
    } catch (error) {
      logger.error('Mock webhook: Error verifying signature', {
        error: error.message
      })
      return false
    }
  }

  /**
   * Parsea el webhook mock y lo normaliza
   * @param {express.Request} req - Request de Express
   * @returns {WebhookEvent[]} - Array de eventos normalizados
   */
  parseWebhook (req) {
    try {
      const body = JSON.parse(req.body.toString())

      // Detectar si el webhook contiene múltiples eventos
      const events = this._extractEvents(body)

      logger.info('Mock webhook: Processing events', {
        totalEvents: events.length
      })

      const webhookEvents = events.map((eventBody, index) => {
        logger.info('Mock webhook: Parsing event', {
          eventIndex: index,
          reference: eventBody.reference,
          status: eventBody.status,
          amount: eventBody.amount
        })

        // Extraer datos del webhook mock
        const externalRef = eventBody.reference || eventBody.gatewayRef
        const status = eventBody.status || 'PAID' // Default a success para testing
        const amount = eventBody.amount || 10000 // Default amount para testing
        const currency = eventBody.currency || 'USD'
        const eventType = eventBody.eventType || 'payment'

        if (!externalRef) {
          throw new Error(`Missing external reference in mock webhook event ${index}`)
        }

        if (!amount || amount <= 0) {
          throw new Error(`Invalid or missing amount in mock webhook event ${index}`)
        }

        const webhookEvent = {
          provider: this.provider,
          type: eventType,
          externalRef,
          eventId: eventBody.eventId || `mock_${Date.now()}_${index}`,
          status: this.mapStatus(status),
          amount: Math.round(amount),
          currency: currency.toUpperCase(),
          rawHeaders: req.headers,
          rawBody: req.body,
          payload: eventBody,
          eventIndex: index
        }

        logger.info('Mock webhook: Successfully parsed event', {
          eventIndex: index,
          eventId: webhookEvent.eventId,
          externalRef: webhookEvent.externalRef,
          type: webhookEvent.type,
          status: webhookEvent.status,
          amount: webhookEvent.amount,
          currency: webhookEvent.currency
        })

        return webhookEvent
      })

      logger.info('Mock webhook: All events parsed successfully', {
        totalEvents: webhookEvents.length,
        eventIds: webhookEvents.map(e => e.eventId)
      })

      return webhookEvents
    } catch (error) {
      logger.error('Mock webhook: Error parsing webhook', {
        error: error.message,
        body: req.body.toString().substring(0, 200) + '...'
      })
      throw new Error(`Failed to parse Mock webhook: ${error.message}`)
    }
  }

  /**
   * Extrae eventos del body del webhook
   * @param {Object} body - Cuerpo del webhook
   * @returns {Array} - Array de eventos
   * @private
   */
  _extractEvents (body) {
    // Si el body es un array, procesar cada elemento como un evento
    if (Array.isArray(body)) {
      logger.info('Mock webhook: Detected array of events', {
        eventCount: body.length
      })
      return body
    }

    // Si el body tiene una propiedad 'events' que es un array
    if (body.events && Array.isArray(body.events)) {
      logger.info('Mock webhook: Detected events array in body', {
        eventCount: body.events.length
      })
      return body.events
    }

    // Si el body tiene una propiedad 'data' que es un array
    if (body.data && Array.isArray(body.data)) {
      logger.info('Mock webhook: Detected data array in body', {
        eventCount: body.data.length
      })
      return body.data
    }

    // Si el body tiene una propiedad 'webhooks' que es un array
    if (body.webhooks && Array.isArray(body.webhooks)) {
      logger.info('Mock webhook: Detected webhooks array in body', {
        eventCount: body.webhooks.length
      })
      return body.webhooks
    }

    // Caso por defecto: tratar el body como un solo evento
    logger.info('Mock webhook: Treating body as single event')
    return [body]
  }

  /**
   * Mapea estados mock a estados internos
   * @param {string} mockStatus - Estado del mock
   * @returns {string} - Estado interno
   */
  mapStatus (mockStatus) {
    const statusMap = {
      PAID: 'PAID',
      SUCCESS: 'PAID',
      COMPLETED: 'PAID',
      PENDING: 'PENDING',
      PROCESSING: 'PENDING',
      FAILED: 'FAILED',
      CANCELLED: 'FAILED',
      EXPIRED: 'FAILED'
    }

    const mappedStatus = statusMap[mockStatus?.toUpperCase()]
    if (!mappedStatus) {
      logger.warn('Mock webhook: Unknown status mapping', {
        originalStatus: mockStatus,
        defaultingTo: 'FAILED'
      })
      return 'FAILED'
    }

    return mappedStatus
  }

  /**
   * Obtiene información adicional del evento para logging
   * @param {Object} payload - Payload del webhook
   * @returns {Object} - Información adicional
   */
  getEventInfo (payload) {
    return {
      eventType: payload.eventType,
      paymentMethod: payload.paymentMethod,
      timestamp: payload.timestamp,
      testMode: true
    }
  }
}

module.exports = MockAdapter
