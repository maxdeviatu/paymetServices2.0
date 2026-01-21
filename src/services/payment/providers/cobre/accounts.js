const axios = require('axios')
const config = require('../../../../config')
const logger = require('../../../../config/logger')

class CobreAccountsService {
  constructor () {
    this.baseURL = config.cobre.baseUrl
    this.accessToken = null
    this.account = null
  }

  /**
   * Establece el token de acceso para las peticiones
   */
  setAccessToken (token) {
    this.accessToken = token
  }

  /**
   * Busca una cuenta existente por su alias
   * @param {string} alias - Alias de la cuenta a buscar
   * @param {Object} options - Opciones
   * @param {boolean} options.silent - Si es true, no emite logs
   */
  async findAccountByAlias (alias, options = {}) {
    const { silent = false } = options
    try {
      if (!silent) {
        logger.info('🔍 Buscando cuenta Cobre por alias:', alias)
      }

      const response = await axios.get(`${this.baseURL}/v1/accounts`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          alias,
          provider_id: 'pr_col_cobre'
        }
      })

      if (response.data.contents && response.data.contents.length > 0) {
        const account = response.data.contents[0]
        if (!silent) {
          logger.info('✅ Cuenta Cobre encontrada:', {
            id: account.id,
            alias: account.alias,
            status: account.connectivity?.status
          })
        }
        return account
      }

      if (!silent) {
        logger.info('ℹ️ No se encontró cuenta Cobre con el alias:', alias)
      }
      return null
    } catch (error) {
      logger.error('❌ Error al buscar cuenta Cobre:', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      })
      throw error
    }
  }

  /**
   * Crea una nueva cuenta de balance
   * @param {string} alias - Alias para la cuenta
   * @param {Object} options - Opciones
   * @param {boolean} options.silent - Si es true, no emite logs
   */
  async createBalanceAccount (alias, options = {}) {
    const { silent = false } = options
    try {
      if (!silent) {
        logger.info('📝 Creando nueva cuenta Cobre con alias:', alias)
      }

      const response = await axios.post(`${this.baseURL}/v1/accounts`, {
        provider_id: 'pr_col_cobre',
        alias,
        action: 'create'
      }, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      const account = response.data
      if (!silent) {
        logger.info('✅ Cuenta Cobre creada exitosamente:', {
          id: account.id,
          alias: account.alias,
          status: account.connectivity?.status
        })
      }

      return account
    } catch (error) {
      logger.error('❌ Error al crear cuenta Cobre:', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      })
      throw error
    }
  }

  /**
   * Inicializa o recupera la cuenta de balance
   * @param {Object} options - Opciones
   * @param {boolean} options.silent - Si es true, no emite logs
   */
  async initializeAccount (options = {}) {
    const { silent = false } = options
    try {
      if (!this.accessToken) {
        throw new Error('No hay token de acceso disponible')
      }

      const alias = 'Colombian Innovate Payment Services'

      // Buscar cuenta existente
      let account = await this.findAccountByAlias(alias, { silent })

      // Si no existe, crear nueva cuenta
      if (!account) {
        account = await this.createBalanceAccount(alias, { silent })
      }

      // Almacenar cuenta en memoria
      this.account = account

      if (!silent) {
        logger.info('✅ Cuenta Cobre inicializada:', {
          id: account.id,
          alias: account.alias,
          status: account.connectivity?.status
        })
      }

      return account
    } catch (error) {
      logger.error('❌ Error al inicializar cuenta Cobre:', error.message)
      throw error
    }
  }

  /**
   * Obtiene la cuenta actual
   */
  getCurrentAccount () {
    return this.account
  }
}

// Exportar una única instancia del servicio
module.exports = new CobreAccountsService()
