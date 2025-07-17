const { WebhookEvent, sequelize } = require('../../models')
const logger = require('../../config/logger')

// Importar adaptadores de proveedores
const CobreAdapter = require('./providers/cobre')
const MockAdapter = require('./providers/mock')

// Importar handlers
const transactionHandler = require('./handlers/transactionHandler')

/**
 * Servicio principal de webhooks
 * Orquesta el procesamiento de webhooks de múltiples proveedores
 */
class WebhookService {
  constructor () {
    // Registro de adaptadores de proveedores
    this.providerRegistry = {
      cobre: new CobreAdapter(),
      mock: new MockAdapter()
    }

    // Registro de handlers por tipo de evento
    this.eventHandlers = {
      payment: transactionHandler,
      balance_credit: transactionHandler
      // Futuros handlers: refund, subscription, etc.
    }
  }

  /**
   * Procesa un webhook de un proveedor específico
   * @param {string} providerName - Nombre del proveedor
   * @param {express.Request} req - Request de Express
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async process (providerName, req) {
    const startTime = Date.now()

    try {
      logger.info('WebhookService: Processing webhook', {
        provider: providerName,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentType: req.get('Content-Type')
      })

      // 1. Obtener adaptador del proveedor
      const adapter = this.getProviderAdapter(providerName)
      if (!adapter) {
        throw new Error(`Unsupported provider: ${providerName}`)
      }

      // 2. Verificar firma del webhook
      if (!adapter.verifySignature(req)) {
        throw new Error(`Invalid signature for provider: ${providerName}`)
      }

      // 3. Parsear y normalizar el webhook
      const webhookEvent = adapter.parseWebhook(req)

      // 4. Verificar idempotencia antes de procesar
      const existingEvent = await this.checkIdempotency(webhookEvent)
      if (existingEvent) {
        logger.info('WebhookService: Event already processed (idempotency check)', {
          eventId: webhookEvent.eventId,
          externalRef: webhookEvent.externalRef,
          provider: webhookEvent.provider
        })
        return {
          status: 'duplicate',
          reason: 'already_processed',
          eventId: existingEvent.id
        }
      }

      // 5. Registrar el evento en la base de datos
      const webhookEventRecord = await this.registerWebhookEvent(webhookEvent)

      // 6. Procesar el evento con el handler correspondiente
      const handler = this.getEventHandler(webhookEvent.type)
      if (!handler) {
        throw new Error(`No handler found for event type: ${webhookEvent.type}`)
      }

      const result = await handler.handle(webhookEvent)

      // 7. Actualizar el registro del evento con el resultado
      await this.updateWebhookEvent(webhookEventRecord.id, {
        processedAt: new Date(),
        status: result.success ? 'PROCESSED' : 'FAILED',
        errorMessage: result.success ? null : result.reason
      })

      const processingTime = Date.now() - startTime

      logger.info('WebhookService: Successfully processed webhook', {
        provider: providerName,
        eventId: webhookEvent.eventId,
        externalRef: webhookEvent.externalRef,
        type: webhookEvent.type,
        status: webhookEvent.status,
        processingTime: `${processingTime}ms`,
        result
      })

      return {
        status: 'processed',
        eventId: webhookEvent.eventId,
        externalRef: webhookEvent.externalRef,
        processingTime,
        ...result
      }
    } catch (error) {
      const processingTime = Date.now() - startTime

      logger.error('WebhookService: Error processing webhook', {
        provider: providerName,
        error: error.message,
        stack: error.stack,
        processingTime: `${processingTime}ms`
      })

      // Registrar el error en la base de datos si es posible
      try {
        if (req.body) {
          // Convertir rawBody a string para evitar errores de validación
          let rawBodyString = ''
          if (Buffer.isBuffer(req.body)) {
            rawBodyString = req.body.toString('utf8')
          } else if (typeof req.body === 'string') {
            rawBodyString = req.body
          } else if (typeof req.body === 'object') {
            rawBodyString = JSON.stringify(req.body)
          } else {
            rawBodyString = String(req.body)
          }

          const webhookEvent = {
            provider: providerName,
            type: 'unknown',
            externalRef: 'unknown',
            status: 'FAILED',
            amount: 0,
            currency: 'USD',
            rawHeaders: req.headers,
            rawBody: rawBodyString,
            payload: {},
            errorMessage: error.message
          }

          await this.registerWebhookEvent(webhookEvent)
        }
      } catch (dbError) {
        logger.error('WebhookService: Error registering failed webhook', {
          error: dbError.message
        })
      }

      throw error
    }
  }

  /**
   * Obtiene el adaptador de un proveedor
   * @param {string} providerName - Nombre del proveedor
   * @returns {Object|null} - Adaptador del proveedor
   */
  getProviderAdapter (providerName) {
    return this.providerRegistry[providerName] || null
  }

