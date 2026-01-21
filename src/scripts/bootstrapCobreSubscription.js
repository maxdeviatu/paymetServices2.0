const axios = require('axios')
const config = require('../config')
const logger = require('../config/logger')
const auth = require('../services/payment/providers/cobre/auth')

/**
 * Script para crear suscripción automática a eventos de Cobre
 * Se ejecuta durante el bootstrap del sistema
 */
class CobreSubscriptionBootstrap {
  constructor () {
    this.baseURL = config.cobre.baseUrl
    this.webhookUrl = config.cobre.webhook.url
    this.webhookSecret = config.cobre.webhook.secret
  }

  /**
   * Ejecuta el bootstrap de suscripción
   * @param {Object} options - Opciones de ejecución
   * @param {boolean} options.silent - Si es true, no emite logs (modo startup estructurado)
   */
  async bootstrap (options = {}) {
    const { silent = false } = options
    try {
      if (!silent) {
        logger.info('🚀 CobreSubscriptionBootstrap: Starting subscription bootstrap')
      }

      // Verificar configuración
      if (!this.webhookUrl || !this.webhookSecret) {
        throw new Error('Missing webhook configuration: COBRE_WEBHOOK_URL or COBRE_WEBHOOK_SECRET')
      }

      // Verificar que la URL sea HTTPS
      if (!this.webhookUrl.startsWith('https://')) {
        throw new Error('Webhook URL must use HTTPS')
      }

      if (!silent) {
        logger.info('📋 Configuration verified:', {
          webhookUrl: this.webhookUrl,
          webhookSecret: this.webhookSecret ? '***configured***' : 'NOT SET',
          baseUrl: this.baseURL
        })

        logger.info('🔐 Getting Cobre access token...')
      }

      const token = await auth.getAccessToken()

      if (!silent) {
        logger.info('✅ Cobre access token obtained successfully')
      }

      // Obtener eventos disponibles (silenciosamente)
      const availableEvents = await this.getAvailableEvents(token, { silent })

      // Definir eventos requeridos - ciclo completo de transacciones
      const requiredEvents = [
        'accounts.balance.credit', // Cuando el dinero llega a nuestro balance
        'money_movements.status.completed', // Cuando una transacción se completa
        'money_movements.status.rejected', // Cuando una transacción es rechazada
        'money_movements.status.failed', // Cuando una transacción falla
        'money_movements.status.canceled' // Cuando una transacción es cancelada
      ]

      // Filtrar eventos disponibles
      const filteredEvents = this.filterAvailableEvents(requiredEvents, availableEvents, { silent })

      // Verificar suscripciones existentes
      if (!silent) {
        logger.info('🔍 Checking existing subscriptions...')
      }
      const existingSubscriptions = await this.getExistingSubscriptions(token)

      if (!silent) {
        logger.info(`📊 Found ${existingSubscriptions.length} existing subscription(s)`)
      }

      // Verificar si ya existe una suscripción para nuestro webhook
      const existingSubscription = existingSubscriptions.find(sub =>
        sub.url === this.webhookUrl
      )

      if (existingSubscription) {
        if (!silent) {
          logger.info('✅ Found existing subscription for our webhook:', {
            subscriptionId: existingSubscription.id,
            url: existingSubscription.url,
            events: existingSubscription.events,
            createdAt: existingSubscription.created_at
          })
        }

        // Verificar si necesitamos actualizar los eventos
        const needsUpdate = this.needsEventUpdate(existingSubscription.events, filteredEvents, { silent })

        if (needsUpdate) {
          if (!silent) {
            logger.info('🔄 Updating subscription events...')
          }
          const updatedSubscription = await this.updateSubscription(token, existingSubscription.id, filteredEvents, { silent })
          if (!silent) {
            logger.info('✅ Subscription updated successfully:', {
              subscriptionId: updatedSubscription.id,
              events: updatedSubscription.events
            })
          }
          return updatedSubscription
        } else {
          if (!silent) {
            logger.info('✅ Subscription is up to date, no changes needed')
          }
          return existingSubscription
        }
      }

      // Crear nueva suscripción
      if (!silent) {
        logger.info('🆕 Creating new subscription...')
      }
      const newSubscription = await this.createSubscription(token, filteredEvents, { silent })

      if (!silent) {
        logger.info('🎉 Subscription created successfully:', {
          subscriptionId: newSubscription.id,
          url: newSubscription.url,
          events: newSubscription.events,
          createdAt: newSubscription.created_at,
          description: newSubscription.description
        })
      }

      return newSubscription
    } catch (error) {
      logger.error('❌ CobreSubscriptionBootstrap: Error during bootstrap', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * Obtiene suscripciones existentes
   * @param {string} token - Token de acceso
   * @returns {Promise<Array>} - Lista de suscripciones
   */
  async getExistingSubscriptions (token) {
    try {
      const response = await axios.get(`${this.baseURL}/v1/subscriptions`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      return response.data.contents || []
    } catch (error) {
      logger.error('CobreSubscriptionBootstrap: Error getting subscriptions', {
        error: error.message,
        status: error.response?.status
      })
      throw error
    }
  }

  /**
   * Verifica si necesita actualizar los eventos de la suscripción
   * @param {Array} currentEvents - Eventos actuales
   * @param {Array} requiredEvents - Eventos requeridos
   * @param {Object} options - Opciones
   * @param {boolean} options.silent - Si es true, no emite logs
   * @returns {boolean} - true si necesita actualización
   */
  needsEventUpdate (currentEvents, requiredEvents, options = {}) {
    const { silent = false } = options
    const missingEvents = requiredEvents.filter(event => !currentEvents.includes(event))

    if (missingEvents.length > 0) {
      if (!silent) {
        logger.info('🔄 Missing events that need to be added:', missingEvents)
      }
      return true
    }

    return false
  }

  /**
   * Crea una nueva suscripción
   * @param {string} token - Token de acceso
   * @param {Array} events - Eventos para la suscripción
   * @param {Object} options - Opciones
   * @param {boolean} options.silent - Si es true, no emite logs
   * @returns {Promise<Object>} - Suscripción creada
   */
  async createSubscription (token, events, options = {}) {
    const { silent = false } = options
    try {
      const subscriptionData = {
        description: 'Innovate Learning Payment Webhooks - Complete Payment Events',
        events,
        url: this.webhookUrl,
        event_signature_key: this.webhookSecret
      }

      if (!silent) {
        logger.info('📝 Creating subscription with data:', {
          description: subscriptionData.description,
          events: subscriptionData.events,
          url: subscriptionData.url,
          hasSignatureKey: !!subscriptionData.event_signature_key
        })
      }

      const response = await axios.post(`${this.baseURL}/v1/subscriptions`, subscriptionData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!silent) {
        logger.info('✅ Subscription API call successful:', {
          status: response.status,
          subscriptionId: response.data.id
        })
      }

      return response.data
    } catch (error) {
      logger.error('❌ CobreSubscriptionBootstrap: Error creating subscription', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        url: this.webhookUrl
      })
      throw error
    }
  }

  /**
   * Actualiza una suscripción existente
   * @param {string} token - Token de acceso
   * @param {string} subscriptionId - ID de la suscripción
   * @param {Array} events - Eventos para la suscripción
   * @param {Object} options - Opciones
   * @param {boolean} options.silent - Si es true, no emite logs
   * @returns {Promise<Object>} - Suscripción actualizada
   */
  async updateSubscription (token, subscriptionId, events, options = {}) {
    const { silent = false } = options
    try {
      const updateData = {
        events
      }

      if (!silent) {
        logger.info('📝 Updating subscription:', {
          subscriptionId,
          events: updateData.events
        })
      }

      const response = await axios.put(`${this.baseURL}/v1/subscriptions/${subscriptionId}`, updateData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!silent) {
        logger.info('✅ Subscription update API call successful:', {
          status: response.status,
          subscriptionId: response.data.id
        })
      }

      return response.data
    } catch (error) {
      logger.error('❌ CobreSubscriptionBootstrap: Error updating subscription', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        subscriptionId
      })
      throw error
    }
  }

  /**
   * Obtiene los eventos disponibles en Cobre
   * @param {string} token - Token de acceso
   * @param {Object} options - Opciones
   * @param {boolean} options.silent - Si es true, no emite logs
   * @returns {Promise<Array>} - Lista de eventos disponibles
   */
  async getAvailableEvents (token, options = {}) {
    const { silent = false } = options
    try {
      if (!silent) {
        logger.info('🔍 Getting available events from Cobre...')
      }

      const response = await axios.get(`${this.baseURL}/v1/subscribable_events`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const availableEvents = response.data.contents || []

      if (!silent) {
        logger.info('📋 Available events from Cobre:', {
          total: availableEvents.length,
          events: availableEvents.map(e => e.subscriptionKey)
        })
      }

      return availableEvents
    } catch (error) {
      logger.error('❌ Error getting available events:', {
        error: error.message,
        status: error.response?.status
      })
      throw error
    }
  }

  /**
   * Filtra los eventos requeridos basándose en los disponibles
   * @param {Array} requiredEvents - Eventos que queremos
   * @param {Array} availableEvents - Eventos disponibles en Cobre
   * @param {Object} options - Opciones
   * @param {boolean} options.silent - Si es true, no emite logs
   * @returns {Array} - Eventos filtrados y disponibles
   */
  filterAvailableEvents (requiredEvents, availableEvents, options = {}) {
    const { silent = false } = options
    const availableKeys = availableEvents.map(e => e.subscriptionKey)

    const filteredEvents = requiredEvents.filter(event => availableKeys.includes(event))
    const missingEvents = requiredEvents.filter(event => !availableKeys.includes(event))

    if (missingEvents.length > 0 && !silent) {
      logger.warn('⚠️ Some required events are not available in Cobre:', missingEvents)
    }

    if (!silent) {
      logger.info('✅ Events that will be subscribed:', filteredEvents)
    }

    return filteredEvents
  }
}

/**
 * Función para ejecutar el bootstrap desde la línea de comandos
 */
async function runBootstrap () {
  try {
    const bootstrap = new CobreSubscriptionBootstrap()
    const result = await bootstrap.bootstrap()

    console.log('✅ Cobre subscription bootstrap completed successfully')
    console.log('📋 Subscription details:')
    console.log(`   ID: ${result.id}`)
    console.log(`   URL: ${result.url}`)
    console.log(`   Events: ${result.events.join(', ')}`)
    console.log(`   Created: ${result.created_at}`)

    process.exit(0)
  } catch (error) {
    console.error('❌ Cobre subscription bootstrap failed:', error.message)
    process.exit(1)
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runBootstrap()
}

module.exports = CobreSubscriptionBootstrap
