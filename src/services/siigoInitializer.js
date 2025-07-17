const SiigoAuthService = require('../services/invoices/providers/siigo/auth')
const logger = require('../config/logger')

/**
 * Servicio para inicializar y verificar la conexión con Siigo al arranque
 */
class SiigoInitializer {
  constructor () {
    this.siigoAuth = new SiigoAuthService()
    this.isInitialized = false
    this.connectionStatus = {
      connected: false,
      lastAttempt: null,
      error: null,
      token: null,
      tokenExpiration: null
    }
  }

  /**
   * Inicializa la conexión con Siigo y verifica credenciales
   */
  async initialize () {
    try {
      logger.info('🔌 Inicializando conexión con Siigo...')

      // Validar que las variables de entorno estén configuradas
      const requiredEnvVars = [
        'SIIGO_API_URL',
        'SIIGO_USERNAME',
        'SIIGO_ACCESS_KEY',
        'SIIGO_PARTNER_ID'
      ]

      const missingVars = requiredEnvVars.filter(varName => !process.env[varName])
      if (missingVars.length > 0) {
        throw new Error(`Variables de entorno faltantes para Siigo: ${missingVars.join(', ')}`)
      }

      // Intentar autenticación
      this.connectionStatus.lastAttempt = new Date()
      const token = await this.siigoAuth.authenticate()

      this.connectionStatus.connected = true
      this.connectionStatus.token = token ? '***' + token.slice(-8) : null // Solo mostrar últimos 8 caracteres
      this.connectionStatus.tokenExpiration = this.siigoAuth.tokenExpiration
      this.connectionStatus.error = null
      this.isInitialized = true

      logger.info('✅ Conexión con Siigo establecida exitosamente')
      logger.info(`🔑 Token obtenido: ${this.connectionStatus.token}`)
      logger.info(`⏰ Token expira: ${this.connectionStatus.tokenExpiration?.toLocaleString('es-CO')}`)

      return {
        success: true,
        status: this.connectionStatus
      }
    } catch (error) {
      this.connectionStatus.connected = false
      this.connectionStatus.error = error.message
      this.connectionStatus.token = null
      this.connectionStatus.tokenExpiration = null

      logger.error('❌ Error conectando con Siigo:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      })

      // No lanzar el error para que no detenga el arranque del servidor
      // Solo registrar el problema
      logger.warn('⚠️ El servidor continuará sin conexión a Siigo. Las facturas no podrán generarse.')

      return {
        success: false,
        error: error.message,
        status: this.connectionStatus
      }
    }
  }

  /**
   * Obtiene el estado actual de la conexión
   */
  getStatus () {
    return {
      isInitialized: this.isInitialized,
      ...this.connectionStatus,
      provider: 'siigo',
      configuredProvider: process.env.INVOICE_PROVIDER || 'siigo'
    }
  }

  /**
   * Verifica si Siigo está disponible para usar
   */
  isAvailable () {
    return this.isInitialized && this.connectionStatus.connected && this.siigoAuth.isTokenValid()
  }

  /**
   * Intenta reconectar con Siigo
   */
  async reconnect () {
    logger.info('🔄 Intentando reconectar con Siigo...')
    return await this.initialize()
  }

  /**
   * Obtiene información resumida para los logs de arranque
   */
  getStartupSummary () {
    const status = this.getStatus()
    return {
      provider: 'Siigo',
      status: status.connected ? 'CONECTADO' : 'DESCONECTADO',
      tokenValid: status.connected && this.siigoAuth.isTokenValid(),
      error: status.error,
      configuredAsDefault: status.configuredProvider === 'siigo'
    }
  }
}

// Exportar una instancia singleton para uso global
const siigoInitializer = new SiigoInitializer()

module.exports = siigoInitializer
