const axios = require('axios')
const config = require('../../../../config')
const logger = require('../../../../config/logger')
const accountsService = require('./accounts')

class CobreAuthService {
  constructor () {
    this.baseURL = config.cobre.baseUrl
    this.userId = config.cobre.userId
    this.secret = config.cobre.secret
    this.accessToken = null
    this.tokenExpiration = null
  }

  /**
   * Autentica con Cobre y obtiene un token de acceso
   * @param {Object} options - Opciones de autenticación
   * @param {boolean} options.silent - Si es true, no emite logs (modo startup estructurado)
   */
  async authenticate (options = {}) {
    const { silent = false } = options
    try {
      if (!silent) {
        logger.info(`   URL: ${this.baseURL}/v1/auth`)
      }

      const response = await axios.post(`${this.baseURL}/v1/auth`, {
        user_id: this.userId,
        secret: this.secret
      })

      this.accessToken = response.data.access_token
      this.tokenExpiration = new Date(Date.now() + (response.data.expiration_time * 1000))

      if (!silent) {
        logger.info('✅ Autenticación exitosa')
        logger.info('📊 Detalles:')
        logger.info(`   - Token expira en: ${this.tokenExpiration.toLocaleString()}`)
        logger.info(`   - Duración: ${response.data.expiration_time} segundos`)
      }

      // Establecer el token en el servicio de cuentas
      accountsService.setAccessToken(this.accessToken)

      // Inicializar la cuenta después de autenticarse
      if (!silent) {
        logger.info('\n💳 Inicializando cuenta Cobre...')
      }
      const account = await accountsService.initializeAccount({ silent })

      if (account && !silent) {
        logger.info('✅ Cuenta Cobre lista para uso')
        logger.info(`   - ID: ${account.id}`)
        logger.info(`   - Alias: ${account.alias}`)
        logger.info(`   - Estado: ${account.connectivity?.status}`)
      }

      return this.accessToken
    } catch (error) {
      logger.error('❌ Error en la autenticación con Cobre:')
      logger.error(`   - Mensaje: ${error.message}`)
      logger.error(`   - Status: ${error.response?.status}`)
      logger.error(`   - Respuesta: ${JSON.stringify(error.response?.data)}`)
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
    logger.info('🔄 Forzando refresh del token de Cobre...')
    this.accessToken = null
    this.tokenExpiration = null
    return await this.authenticate()
  }
}

// Exportar una única instancia del servicio
module.exports = new CobreAuthService()
