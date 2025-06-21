const logger = require('../config/logger')

/**
 * Authentication Manager - Manejo thread-safe de autenticación de providers
 * Resuelve race conditions y maneja tokens de forma segura para alta concurrencia
 */
class AuthenticationManager {
  constructor() {
    // Map de providers con sus estados de autenticación
    this.providers = new Map()
    
    // Locks para prevenir race conditions por provider
    this.authLocks = new Map()
  }

  /**
   * Registra un provider para manejo de autenticación
   * @param {string} providerName - Nombre del provider
   * @param {Object} provider - Instancia del provider
   */
  registerProvider(providerName, provider) {
    if (!provider.authenticate || typeof provider.authenticate !== 'function') {
      throw new Error(`Provider ${providerName} must have authenticate() method`)
    }

    this.providers.set(providerName, {
      instance: provider,
      token: null,
      tokenExpiration: null,
      lastAuthAttempt: null,
      authPromise: null // Para manejar concurrent requests
    })

    logger.debug(`AuthenticationManager: Registered provider ${providerName}`)
  }

  /**
   * Obtiene un provider autenticado de forma thread-safe
   * @param {string} providerName - Nombre del provider
   * @returns {Promise<Object>} - Provider autenticado
   */
  async getAuthenticatedProvider(providerName) {
    const providerData = this.providers.get(providerName)
    if (!providerData) {
      throw new Error(`Provider ${providerName} not registered`)
    }

    // Si el token es válido, retornar inmediatamente
    if (this.isTokenValid(providerName)) {
      return providerData.instance
    }

    // Si ya hay una autenticación en progreso, esperar a que termine
    if (providerData.authPromise) {
      logger.debug(`AuthenticationManager: Waiting for ongoing authentication for ${providerName}`)
      await providerData.authPromise
      return providerData.instance
    }

    // Iniciar nueva autenticación con lock
    return await this.authenticateProvider(providerName)
  }

  /**
   * Autentica un provider de forma thread-safe
   * @param {string} providerName - Nombre del provider
   * @returns {Promise<Object>} - Provider autenticado
   * @private
   */
  async authenticateProvider(providerName) {
    const providerData = this.providers.get(providerName)
    
    // Double-check locking pattern para evitar race conditions
    if (this.isTokenValid(providerName)) {
      return providerData.instance
    }

    // Crear promise de autenticación para que otros requests esperen
    providerData.authPromise = this.performAuthentication(providerName)
    
    try {
      await providerData.authPromise
      return providerData.instance
    } finally {
      // Limpiar el promise cuando termine
      providerData.authPromise = null
    }
  }

