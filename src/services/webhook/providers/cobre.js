const crypto = require('crypto')
const config = require('../../../config')
const logger = require('../../../config/logger')

/**
 * Adaptador para webhooks de Cobre
 * Implementa la interfaz IProviderAdapter
 */
class CobreAdapter {
  constructor () {
    this.secret = config.cobre.webhook.secret
    this.provider = 'cobre'

    // Log webhook secret configuration status for debugging
    if (!this.secret) {
      logger.warn('Cobre webhook: No webhook secret configured', {
        env: process.env.NODE_ENV,
        hasCobreWebhookSecret: !!process.env.COBRE_WEBHOOK_SECRET
      })
    } else {
      logger.debug('Cobre webhook: Secret configured successfully', {
        secretLength: this.secret.length,
        secretPreview: this.secret.substring(0, 8) + '...'
      })
    }
  }

  /**
   * Verifica la firma del webhook usando HMAC-SHA256
   * @param {Object} req - Request de Express
   * @returns {boolean} - true si la firma es válida
   */
  verifySignature (req) {
    try {
      // Validar que el secreto esté configurado
      if (!this.secret) {
        logger.error('Cobre webhook: No webhook secret configured', {
          env: process.env.NODE_ENV,
          hasCobreWebhookSecret: !!process.env.COBRE_WEBHOOK_SECRET
        })
        return false
      }

      // Buscar headers de timestamp y firma (Cobre usa event-timestamp y event-signature)
      const timestamp = req.headers['event-timestamp']
      const signature = req.headers['event-signature']

      if (!timestamp || !signature) {
        logger.warn('Cobre webhook: Missing required headers', {
          hasTimestamp: !!timestamp,
          hasSignature: !!signature,
          availableHeaders: Object.keys(req.headers)
        })
        return false
      }

      // Usar el raw body preservado por el middleware
      let bodyString
      if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
        bodyString = req.rawBody.toString('utf8')
      } else {
        logger.error('Cobre webhook: No raw body buffer available', {
          hasRawBody: !!req.rawBody,
          rawBodyType: typeof req.rawBody,
          bodyType: typeof req.body
        })
        return false
      }

      // Construir el payload para verificación: timestamp.body
      const data = `${timestamp}.${bodyString}`

      // Calcular HMAC-SHA256
      const expectedSignature = crypto
        .createHmac('sha256', this.secret)
        .update(data, 'utf8')
        .digest('hex')

      // Comparación segura
      let isValid = false
      try {
        isValid = crypto.timingSafeEqual(
          Buffer.from(expectedSignature, 'hex'),
          Buffer.from(signature, 'hex')
        )
      } catch (bufferError) {
        logger.error('Cobre webhook: Error in signature comparison', {
          error: bufferError.message,
          expectedLength: expectedSignature.length,
          receivedLength: signature.length
        })
        return false
      }

      if (!isValid) {
        logger.warn('Cobre webhook: Invalid signature', {
          expected: expectedSignature,
          received: signature,
          timestamp,
          bodyLength: bodyString.length,
          dataLength: data.length,
          secretLength: this.secret.length
        })
      } else {
        logger.info('Cobre webhook: Signature verified successfully', {
          timestamp,
          bodyLength: bodyString.length,
          signatureLength: signature.length
        })
      }

      return isValid
    } catch (error) {
      logger.error('Cobre webhook: Error verifying signature', {
        error: error.message,
        stack: error.stack,
        hasSecret: !!this.secret,
        secretLength: this.secret ? this.secret.length : 0
      })
      return false
    }
  }

  /**
   * Parsea el webhook de Cobre y lo normaliza
   * @param {express.Request} req - Request de Express
   * @returns {WebhookEvent[]} - Array de eventos normalizados
   */
  parseWebhook (req) {
    try {
      const { body, rawBodyString } = this._parseRequestBody(req)
      
      // Detectar si el webhook contiene múltiples eventos
      const events = this._extractEvents(body)
      
      logger.info('Cobre webhook: Processing events', {
        totalEvents: events.length,
        eventKeys: events.map(e => e.event_key)
      })

      const webhookEvents = events.map((eventBody, index) => {
        const eventContext = this._createEventContext(eventBody)
        const eventData = this._processEventByType(eventBody, eventContext)
        const webhookEvent = this._createWebhookEvent(eventBody, eventData, req.headers, rawBodyString, index)

        logger.info('Cobre webhook: Successfully parsed event', {
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

      logger.info('Cobre webhook: All events parsed successfully', {
        totalEvents: webhookEvents.length,
        eventIds: webhookEvents.map(e => e.eventId)
      })

      return webhookEvents
    } catch (error) {
      logger.error('Cobre webhook: Parsing failed', {
        error: error.message,
        stack: error.stack,
        body: typeof req.body === 'string' ? req.body.substring(0, 200) : JSON.stringify(req.body).substring(0, 200)
      })
      throw error
    }
  }

  /**
   * Parsea el cuerpo de la request y devuelve body y rawBodyString
   * @param {express.Request} req - Request de Express
   * @returns {Object} - {body, rawBodyString}
   * @private
   */
  _parseRequestBody (req) {
    if (Buffer.isBuffer(req.body)) {
      const rawBodyString = req.body.toString('utf8')
      return { body: JSON.parse(rawBodyString), rawBodyString }
    }

    if (typeof req.body === 'string') {
      return { body: JSON.parse(req.body), rawBodyString: req.body }
    }

    if (typeof req.body === 'object') {
      return { body: req.body, rawBodyString: JSON.stringify(req.body) }
    }

    throw new Error(`Unexpected body type: ${typeof req.body}`)
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
      logger.info('Cobre webhook: Detected array of events', {
        eventCount: body.length
      })
      return body
    }

    // Si el body tiene una propiedad 'events' que es un array
    if (body.events && Array.isArray(body.events)) {
      logger.info('Cobre webhook: Detected events array in body', {
        eventCount: body.events.length
      })
      return body.events
    }

    // Si el body tiene una propiedad 'data' que es un array
    if (body.data && Array.isArray(body.data)) {
      logger.info('Cobre webhook: Detected data array in body', {
        eventCount: body.data.length
      })
      return body.data
    }

    // Si el body tiene una propiedad 'webhooks' que es un array
    if (body.webhooks && Array.isArray(body.webhooks)) {
      logger.info('Cobre webhook: Detected webhooks array in body', {
        eventCount: body.webhooks.length
      })
      return body.webhooks
    }

    // Caso por defecto: tratar el body como un solo evento
    logger.info('Cobre webhook: Treating body as single event')
    return [body]
  }

  /**
   * Crea contexto del evento para logging consistente
   * @param {Object} body - Cuerpo del webhook
   * @returns {Object} - Contexto del evento
   * @private
   */
  _createEventContext (body) {
    return {
      eventId: body.id,
      eventKey: body.event_key,
      contentType: body.content?.type,
      hasUniqueTransactionId: !!(body.content?.unique_transaction_id || body.content?.metadata?.uniqueTransactionId)
    }
  }

  /**
   * Extrae uniqueTransactionId del body del webhook
   * @param {Object} body - Cuerpo del webhook
   * @returns {string|null} - uniqueTransactionId o null
   * @private
   */
  _extractUniqueTransactionId (body) {
    return body.content?.unique_transaction_id || body.content?.metadata?.uniqueTransactionId || null
  }

  /**
   * Determina la referencia externa a usar (external_id, uniqueTransactionId o event ID)
   * @param {Object} body - Cuerpo del webhook
   * @param {Object} eventContext - Contexto del evento
   * @param {string} logContext - Contexto para logging
   * @returns {string} - Referencia externa
   * @private
   */
  _determineExternalRef (body, eventContext, logContext) {
    // Debug: Log available content structure for troubleshooting
    logger.debug('Cobre webhook: Available content structure', {
      ...eventContext,
      contentKeys: body.content ? Object.keys(body.content) : 'no content',
      hasExternalId: !!(body.content?.external_id),
      hasUniqueTransactionId: !!(body.content?.unique_transaction_id),
      context: logContext
    })

    // Prioridad 1: external_id del money movement content (matches our gateway_ref)
    const externalId = body.content?.external_id
    if (externalId) {
      logger.debug('Cobre webhook: Using external_id from money movement', {
        ...eventContext,
        externalId,
        context: logContext
      })
      return externalId
    }

    // Prioridad 2: unique_transaction_id del content (fallback)
    const uniqueTransactionId = this._extractUniqueTransactionId(body)
    if (uniqueTransactionId) {
      logger.debug('Cobre webhook: Using uniqueTransactionId as fallback', {
        ...eventContext,
        uniqueTransactionId,
        context: logContext
      })
      return uniqueTransactionId
    }

    // Prioridad 3: Buscar external_id en otros lugares del payload
    const alternativeExternalId = body.external_id || body.content?.metadata?.external_id
    if (alternativeExternalId) {
      logger.debug('Cobre webhook: Using alternative external_id location', {
        ...eventContext,
        alternativeExternalId,
        context: logContext
      })
      return alternativeExternalId
    }

    logger.warn('Cobre webhook: No external_id found, using event ID as final fallback', {
      ...eventContext,
      context: logContext,
      bodyStructure: {
        hasContent: !!body.content,
        contentType: body.content?.type,
        eventKey: body.event_key
      }
    })
    return body.id
  }

  /**
   * Procesa el evento según su tipo
   * @param {Object} body - Cuerpo del webhook
   * @param {Object} eventContext - Contexto del evento
   * @returns {Object} - {eventType, externalRef, status}
   * @private
   */
  _processEventByType (body, eventContext) {
    const eventKey = body.event_key

    // Mapa de configuración de eventos para evitar condicionales repetitivas
    const eventConfig = {
      'accounts.balance.credit': {
        type: 'balance_credit',
        status: 'PAID',
        logContext: 'balance_credit'
      },
      'money_movements.status.completed': {
        type: 'payment',
        status: 'PAID',
        logContext: 'money_movement_completed'
      },
      'money_movements.status.failed': {
        type: 'payment',
        status: 'FAILED',
        logContext: 'money_movement_failed'
      },
      'money_movements.status.rejected': {
        type: 'payment',
        status: 'FAILED',
        logContext: 'money_movement_rejected'
      },
      'money_movements.status.canceled': {
        type: 'payment',
        status: 'FAILED',
        logContext: 'money_movement_canceled'
      },
      'money_movements.status.pending': {
        type: 'payment',
        status: 'PENDING',
        logContext: 'money_movement_pending'
      }
    }

    const config = eventConfig[eventKey]

    if (config) {
      return {
        eventType: config.type,
        externalRef: this._determineExternalRef(body, eventContext, config.logContext),
        status: config.status
      }
    }

    // Fallback para eventos no mapeados
    logger.warn('Cobre webhook: Unknown event type, using generic mapping', {
      ...eventContext,
      eventKey
    })

    const externalRef = body.id || body.checkout_id
    if (!externalRef) {
      throw new Error('Missing external reference in event')
    }

    return {
      eventType: 'payment',
      externalRef,
      status: this.mapStatus(body.status)
    }
  }

  /**
   * Crea el objeto WebhookEvent final
   * @param {Object} body - Cuerpo del webhook
   * @param {Object} eventData - Datos procesados del evento
   * @param {Object} headers - Headers de la request
   * @param {string} rawBodyString - Cuerpo raw como string
   * @param {number} eventIndex - Índice del evento en el array
   * @returns {Object} - WebhookEvent
   * @private
   */
  _createWebhookEvent (body, eventData, headers, rawBodyString, eventIndex) {
    const amount = body.content?.amount || body.amount
    const currency = body.content?.currency || body.currency || 'USD'

    if (!amount || amount <= 0) {
      throw new Error('Invalid or missing amount in webhook')
    }

    return {
      provider: this.provider,
      type: eventData.eventType,
      externalRef: eventData.externalRef,
      eventId: body.id,
      status: eventData.status,
      amount: Math.round(amount),
      currency: currency.toUpperCase(),
      rawHeaders: headers,
      rawBody: rawBodyString,
      payload: body,
      eventIndex: eventIndex // Add eventIndex to the event object
    }
  }

  /**
   * Mapea estados de Cobre a estados internos
   * @param {string} cobreStatus - Estado de Cobre
   * @returns {string} - Estado interno
   */
  mapStatus (cobreStatus) {
    const statusMap = {
      PAID: 'PAID',
      COMPLETED: 'PAID',
      SUCCESSFUL: 'PAID',
      SUCCESS: 'PAID',
      PENDING: 'PENDING',
      PROCESSING: 'PENDING',
      FAILED: 'FAILED',
      CANCELLED: 'FAILED',
      CANCELED: 'FAILED',
      EXPIRED: 'FAILED',
      REJECTED: 'FAILED'
    }

    const mappedStatus = statusMap[cobreStatus?.toUpperCase()]
    if (!mappedStatus) {
      logger.warn('Cobre webhook: Unknown status mapping', {
        originalStatus: cobreStatus,
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
    const isCredit = payload.event_key === 'accounts.balance.credit'

    return {
      eventKey: payload.event_key,
      isCredit,
      transactionType: payload.content?.type,
      accountId: payload.content?.account_id,
      previousBalance: payload.content?.previous_balance,
      currentBalance: payload.content?.current_balance,
      creditDebitType: payload.content?.credit_debit_type,
      metadata: payload.content?.metadata
    }
  }
}

module.exports = CobreAdapter
