const { WebhookEvent, sequelize } = require('../../models')
const logger = require('../../config/logger')

// Importar adaptadores de proveedores
const CobreAdapter = require('./providers/cobre')
const MockAdapter = require('./providers/mock')
const EPaycoAdapter = require('./providers/epayco')

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
      mock: new MockAdapter(),
      epayco: new EPaycoAdapter()
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

      // 3. Parsear y normalizar el webhook (ahora puede retornar múltiples eventos)
      const webhookEvents = adapter.parseWebhook(req)

      // 4. Procesar cada evento individualmente
      const results = []
      const processedEvents = []
      const failedEvents = []
      let duplicateEvents = 0

      logger.info('WebhookService: Processing multiple events', {
        totalEvents: webhookEvents.length
      })

      for (let i = 0; i < webhookEvents.length; i++) {
        const webhookEvent = webhookEvents[i]
        
        try {
          logger.info('WebhookService: Processing event', {
            eventIndex: i,
            eventId: webhookEvent.eventId,
            externalRef: webhookEvent.externalRef,
            type: webhookEvent.type
          })

          // 4.1 Verificar idempotencia antes de procesar
          // Si el evento ya existe:
          // - Estado diferente: Procesar para actualizar la transacción
          // - Estado igual: Marcar como duplicado y saltar
          const existingEvent = await this.checkIdempotency(webhookEvent)
          if (existingEvent) {
            // Verificar si el estado es diferente
            if (existingEvent.status !== webhookEvent.status) {
              // Procesar para actualizar el estado
              logger.info('WebhookService: Processing duplicate with status change', {
                eventIndex: i,
                eventId: webhookEvent.eventId,
                externalRef: webhookEvent.externalRef,
                provider: webhookEvent.provider,
                oldStatus: existingEvent.status,
                newStatus: webhookEvent.status,
                existingEventId: existingEvent.id
              })

              // Actualizar el evento existente en lugar de crear uno nuevo
              await this.updateWebhookEvent(existingEvent.id, {
                status: webhookEvent.status,
                eventId: webhookEvent.eventId,
                updatedAt: new Date()
              })

              // Procesar el evento para actualizar la transacción
              try {
                // Usar la misma lógica del flujo normal
                const handler = this.getEventHandler(webhookEvent.type)
                if (!handler) {
                  throw new Error(`No handler found for event type: ${webhookEvent.type}`)
                }

                const result = await handler.handle(webhookEvent)

                // Actualizar el registro del evento con el resultado
                await this.updateWebhookEvent(existingEvent.id, {
                  processedAt: new Date(),
                  status: result.success ? 'PROCESSED' : 'FAILED',
                  errorMessage: result.success ? null : result.reason
                })

                const eventResult = {
                  eventIndex: i,
                  eventId: webhookEvent.eventId,
                  externalRef: webhookEvent.externalRef,
                  status: result.success ? 'processed' : 'failed',
                  ...result
                }

                results.push(eventResult)
                processedEvents.push(eventResult)

                logger.info('WebhookService: Successfully processed duplicate event with status change', {
                  eventIndex: i,
                  eventId: webhookEvent.eventId,
                  externalRef: webhookEvent.externalRef,
                  type: webhookEvent.type,
                  status: webhookEvent.status,
                  result: result.success
                })
              } catch (error) {
                logger.error('WebhookService: Error processing duplicate event with status change', {
                  eventIndex: i,
                  eventId: webhookEvent.eventId,
                  externalRef: webhookEvent.externalRef,
                  error: error.message,
                  stack: error.stack
                })
                results.push({ eventId: webhookEvent.eventId, eventIndex: i, status: 'failed' })
                failedEvents.push({ eventId: webhookEvent.eventId, eventIndex: i, status: 'failed' })
              }
            } else {
              // Estado igual - marcar como duplicado y saltar
              logger.info('WebhookService: Skipping duplicate event with same status', {
                eventIndex: i,
                eventId: webhookEvent.eventId,
                externalRef: webhookEvent.externalRef,
                status: webhookEvent.status,
                existingEventId: existingEvent.id
              })
              results.push({ eventId: webhookEvent.eventId, eventIndex: i, status: 'duplicate' })
              duplicateEvents++
            }
            continue
          }

          // 4.2 Registrar el evento en la base de datos
          const webhookEventRecord = await this.registerWebhookEvent(webhookEvent)

          // 4.3 Procesar el evento con el handler correspondiente
          const handler = this.getEventHandler(webhookEvent.type)
          if (!handler) {
            throw new Error(`No handler found for event type: ${webhookEvent.type}`)
          }

          const result = await handler.handle(webhookEvent)

          // 4.4 Actualizar el registro del evento con el resultado
          await this.updateWebhookEvent(webhookEventRecord.id, {
            processedAt: new Date(),
            status: result.success ? 'PROCESSED' : 'FAILED',
            errorMessage: result.success ? null : result.reason
          })

          const eventResult = {
            eventIndex: i,
            eventId: webhookEvent.eventId,
            externalRef: webhookEvent.externalRef,
            status: result.success ? 'processed' : 'failed',
            ...result
          }

          results.push(eventResult)
          processedEvents.push(eventResult)

          logger.info('WebhookService: Successfully processed event', {
            eventIndex: i,
            eventId: webhookEvent.eventId,
            externalRef: webhookEvent.externalRef,
            type: webhookEvent.type,
            status: webhookEvent.status,
            result: result.success
          })

        } catch (error) {
          logger.error('WebhookService: Error processing event', {
            eventIndex: i,
            eventId: webhookEvent?.eventId,
            externalRef: webhookEvent?.externalRef,
            error: error.message,
            stack: error.stack
          })

          const errorResult = {
            eventIndex: i,
            eventId: webhookEvent?.eventId,
            externalRef: webhookEvent?.externalRef,
            status: 'failed',
            error: error.message
          }

          results.push(errorResult)
          failedEvents.push(errorResult)
        }
      }

      const processingTime = Date.now() - startTime

      // 5. Generar resumen del procesamiento
      const summary = {
        totalEvents: webhookEvents.length,
        processedEvents: processedEvents.length,
        failedEvents: failedEvents.length,
        duplicateEvents: results.filter(r => r.status === 'duplicate').length,
        processingTime: `${processingTime}ms`
      }

      logger.info('WebhookService: Completed processing all events', {
        provider: providerName,
        ...summary,
        results: results.map(r => ({
          eventIndex: r.eventIndex,
          eventId: r.eventId,
          status: r.status
        }))
      })

      return {
        status: 'processed',
        summary,
        results,
        processingTime
      }
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('WebhookService: Error processing webhook', {
        provider: providerName,
        error: error.message,
        stack: error.stack,
        processingTime: `${processingTime}ms`
      })
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
    // Buscar SOLO por provider y externalRef (no por eventId)
    // ePayco puede enviar múltiples webhooks con diferentes eventId para la misma transacción
    // La idempotencia debe basarse en la referencia externa, no en el ID del evento
    
    const existingEvent = await WebhookEvent.findOne({
      where: {
        provider: webhookEvent.provider,
        externalRef: webhookEvent.externalRef
      },
      order: [['createdAt', 'DESC']]
    })

    if (existingEvent) {
      logger.info('WebhookService: Idempotency check - Event already exists', {
        provider: webhookEvent.provider,
        externalRef: webhookEvent.externalRef,
        existingEventId: existingEvent.eventId,
        newEventId: webhookEvent.eventId,
        existingStatus: existingEvent.status,
        newStatus: webhookEvent.status,
        existingCreatedAt: existingEvent.createdAt
      })
    } else {
      logger.debug('WebhookService: Idempotency check - No existing event found', {
        provider: webhookEvent.provider,
        externalRef: webhookEvent.externalRef,
        newEventId: webhookEvent.eventId
      })
    }

    return existingEvent
  }

  /**
   * Registra un evento de webhook en la base de datos
   * @param {Object} webhookEvent - Evento del webhook
   * @returns {Promise<WebhookEvent>} - Evento registrado
   * 
   * Nota: La idempotencia se verifica ANTES de llamar a este método
   * en checkIdempotency(), por lo que este método asume que el evento
   * no existe previamente.
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
      errorMessage: sanitizedEvent.errorMessage,
      eventIndex: sanitizedEvent.eventIndex
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
      errorMessage: this.sanitizeString(webhookEvent.errorMessage) || null,
      eventIndex: this.sanitizeNumber(webhookEvent.eventIndex) || null
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
