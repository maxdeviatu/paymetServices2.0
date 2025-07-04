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
  }

  /**
   * Verifica la firma del webhook usando HMAC-SHA256
   * @param {express.Request} req - Request de Express
   * @returns {boolean} - true si la firma es válida
   */
  verifySignature (req) {
    try {
      const timestamp = req.headers.event_timestamp
      const signature = req.headers.event_signature

      if (!timestamp || !signature) {
        logger.warn('Cobre webhook: Missing timestamp or signature headers', {
          timestamp: !!timestamp,
          signature: !!signature,
          headers: Object.keys(req.headers)
        })
        return false
      }

      // Concatenar timestamp + "." + body (sin espacios ni saltos de línea)
      let bodyString
      if (Buffer.isBuffer(req.body)) {
        bodyString = req.body.toString('utf8')
      } else if (typeof req.body === 'string') {
        bodyString = req.body
      } else if (typeof req.body === 'object') {
        bodyString = JSON.stringify(req.body)
      } else {
        logger.error('Cobre webhook: Unexpected body type', {
          bodyType: typeof req.body,
          body: req.body
        })
        return false
      }

      const data = `${timestamp}.${bodyString}`

      // Calcular HMAC-SHA256
      const expectedSignature = crypto
        .createHmac('sha256', this.secret)
        .update(data, 'utf8')
        .digest('hex')

      // Comparación segura contra timing attacks
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(signature, 'hex')
      )

      if (!isValid) {
        logger.warn('Cobre webhook: Invalid signature', {
          expected: expectedSignature,
          received: signature,
          data: data.substring(0, 100) + '...'
        })
      }

      return isValid
    } catch (error) {
      logger.error('Cobre webhook: Error verifying signature', {
        error: error.message,
        stack: error.stack
      })
      return false
    }
  }

  /**
   * Parsea el webhook de Cobre y lo normaliza
   * @param {express.Request} req - Request de Express
   * @returns {WebhookEvent} - Evento normalizado
   */
  parseWebhook (req) {
    try {
      const { body, rawBodyString } = this._parseRequestBody(req)
      const eventContext = this._createEventContext(body)

      logger.info('Cobre webhook: Processing event', eventContext)

      const eventData = this._processEventByType(body, eventContext)
      const webhookEvent = this._createWebhookEvent(body, eventData, req.headers, rawBodyString)

      logger.info('Cobre webhook: Successfully parsed', {
        eventId: webhookEvent.eventId,
        externalRef: webhookEvent.externalRef,
        type: webhookEvent.type,
        status: webhookEvent.status,
        amount: webhookEvent.amount,
        currency: webhookEvent.currency
      })

      return webhookEvent
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
   * @returns {Object} - WebhookEvent
   * @private
   */
  _createWebhookEvent (body, eventData, headers, rawBodyString) {
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
      payload: body
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
