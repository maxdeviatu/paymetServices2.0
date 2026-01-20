const auth = require('./auth')
const accountsService = require('./accounts')
const axios = require('axios')
const config = require('../../../../config')
const logger = require('../../../../config/logger')
const NodeCache = require('node-cache')

class CobreProvider {
  constructor () {
    // Cache para estados de checkout (1 minuto TTL)
    this.statusCache = new NodeCache({ stdTTL: 60 })
    // Rate limiting: máximo 10 llamadas por minuto
    this.rateLimiter = {
      requests: new Map(),
      maxRequests: 10,
      windowMs: 60000 // 1 minuto
    }
  }

  /**
   * Verifica si se puede hacer una llamada a la API (rate limiting)
   * @param {string} key - Clave para el rate limiting
   * @returns {boolean} - true si se puede hacer la llamada
   */
  canMakeRequest (key = 'default') {
    const now = Date.now()
    const requests = this.rateLimiter.requests.get(key) || []

    // Filtrar requests dentro de la ventana de tiempo
    const recentRequests = requests.filter(time => now - time < this.rateLimiter.windowMs)

    if (recentRequests.length >= this.rateLimiter.maxRequests) {
      return false
    }

    // Agregar esta request
    recentRequests.push(now)
    this.rateLimiter.requests.set(key, recentRequests)

    return true
  }

  /**
   * Sanitize text for Cobre API - remove special characters that cause CHK004 error
   */
  sanitizeForCobre (text) {
    if (!text) return ''
    // Remove special characters, keep only letters, numbers, spaces, and basic punctuation
    return text
      .replace(/[^\w\s\-\.]/g, '') // Remove special chars except word chars, spaces, hyphens, periods
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .trim()
  }

  /**
   * Generate standardized external ID for better traceability
   * Format: {referenciaProducto}-{procesadorPago}-{orderIdInterno}-{fechaHoraLocal}
   * Example: CURSO-BASICO-cobre-6-2025-06-17-1946
   */
  generateExternalId (productRef, orderId) {
    // Get Colombia time (UTC-5)
    const colombiaTime = new Date(Date.now() - (5 * 60 * 60 * 1000))
    const year = colombiaTime.getUTCFullYear()
    const month = String(colombiaTime.getUTCMonth() + 1).padStart(2, '0')
    const day = String(colombiaTime.getUTCDate()).padStart(2, '0')
    const hour = String(colombiaTime.getUTCHours()).padStart(2, '0')
    const minute = String(colombiaTime.getUTCMinutes()).padStart(2, '0')

    const dateTimeLocal = `${year}-${month}-${day}-${hour}${minute}`

    return `${productRef}-cobre-${orderId}-${dateTimeLocal}`
  }

