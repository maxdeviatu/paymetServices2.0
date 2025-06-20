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
   */
  async findAccountByAlias (alias) {
    try {
      logger.info('🔍 Buscando cuenta Cobre por alias:', alias)

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
        logger.info('✅ Cuenta Cobre encontrada:', {
          id: account.id,
          alias: account.alias,
          status: account.connectivity?.status
        })
        return account
      }

      logger.info('ℹ️ No se encontró cuenta Cobre con el alias:', alias)
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
   */
  async createBalanceAccount (alias) {
    try {
      logger.info('📝 Creando nueva cuenta Cobre con alias:', alias)

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
      logger.info('✅ Cuenta Cobre creada exitosamente:', {
        id: account.id,
        alias: account.alias,
        status: account.connectivity?.status
      })

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
   */
  async initializeAccount () {
    try {
      if (!this.accessToken) {
        throw new Error('No hay token de acceso disponible')
      }

      const alias = 'Colombian Innovate Payment Services'

      // Buscar cuenta existente
      let account = await this.findAccountByAlias(alias)

      // Si no existe, crear nueva cuenta
      if (!account) {
        account = await this.createBalanceAccount(alias)
      }

      // Almacenar cuenta en memoria
      this.account = account

      logger.info('✅ Cuenta Cobre inicializada:', {
        id: account.id,
        alias: account.alias,
        status: account.connectivity?.status
      })

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