  /**
   * Obtiene el handler para un tipo de evento
   * @param {string} eventType - Tipo de evento
   * @returns {Object|null} - Handler del evento
   */
  getEventHandler (eventType) {
    return this.eventHandlers[eventType] || null
  }

  /**
   * Verifica si el evento ya fue procesado (idempotencia)
   * @param {Object} webhookEvent - Evento del webhook
   * @returns {Promise<WebhookEvent|null>} - Evento existente si ya fue procesado
   */
  async checkIdempotency (webhookEvent) {
    const whereClause = {
      provider: webhookEvent.provider,
      externalRef: webhookEvent.externalRef
    }

    // Si hay eventId, también verificar por ese campo
    if (webhookEvent.eventId) {
      whereClause.eventId = webhookEvent.eventId
    }

    return await WebhookEvent.findOne({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    })
  }

  /**
   * Registra un evento de webhook en la base de datos
   * @param {Object} webhookEvent - Evento del webhook
   * @returns {Promise<WebhookEvent>} - Evento registrado
   */
  async registerWebhookEvent (webhookEvent) {
    // Validar y sanitizar datos antes de guardar
    const sanitizedEvent = this.sanitizeWebhookEvent(webhookEvent)

    return await WebhookEvent.create({
      eventId: sanitizedEvent.eventId,
      provider: sanitizedEvent.provider,
      externalRef: sanitizedEvent.externalRef,
      eventType: sanitizedEvent.type,
      status: sanitizedEvent.status,
      amount: sanitizedEvent.amount,
      currency: sanitizedEvent.currency,
      payload: sanitizedEvent.payload,
      rawHeaders: sanitizedEvent.rawHeaders,
      rawBody: sanitizedEvent.rawBody,
      errorMessage: sanitizedEvent.errorMessage
    })
  }

  /**
   * Sanitiza los datos del webhook antes de guardar en base de datos
   * @param {Object} webhookEvent - Evento del webhook
   * @returns {Object} - Evento sanitizado
   */
  sanitizeWebhookEvent (webhookEvent) {
    const sanitized = {
      eventId: this.sanitizeString(webhookEvent.eventId) || 'unknown',
      provider: this.sanitizeString(webhookEvent.provider) || 'unknown',
      externalRef: this.sanitizeString(webhookEvent.externalRef) || 'unknown',
      type: this.sanitizeString(webhookEvent.type) || 'unknown',
      status: this.sanitizeString(webhookEvent.status) || 'UNKNOWN',
      amount: this.sanitizeNumber(webhookEvent.amount) || 0,
      currency: this.sanitizeString(webhookEvent.currency) || 'USD',
      payload: this.sanitizeObject(webhookEvent.payload) || {},
      rawHeaders: this.sanitizeObject(webhookEvent.rawHeaders) || {},
      rawBody: this.sanitizeRawBody(webhookEvent.rawBody) || '',
      errorMessage: this.sanitizeString(webhookEvent.errorMessage) || null
    }

    return sanitized
  }

  /**
   * Sanitiza strings
   * @param {any} value - Valor a sanitizar
   * @returns {string|null} - String sanitizado
   */
  sanitizeString (value) {
    if (typeof value === 'string') {
      return value.trim().substring(0, 1000) // Limitar longitud
    }
    if (value !== null && value !== undefined) {
      return String(value).trim().substring(0, 1000)
    }
    return null
  }

