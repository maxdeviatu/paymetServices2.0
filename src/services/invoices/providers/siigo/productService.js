const axios = require('axios')
const logger = require('../../../../config/logger')
const SiigoAuthService = require('./auth')

/**
 * Servicio para gestionar productos en Siigo
 */
class SiigoProductService {
  constructor() {
    this.authService = new SiigoAuthService()
    this.baseURL = process.env.SIIGO_API_URL
    this.partnerId = process.env.SIIGO_PARTNER_ID
  }

  /**
   * Busca un producto en Siigo por su código/referencia
   * @param {string} productCode - Código del producto a buscar
   * @returns {Promise<Object|null>} Producto encontrado o null
   */
  async findProductByCode(productCode) {
    try {
      const trimmedCode = productCode ? productCode.trim() : ''
      logger.debug(`🔍 Buscando producto con código: "${trimmedCode}"`)

      const token = await this.authService.getAccessToken()

      const response = await axios.get(`${this.baseURL}/v1/products`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Partner-Id': this.partnerId
        },
        params: {
          code: trimmedCode,
          page: 1,
          page_size: 25
        }
      })

      const products = response.data.results
      if (!products || products.length === 0) {
        logger.warn(`⚠️ No se encontró producto con código: "${trimmedCode}"`)
        return null
      }

      const foundProduct = products[0]
      logger.info(`✅ Producto encontrado en Siigo. Código: "${trimmedCode}", ID: ${foundProduct.id}`)
      return foundProduct
    } catch (error) {
      logger.error('❌ Error al buscar producto en Siigo:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      })
      throw error
    }
  }

  /**
   * Busca un producto por ID
   * @param {string} productId - ID del producto en Siigo
   * @returns {Promise<Object|null>} Producto encontrado o null
   */
  async getProductById(productId) {
    try {
      logger.debug(`🔍 Obteniendo producto por ID: ${productId}`)

      const token = await this.authService.getAccessToken()

      const response = await axios.get(`${this.baseURL}/v1/products/${productId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Partner-Id': this.partnerId
        }
      })

      logger.info(`✅ Producto obtenido de Siigo. ID: ${productId}`)
      return response.data
    } catch (error) {
      if (error.response?.status === 404) {
        logger.warn(`⚠️ Producto no encontrado en Siigo. ID: ${productId}`)
        return null
      }

      logger.error('❌ Error al obtener producto de Siigo:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      })
      throw error
    }
  }
}

module.exports = SiigoProductService