  /**
   * Generate unique transaction ID for webhook tracking
   * Format: mm_{randomString}
   */
  generateUniqueTransactionId () {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = 'mm_'
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  async authenticate () {
    return auth.authenticate()
  }

  async refreshToken () {
    return auth.refreshToken()
  }

  getAuthHeaders () {
    return auth.getAuthHeaders()
  }

  /**
   * Check if provider is ready (has valid token)
   */
  isTokenValid () {
    return auth.isTokenValid()
  }

  /**
   * Create payment intent (checkout) for order
   */
  async createIntent ({ order, transaction, product }) {
    try {
      logger.info(' Creando checkout en Cobre...')

      // Get account data
      let account = accountsService.getCurrentAccount()
      if (!account || !account.id) {
        // If account is not available, try to initialize it
        logger.info(' Cuenta no disponible, intentando inicializar...')
        const token = await auth.getAccessToken()
        accountsService.setAccessToken(token)
        account = await accountsService.initializeAccount()

        if (!account || !account.id) {
          throw new Error('No se pudo obtener/inicializar la cuenta de Cobre')
        }
      }

      // Get access token
      const token = await auth.getAccessToken()

      // Calculate expiration (24 horas desde ahora)
      const validUntil = new Date(Date.now() + (24 * 60 * 60 * 1000))

      // Generate standardized external ID for better traceability
      const productRef = product?.productRef || order.productRef
      const externalId = this.generateExternalId(productRef, order.id)

      // Prepare checkout data
      const checkoutData = {
        alias: `Order-${order.id}-${Date.now()}`,
        amount: Math.round(order.grandTotal), // Convert to minor units if needed
        external_id: externalId, // Standardized format: {productRef}-cobre-{orderId}-{dateTime}
        destination_id: account.id,
        checkout_rails: ['pse', 'bancolombia', 'nequi', 'breb'], // All available methods for Colombia
        checkout_header: this.sanitizeForCobre(product?.name || 'Innovate Learning').substring(0, 30), // Max 30 characters, sanitized
        checkout_item: this.sanitizeForCobre(`Licencia ${(product?.name || 'Producto')}`).substring(0, 40), // License description, max 40 chars, sanitized
        description_to_payee: this.sanitizeForCobre('Pago Innovate Learning').substring(0, 40), // Standardized description for better visibility
        valid_until: validUntil.toISOString(),
        money_movement_intent_limit: 1, // Single use link
        redirect_url: process.env.PAYMENT_SUCCESS_URL || 'https://innovatelearning.com.co/payment/success',
        metadata: {
          orderId: order.id,
          productRef,
          customerEmail: order.customer?.email
        }
      }

      logger.info(' Datos del checkout:', {
        orderId: order.id,
        amount: checkoutData.amount,
        currency: product?.currency || 'USD',
        destinationId: account.id,
        externalId: checkoutData.external_id,
        checkoutHeader: checkoutData.checkout_header,
        checkoutItem: checkoutData.checkout_item,
        descriptionToPayee: checkoutData.description_to_payee,
        externalIdLength: checkoutData.external_id.length,
        headerLength: checkoutData.checkout_header.length,
        itemLength: checkoutData.checkout_item.length,
        descriptionLength: checkoutData.description_to_payee.length
      })

      // Create checkout
      const response = await axios.post(`${config.cobre.baseUrl}/v1/checkouts`, checkoutData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const checkout = response.data

      logger.info(' Checkout creado exitosamente:', {
        checkoutId: checkout.id,
        checkoutUrl: checkout.checkout_url,
        amount: checkout.amount,
        validUntil: checkout.valid_until,
        uniqueTransactionId: checkout.unique_transaction_id,
        // Log complete response for debugging
        completeResponse: checkout
      })

      return {
        gatewayRef: externalId, // Use external_id as gateway reference for reliable webhook matching
        redirectUrl: checkout.checkout_url,
        meta: {
          checkoutId: checkout.id,
          checkoutUrl: checkout.checkout_url,
          validUntil: checkout.valid_until,
          destinationId: checkout.destination_id,
          externalId,
          // Store both checkout ID and external ID for complete tracking
          orderId: order.id,
          productRef
        }
      }
    } catch (error) {
      logger.error(' Error creando checkout en Cobre:', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        orderId: order.id
      })
      throw error
    }
  }

  /**
   * Parse webhook from Cobre
   */
  parseWebhook (req) {
    // TODO: Implement webhook parsing for Cobre
    // This will be used when Cobre sends payment status updates
    const body = req.body

    return {
      gatewayRef: body.checkout_id || body.id,
      status: this.mapCobreStatus(body.status),
      paymentMethod: body.payment_method || 'unknown',
      amount: body.amount,
      currency: body.currency || 'USD',
      rawData: body
    }
  }

  /**
   * Retrieve checkout status from Cobre API with caching and rate limiting
   * @param {string} checkoutId - The checkout ID from Cobre (chk_xxx)
   * @param {boolean} useCache - Whether to use cache (default: true)
   * @returns {Promise<Object>} - Checkout status and details
   */
  async getCheckoutStatus (checkoutId, useCache = true) {
    try {
      // Verificar cache primero
      const cacheKey = `checkout:${checkoutId}`
      if (useCache) {
        const cached = this.statusCache.get(cacheKey)
        if (cached) {
          logger.debug('📦 Estado del checkout obtenido desde cache:', { checkoutId })
          return cached
        }
      }

      // Verificar rate limiting
      if (!this.canMakeRequest(checkoutId)) {
        const error = new Error('Rate limit exceeded. Máximo 10 llamadas por minuto por checkout.')
        error.code = 'RATE_LIMIT_EXCEEDED'
        throw error
      }

      logger.info('🔍 Consultando estado del checkout en Cobre:', { checkoutId })

      // Get access token
      const token = await auth.getAccessToken()

      // Make GET request to Cobre API
      const response = await axios.get(`${config.cobre.baseUrl}/v1/checkouts/${checkoutId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const checkout = response.data

      logger.info('✅ Estado del checkout obtenido:', {
        checkoutId: checkout.id,
        status: checkout.status,
        amount: checkout.amount,
        externalId: checkout.external_id,
        createdAt: checkout.created_at,
        validUntil: checkout.valid_until
      })

      const result = {
        checkoutId: checkout.id,
        status: checkout.status,
        amount: checkout.amount,
        currency: checkout.currency || 'USD',
        externalId: checkout.external_id,
        createdAt: checkout.created_at,
        validUntil: checkout.valid_until,
        paymentMethod: checkout.payment_method,
        metadata: checkout.metadata,
        rawData: checkout
      }

      // Guardar en cache
      if (useCache) {
        this.statusCache.set(cacheKey, result)
      }

      return result
    } catch (error) {
      if (error.code === 'RATE_LIMIT_EXCEEDED') {
        logger.warn('⚠️ Rate limit excedido para checkout:', { checkoutId })
        throw error
      }

      logger.error('❌ Error consultando estado del checkout:', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        checkoutId
      })
      throw error
    }
  }

  /**
   * Retrieve money movement status from Cobre API
   * @param {string} moneyMovementId - The money movement ID from Cobre (mm_xxx)
   * @param {Object} options - Options for the request
   * @param {boolean} options.nested - Include nested objects (default: false)
   * @param {boolean} options.sensitiveData - Include sensitive data (default: false)
   * @returns {Promise<Object>} - Money movement status and details
   */
  async getMoneyMovementStatus (moneyMovementId, options = {}) {
    try {
      const { nested = false, sensitiveData = false } = options

      logger.info('🔍 Consultando estado del money movement en Cobre:', {
        moneyMovementId,
        nested,
        sensitiveData
      })

      // Get access token
      const accessToken = await auth.getAccessToken()

      // Build query parameters
      const queryParams = new URLSearchParams()
      if (nested) queryParams.append('nested', 'true')
      if (sensitiveData) queryParams.append('sensitive_data', 'true')

      const url = `${config.cobre.baseUrl}/v1/money_movements/${moneyMovementId}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`

      // Make API call to get money movement status
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      const movementData = response.data
      logger.info('✅ Money movement consultado exitosamente:', {
        moneyMovementId,
        status: movementData.status?.state,
        amount: movementData.amount,
        externalId: movementData.external_id
      })

      return {
        moneyMovementId: movementData.id,
        externalId: movementData.external_id,
        status: movementData.status?.state,
        statusCode: movementData.status?.code,
        statusDescription: movementData.status?.description,
        amount: movementData.amount,
        currency: movementData.currency,
        type: movementData.type,
        geography: movementData.geography,
        description: movementData.description,
        trackingKey: movementData.tracking_key,
        reference: movementData.reference,
        cepUrl: movementData.cep_url,
        createdAt: movementData.created_at,
        updatedAt: movementData.updated_at,
        source: movementData.source,
        destination: movementData.destination,
        metadata: movementData.metadata,
        rawData: movementData
      }
    } catch (error) {
      logger.error('❌ Error en getMoneyMovementStatus:', error.message)
      throw error
    }
  }

  /**
   * Map Cobre status to internal status
   */
  mapCobreStatus (cobreStatus) {
    const statusMap = {
      paid: 'PAID',
      completed: 'PAID',
      successful: 'PAID',
      pending: 'PENDING',
      processing: 'PENDING',
      failed: 'FAILED',
      cancelled: 'FAILED',
      expired: 'FAILED'
    }

    return statusMap[cobreStatus?.toLowerCase()] || 'FAILED'
  }

  /**
   * Map Cobre money movement status to internal status
   */
  mapMoneyMovementStatus (movementStatus) {
    const statusMap = {
      completed: 'PAID',
      processing: 'PENDING',
      initiated: 'PENDING',
      under_review: 'PENDING',
      canceled: 'FAILED',
      returned: 'FAILED',
      rejected: 'FAILED',
      failed: 'FAILED'
    }

    return statusMap[movementStatus?.toLowerCase()] || 'FAILED'
  }
}

module.exports = new CobreProvider()
