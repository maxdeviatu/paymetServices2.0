const axios = require('axios')
const logger = require('../../../../config/logger')

/**
 * Servicio de autenticación para Siigo
 * Maneja la obtención y gestión de tokens de acceso
 */
class SiigoAuthService {
  constructor () {
    this.accessToken = null
    this.tokenExpiration = null
    this.baseURL = process.env.SIIGO_API_URL
    this.username = process.env.SIIGO_USERNAME
    this.accessKey = process.env.SIIGO_ACCESS_KEY
    this.partnerId = process.env.SIIGO_PARTNER_ID
  }

  /**
   * Autentica con Siigo y obtiene un token de acceso
   * @param {Object} options - Opciones de autenticación
   * @param {boolean} options.silent - Si es true, no emite logs (modo startup estructurado)
   */
  async authenticate (options = {}) {
    const { silent = false } = options
    try {
      if (!silent) {
        logger.info('🔐 Iniciando autenticación con Siigo...')
      }

      const payload = {
        username: this.username,
        access_key: this.accessKey?.replace(/"/g, '')
      }

      const response = await axios.post(`${this.baseURL}/auth`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Partner-Id': this.partnerId
        }
      })

      this.accessToken = response.data.access_token
      // Calcula la expiración: resta 1 minuto para evitar expiración inminente
      this.tokenExpiration = new Date(Date.now() + (response.data.expires_in * 1000) - 60000)

      if (!silent) {
        logger.info('✅ Autenticación con Siigo exitosa')
        logger.debug(`Token expira en: ${this.tokenExpiration.toLocaleString()}`)
      }

      return this.accessToken
    } catch (error) {
      logger.error('❌ Error en la autenticación con Siigo:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      })
      throw error
    }
  }

  /**
   * Verifica si el token actual es válido
   */
  isTokenValid () {
    return this.accessToken && this.tokenExpiration && this.tokenExpiration > new Date()
  }

  /**
   * Obtiene el token de acceso actual o solicita uno nuevo si es necesario
   */
  async getAccessToken () {
    if (!this.isTokenValid()) {
      logger.info('🔄 Token inválido o expirado, re-autenticando...')
      await this.authenticate()
    }
    return this.accessToken
  }

  /**
   * Force refresh del token
   */
  async refreshToken () {
    logger.info('🔄 Forzando refresh del token de Siigo...')
    this.accessToken = null
    this.tokenExpiration = null
    return await this.authenticate()
  }
}

module.exports = SiigoAuthService