  /**
   * Sanitiza números
   * @param {any} value - Valor a sanitizar
   * @returns {number|null} - Número sanitizado
   */
  sanitizeNumber (value) {
    if (typeof value === 'number' && !isNaN(value)) {
      return Math.round(value)
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value)
      return !isNaN(parsed) ? Math.round(parsed) : null
    }
    return null
  }

  /**
   * Sanitiza objetos
   * @param {any} value - Valor a sanitizar
   * @returns {Object|null} - Objeto sanitizado
   */
  sanitizeObject (value) {
    if (value && typeof value === 'object') {
      try {
        // Convertir a JSON y back para eliminar funciones y referencias circulares
        const jsonString = JSON.stringify(value)
        if (jsonString.length > 50000) { // Limitar tamaño
          return { truncated: true, size: jsonString.length }
        }
        return JSON.parse(jsonString)
      } catch (error) {
        return { error: 'Invalid object', type: typeof value }
      }
    }
    return null
  }

  /**
   * Sanitiza rawBody
   * @param {any} value - Valor a sanitizar
   * @returns {string} - String sanitizado
   */
  sanitizeRawBody (value) {
    if (Buffer.isBuffer(value)) {
      return value.toString('utf8').substring(0, 10000)
    }
    if (typeof value === 'string') {
      return value.substring(0, 10000)
    }
    if (value && typeof value === 'object') {
      try {
        return JSON.stringify(value).substring(0, 10000)
      } catch (error) {
        return '[Object - cannot stringify]'
      }
    }
    return String(value || '').substring(0, 10000)
  }

  /**
   * Actualiza un evento de webhook
   * @param {number} eventId - ID del evento
   * @param {Object} updateData - Datos a actualizar
   * @returns {Promise<void>}
   */
  async updateWebhookEvent (eventId, updateData) {
    await WebhookEvent.update(updateData, {
      where: { id: eventId }
    })
  }

  /**
   * Obtiene estadísticas de webhooks
   * @param {Object} filters - Filtros opcionales
   * @returns {Promise<Object>} - Estadísticas
   */
  async getStatistics (filters = {}) {
    const whereClause = {}

    if (filters.provider) {
      whereClause.provider = filters.provider
    }

    if (filters.status) {
      whereClause.status = filters.status
    }

    if (filters.startDate) {
      whereClause.createdAt = {
        [sequelize.Op.gte]: new Date(filters.startDate)
      }
    }

    if (filters.endDate) {
      whereClause.createdAt = {
        ...whereClause.createdAt,
        [sequelize.Op.lte]: new Date(filters.endDate)
      }
    }

    const [total, processed, failed, pending] = await Promise.all([
      WebhookEvent.count({ where: whereClause }),
      WebhookEvent.count({ where: { ...whereClause, status: 'PROCESSED' } }),
      WebhookEvent.count({ where: { ...whereClause, status: 'FAILED' } }),
      WebhookEvent.count({ where: { ...whereClause, status: 'PENDING' } })
    ])

    return {
      total,
      processed,
      failed,
      pending,
      successRate: total > 0 ? (processed / total) * 100 : 0
    }
  }

  /**
   * Obtiene eventos de webhook con paginación
   * @param {Object} options - Opciones de paginación y filtros
   * @returns {Promise<Object>} - Eventos y metadatos de paginación
   */
  async getWebhookEvents (options = {}) {
    const {
      page = 1,
      limit = 20,
      provider,
      status,
      eventType,
      startDate,
      endDate
    } = options

    const offset = (page - 1) * limit
    const whereClause = {}

    if (provider) whereClause.provider = provider
    if (status) whereClause.status = status
    if (eventType) whereClause.eventType = eventType

    if (startDate || endDate) {
      whereClause.createdAt = {}
      if (startDate) whereClause.createdAt[sequelize.Op.gte] = new Date(startDate)
      if (endDate) whereClause.createdAt[sequelize.Op.lte] = new Date(endDate)
    }

    const { count, rows } = await WebhookEvent.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      offset,
      limit
    })

    return {
      events: rows,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit)
      }
    }
  }
}

module.exports = new WebhookService()