  /**
   * Ejecuta la autenticación real
   * @param {string} providerName - Nombre del provider
   * @returns {Promise<void>}
   * @private
   */
  async performAuthentication(providerName) {
    const providerData = this.providers.get(providerName)
    const startTime = Date.now()

    try {
      logger.info(`AuthenticationManager: Starting authentication for ${providerName}`)

      // Prevenir spam de autenticación (rate limiting)
      const timeSinceLastAttempt = providerData.lastAuthAttempt 
        ? Date.now() - providerData.lastAuthAttempt 
        : Infinity

      if (timeSinceLastAttempt < 5000) { // 5 segundos mínimo entre intentos
        logger.warn(`AuthenticationManager: Rate limiting authentication for ${providerName}`)
        await new Promise(resolve => setTimeout(resolve, 5000 - timeSinceLastAttempt))
      }

      providerData.lastAuthAttempt = Date.now()

      // Ejecutar autenticación del provider
      const result = await providerData.instance.authenticate()

      // Actualizar estado de forma atómica
      this.updateProviderToken(providerName, result)

      const duration = Date.now() - startTime
      logger.info(`AuthenticationManager: Authentication successful for ${providerName}`, {
        duration: `${duration}ms`,
        tokenExpiration: providerData.tokenExpiration?.toISOString()
      })

    } catch (error) {
      const duration = Date.now() - startTime
      logger.error(`AuthenticationManager: Authentication failed for ${providerName}`, {
        error: error.message,
        duration: `${duration}ms`,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * Actualiza el token del provider de forma atómica
   * @param {string} providerName - Nombre del provider
   * @param {any} authResult - Resultado de la autenticación
   * @private
   */
  updateProviderToken(providerName, authResult) {
    const providerData = this.providers.get(providerName)
    const provider = providerData.instance

    // Obtener token y expiración del provider según su implementación
    if (provider.accessToken && provider.tokenExpiration) {
      // Para providers como Cobre que exponen directamente el token
      providerData.token = provider.accessToken
      providerData.tokenExpiration = provider.tokenExpiration
    } else if (typeof authResult === 'string') {
      // Si authenticate() retorna el token directamente
      providerData.token = authResult
      // Asumir expiración de 1 hora por defecto
      providerData.tokenExpiration = new Date(Date.now() + 60 * 60 * 1000)
    } else if (authResult && authResult.token) {
      // Si retorna objeto con token
      providerData.token = authResult.token
      providerData.tokenExpiration = authResult.expiration || new Date(Date.now() + 60 * 60 * 1000)
    }

    logger.debug(`AuthenticationManager: Token updated for ${providerName}`, {
      hasToken: !!providerData.token,
      expiration: providerData.tokenExpiration?.toISOString()
    })
  }

  /**
   * Verifica si el token de un provider es válido
   * @param {string} providerName - Nombre del provider
   * @returns {boolean} - true si el token es válido
   */
  isTokenValid(providerName) {
    const providerData = this.providers.get(providerName)
    if (!providerData) return false

    // Verificar usando el método del provider si está disponible
    const provider = providerData.instance
    if (provider.isTokenValid && typeof provider.isTokenValid === 'function') {
      return provider.isTokenValid()
    }

    // Fallback: verificar usando nuestro estado interno
    return providerData.token && 
           providerData.tokenExpiration && 
           providerData.tokenExpiration > new Date()
  }

  /**
   * Fuerza la renovación del token de un provider
   * @param {string} providerName - Nombre del provider
   * @returns {Promise<Object>} - Provider con token renovado
   */
  async forceRefresh(providerName) {
    const providerData = this.providers.get(providerName)
    if (!providerData) {
      throw new Error(`Provider ${providerName} not registered`)
    }

    logger.info(`AuthenticationManager: Force refresh requested for ${providerName}`)

    // Invalidar token actual
    providerData.token = null
    providerData.tokenExpiration = null

    // Si el provider tiene refreshToken, usarlo
    if (providerData.instance.refreshToken && typeof providerData.instance.refreshToken === 'function') {
      try {
        const result = await providerData.instance.refreshToken()
        this.updateProviderToken(providerName, result)
        return providerData.instance
      } catch (error) {
        logger.warn(`AuthenticationManager: RefreshToken failed for ${providerName}, falling back to authenticate`)
      }
    }

    // Fallback: autenticación completa
    return await this.authenticateProvider(providerName)
  }

  /**
   * Obtiene estadísticas de autenticación
   * @returns {Object} - Estadísticas de todos los providers
   */
  getAuthenticationStats() {
    const stats = {}
    
    for (const [providerName, providerData] of this.providers) {
      stats[providerName] = {
        hasToken: !!providerData.token,
        tokenValid: this.isTokenValid(providerName),
        tokenExpiration: providerData.tokenExpiration?.toISOString(),
        lastAuthAttempt: providerData.lastAuthAttempt,
        isAuthenticating: !!providerData.authPromise
      }
    }

    return {
      providers: stats,
      totalProviders: this.providers.size,
      authenticatedProviders: Object.values(stats).filter(p => p.tokenValid).length
    }
  }

  /**
   * Limpia el estado de autenticación (útil para testing)
   * @param {string} providerName - Nombre del provider (opcional)
   */
  clear(providerName = null) {
    if (providerName) {
      const providerData = this.providers.get(providerName)
      if (providerData) {
        providerData.token = null
        providerData.tokenExpiration = null
        providerData.authPromise = null
        providerData.lastAuthAttempt = null
      }
    } else {
      this.providers.clear()
      this.authLocks.clear()
    }
  }
}

// Exportar singleton
module.exports = new AuthenticationManager()