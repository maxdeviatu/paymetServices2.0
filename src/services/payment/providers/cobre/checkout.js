const axios = require('axios')
const config = require('../../../../config')
const logger = require('../../../../config/logger')
const authService = require('./auth')
const accountsService = require('./accounts')

class CobreCheckoutService {
  constructor () {
    this.baseURL = config.cobre.baseUrl
  }

  /**
   * Crea un checkout en Cobre
   * @param {Object} params Parámetros del checkout
   * @returns {Promise<Object>} Datos del checkout creado
   */
  async createCheckout (params) {
    try {
      const token = await authService.getAccessToken()
      const account = await accountsService.getCurrentAccount()

      if (!account) {
        throw new Error('No hay una cuenta Cobre activa')
      }

      const checkoutData = {
        alias: params.alias || 'Innovate Learning Payment',
        amount: params.amount,
        external_id: params.externalId,
        destination_id: account.id,
        checkout_rails: ['pse', 'bancolombia', 'nequi'],
        checkout_header: params.header || 'Innovate Learning - Pago de Licencia',
        checkout_item: params.item || 'Licencia Digital',
        description_to_payee: params.description || 'Pago de licencia digital',
        valid_until: params.validUntil || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        money_movement_intent_limit: 1,
        redirect_url: params.redirectUrl || `${config.appUrl}/payment/complete`
      }

      logger.info('💳 Creando checkout en Cobre:', {
        amount: checkoutData.amount,
        external_id: checkoutData.external_id
      })

      const response = await axios.post(
        `${this.baseURL}/v1/checkouts`,
        checkoutData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      )

      logger.info('✅ Checkout creado exitosamente:', {
        checkout_id: response.data.id,
        checkout_url: response.data.checkout_url
      })

      return response.data
    } catch (error) {
      logger.error('❌ Error al crear checkout en Cobre:', {
        error: error.message,
        response: error.response?.data
      })
      throw error
    }
  }

  /**
   * Obtiene el estado de un checkout
   * @param {string} checkoutId ID del checkout
   * @returns {Promise<Object>} Estado del checkout
   */
  async getCheckoutStatus (checkoutId) {
    try {
      const token = await authService.getAccessToken()

      const response = await axios.get(
        `${this.baseURL}/v1/checkouts/${checkoutId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      return response.data
    } catch (error) {
      logger.error('❌ Error al obtener estado del checkout:', {
        checkout_id: checkoutId,
        error: error.message
      })
      throw error
    }
  }
}

module.exports = new CobreCheckoutService()
