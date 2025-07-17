const axios = require('axios')
const logger = require('../../../../config/logger')

/**
 * Servicio para gestión de clientes en Siigo
 */
class SiigoCustomerService {
  constructor (authService, baseURL, partnerId) {
    this.authService = authService
    this.baseURL = baseURL
    this.partnerId = partnerId

    // Cliente por defecto (consumidor final)
    this.defaultCustomer = {
      person_type: 'Person',
      id_type: '13', // Cédula de ciudadanía
      identification: '222222222',
      branch_office: 0,
      name: ['CONSUMIDOR', 'FINAL']
    }
  }

  /**
   * Busca un cliente en Siigo por número de documento
   * @param {string} documentNumber - Número de documento del cliente
   * @returns {Promise<Object|null>} Cliente encontrado o null
   */
  async findCustomerByDocument (documentNumber) {
    try {
      const token = await this.authService.getAccessToken()

      logger.debug(`🔍 Buscando cliente por documento: ${documentNumber}`)

      const response = await axios.get(`${this.baseURL}/v1/customers`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Partner-Id': this.partnerId
        },
        params: {
          identification: documentNumber,
          page: 1,
          page_size: 25
        }
      })

      const customers = response.data.results
      if (!customers || customers.length === 0) {
        logger.debug(`Cliente con documento ${documentNumber} no encontrado en Siigo`)
        return null
      }

      const customer = customers[0]
      logger.info(`✅ Cliente encontrado en Siigo: ${customer.name.join(' ')} (${documentNumber})`)
      return customer
    } catch (error) {
      logger.error(`❌ Error buscando cliente por documento ${documentNumber}:`, {
        status: error.response?.status,
        message: error.message
      })
      return null
    }
  }

  /**
   * Crea un nuevo cliente en Siigo
   * @param {Object} userData - Datos del usuario del sistema
   * @returns {Promise<Object|null>} Cliente creado o null si falla
   */
  async createCustomer (userData) {
    try {
      const token = await this.authService.getAccessToken()

      logger.info(`👤 Creando cliente en Siigo: ${userData.firstName} ${userData.lastName}`)

      const customerData = {
        type: 'Customer',
        person_type: 'Person',
        id_type: this.mapDocumentType(userData.documentType),
        identification: userData.documentNumber,
        name: [userData.firstName, userData.lastName],
        branch_office: 0,
        active: true,
        vat_responsible: false,
        fiscal_responsibilities: [
          {
            code: 'R-99-PN' // Régimen simplificado - persona natural
          }
        ],
        phones: userData.phone ? [
          {
            indicative: '57', // Colombia
            number: userData.phone.replace(/\D/g, '').slice(-10), // Solo números, máximo 10 dígitos
            extension: ''
          }
        ] : [],
        contacts: [
          {
            first_name: userData.firstName,
            last_name: userData.lastName,
            email: userData.email,
            phone: userData.phone ? {
              indicative: '57',
              number: userData.phone.replace(/\D/g, '').slice(-10), // Solo números, máximo 10 dígitos
              extension: ''
            } : undefined
          }
        ],
        comments: 'Cliente creado automáticamente desde sistema de pagos'
      }

      const response = await axios.post(`${this.baseURL}/v1/customers`, customerData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Partner-Id': this.partnerId
        }
      })

      const customer = response.data
      logger.info('✅ Cliente creado exitosamente en Siigo:', {
        customerId: customer.id,
        name: customer.name.join(' '),
        identification: customer.identification
      })

      return customer
    } catch (error) {
      logger.error('❌ Error creando cliente en Siigo:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      })
      return null
    }
  }

  /**
   * Obtiene o crea un cliente para facturación
   * @param {Object} userData - Datos del usuario del sistema
   * @returns {Promise<Object>} Cliente para usar en la factura
   */
  async getOrCreateCustomer (userData) {
    try {
      logger.debug('🔍 Procesando datos del cliente:', {
        firstName: userData.firstName,
        lastName: userData.lastName,
        documentType: userData.documentType,
        documentNumber: userData.documentNumber,
        email: userData.email
      })

      // 1. Primero intentar buscar el cliente existente
      let customer = await this.findCustomerByDocument(userData.documentNumber)

      if (customer) {
        logger.info(`✅ Usando cliente existente: ${customer.name.join(' ')}`)
        const mappedCustomer = {
          person_type: customer.person_type,
          id_type: typeof customer.id_type === 'object' && customer.id_type !== null ? customer.id_type.code : customer.id_type,
          identification: customer.identification,
          branch_office: customer.branch_office,
          name: customer.name
        }
        logger.debug('📋 Datos del cliente mapeado:', mappedCustomer)
        return mappedCustomer
      }

      // 2. Si no existe, intentar crearlo
      customer = await this.createCustomer(userData)

      if (customer) {
        logger.info(`✅ Usando cliente recién creado: ${customer.name.join(' ')}`)
        const mappedCustomer = {
          person_type: customer.person_type,
          id_type: typeof customer.id_type === 'object' && customer.id_type !== null ? customer.id_type.code : customer.id_type,
          identification: customer.identification,
          branch_office: customer.branch_office,
          name: customer.name
        }
        logger.debug('📋 Datos del cliente recién creado:', mappedCustomer)
        return mappedCustomer
      }

      // 3. Si falla todo, usar cliente por defecto
      logger.warn('⚠️ No se pudo crear/encontrar cliente, usando consumidor final')
      logger.debug('📋 Datos del cliente por defecto:', this.defaultCustomer)
      return this.defaultCustomer
    } catch (error) {
      logger.error('❌ Error en getOrCreateCustomer:', error)
      return this.defaultCustomer
    }
  }

  /**
   * Mapea los tipos de documento del sistema a los códigos de Siigo
   * @param {string} documentType - Tipo de documento del sistema
   * @returns {string} Código de Siigo
   */
  mapDocumentType (documentType) {
    const mapping = {
      CC: '13', // Cédula de ciudadanía
      CE: '22', // Cédula de extranjería
      NIT: '31', // NIT
      PAS: '41', // Pasaporte
      TI: '12', // Tarjeta de identidad
      RC: '11', // Registro civil
      TE: '21', // Tarjeta de extranjería
      NUIP: '91', // NUIP
      PEP: '47', // Permiso especial de permanencia PEP
      PPT: '48' // Permiso protección temporal PPT
    }

    return mapping[documentType] || '13' // Por defecto cédula de ciudadanía
  }
}

module.exports = SiigoCustomerService
