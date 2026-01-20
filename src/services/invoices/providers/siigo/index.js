const axios = require('axios')
const logger = require('../../../../config/logger')
const SiigoAuthService = require('./auth')
const SiigoProductService = require('./productService')
const SiigoCustomerService = require('./customers')

/**
 * Proveedor de facturación para Siigo
 * Implementa la interfaz estándar de proveedores de facturación
 */
class SiigoProvider {
  constructor () {
    this.authService = new SiigoAuthService()
    this.productService = new SiigoProductService()
    this.customerService = new SiigoCustomerService(this.authService, process.env.SIIGO_API_URL, process.env.SIIGO_PARTNER_ID)
    this.baseURL = process.env.SIIGO_API_URL
    this.partnerId = process.env.SIIGO_PARTNER_ID

    // Configuración por defecto para facturas
    this.defaultConfig = {
      documentId: parseInt(process.env.SIIGO_SALES_DOCUMENT_ID, 10),
      sellerId: parseInt(process.env.SIIGO_SELLER_ID, 10),
      paymentTypeId: parseInt(process.env.SIIGO_PAYMENT_TYPE_ID, 10),
      stampEnabled: process.env.SIIGO_STAMP_ENABLED !== 'false', // true por defecto
      mailEnabled: process.env.SIIGO_MAIL_ENABLED !== 'false', // true por defecto
      defaultCustomer: {
        person_type: 'Person',
        id_type: '13',
        identification: '222222222',
        branch_office: 0,
        name: ['CLIENTE NO REGISTRADO', 'CLIENTE NO REGISTRADO']
      }
    }
  }

  /**
   * Autentica con el proveedor
   */
  async authenticate () {
    return await this.authService.authenticate()
  }

  /**
   * Verifica si el token es válido
   */
  isTokenValid () {
    return this.authService.isTokenValid()
  }

  /**
   * Fuerza la renovación del token
   */
  async refreshToken () {
    return await this.authService.refreshToken()
  }

  /**
   * Crea una factura en Siigo
   * @param {Object} invoiceData - Datos de la factura
   * @param {Object} transaction - Transacción del sistema
   * @param {Object} order - Orden del sistema
   * @param {Object} product - Producto del sistema
   * @param {Object} customer - Cliente del sistema
   * @returns {Promise<Object>} Respuesta de Siigo con datos de la factura
   */
  async createInvoice ({ transaction, order, product, customer }) {
    try {
      logger.info(`📄 Creando factura en Siigo para transacción ${transaction.id}`)

      // Validar que el producto tenga referencia
      if (!product.productRef) {
        throw new Error(`Producto ${product.id} no tiene referencia (productRef)`)
      }

      // Buscar el producto en Siigo
      const siigoProduct = await this.productService.findProductByCode(product.productRef)
      if (!siigoProduct) {
        throw new Error(`Producto con referencia "${product.productRef}" no encontrado en Siigo`)
      }

      // Obtener o crear cliente en Siigo
      const siigoCustomer = await this.customerService.getOrCreateCustomer({
        firstName: customer.first_name || customer.firstName,
        lastName: customer.last_name || customer.lastName,
        email: customer.email,
        phone: customer.phone,
        documentType: customer.document_type || customer.documentType,
        documentNumber: customer.document_number || customer.documentNumber
      })

      // Obtener token de autenticación
      const token = await this.authService.getAccessToken()

      // Validar fecha para facturas electrónicas (no puede ser anterior a hoy)
      const invoiceDate = new Date().toISOString().slice(0, 10)
      const today = new Date().toISOString().slice(0, 10)
      if (invoiceDate < today) {
        throw new Error('La fecha de la factura electrónica no puede ser anterior a la fecha actual')
      }

      // Construir datos de la factura
      const invoiceData = {
        document: { id: this.defaultConfig.documentId },
        date: invoiceDate,
        customer: siigoCustomer,
        seller: this.defaultConfig.sellerId,
        items: [
          {
            code: product.productRef,
            quantity: 1, // Siempre 1 para facturación por monto de transacción
            price: transaction.amount / 100, // Precio de la transacción en pesos
            description: product.description || product.name,
            discount: 0
          }
        ],
        payments: [
          {
            id: this.defaultConfig.paymentTypeId,
            value: transaction.amount / 100, // Convertir de centavos a pesos
            due_date: new Date().toISOString().slice(0, 10) // Fecha de vencimiento (mismo día)
          }
        ]
      }

      // Agregar campo stamp solo si está habilitado
      // Según la documentación de Siigo, stamp debe ser un objeto con propiedad "send"
      if (this.defaultConfig.stampEnabled) {
        invoiceData.stamp = { send: true }
      }

      // Agregar campo mail solo si está habilitado
      // Según la documentación de Siigo, mail debe ser un objeto con propiedad "send"
      if (this.defaultConfig.mailEnabled) {
        invoiceData.mail = { send: true }
      }

      logger.info('📋 Configuración de envío de factura:', {
        transactionId: transaction.id,
        stampEnabled: this.defaultConfig.stampEnabled,
        mailEnabled: this.defaultConfig.mailEnabled,
        willSendToDian: this.defaultConfig.stampEnabled,
        willSendEmail: this.defaultConfig.mailEnabled
      })

      logger.debug('📋 Datos de factura a enviar:', JSON.stringify(invoiceData, null, 2))

      // Enviar solicitud a Siigo
      const response = await axios.post(`${this.baseURL}/v1/invoices`, invoiceData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Partner-Id': this.partnerId
        }
      })

      const invoice = response.data

      // Log detallado del estado de envío a DIAN y correo
      const dianStatus = invoice.stamp?.status || 'N/A'
      const mailStatus = invoice.mail?.status || 'N/A'

      logger.info('✅ Factura creada exitosamente en Siigo:', {
        siigoInvoiceId: invoice.id,
        invoiceNumber: invoice.number,
        transactionId: transaction.id,
        dianStatus,
        dianSent: this.defaultConfig.stampEnabled,
        dianAccepted: dianStatus === 'Accepted',
        mailStatus,
        mailSent: this.defaultConfig.mailEnabled,
        mailDelivered: mailStatus === 'sent'
      })

      // Log específico sobre el estado de DIAN
      if (this.defaultConfig.stampEnabled) {
        if (dianStatus === 'Accepted') {
          logger.info('✅ Factura aceptada por la DIAN:', {
            transactionId: transaction.id,
            invoiceNumber: invoice.number,
            cufe: invoice.stamp?.cufe || 'N/A'
          })
        } else if (dianStatus === 'Rejected') {
          logger.warn('⚠️ Factura rechazada por la DIAN:', {
            transactionId: transaction.id,
            invoiceNumber: invoice.number,
            rejectionReason: invoice.stamp?.rejection_reason || 'Razón no especificada'
          })
        } else if (dianStatus === 'Draft') {
          logger.warn('⚠️ Factura en estado Draft (no enviada a DIAN):', {
            transactionId: transaction.id,
            invoiceNumber: invoice.number,
            note: 'La factura fue creada pero no se envió a la DIAN'
          })
        } else {
          logger.info('ℹ️ Estado de DIAN:', {
            transactionId: transaction.id,
            invoiceNumber: invoice.number,
            status: dianStatus
          })
        }
      } else {
        logger.warn('⚠️ Envío a DIAN deshabilitado (stamp: false):', {
          transactionId: transaction.id,
          invoiceNumber: invoice.number,
          note: 'La factura NO se enviará a la DIAN automáticamente'
        })
      }

      // Log específico sobre el estado del correo
      if (this.defaultConfig.mailEnabled) {
        if (mailStatus === 'sent') {
          logger.info('✅ Factura enviada por correo al cliente:', {
            transactionId: transaction.id,
            invoiceNumber: invoice.number,
            customerEmail: customer.email
          })
        } else {
          logger.warn('⚠️ Factura no enviada por correo:', {
            transactionId: transaction.id,
            invoiceNumber: invoice.number,
            mailStatus,
            customerEmail: customer.email
          })
        }
      } else {
        logger.info('ℹ️ Envío por correo deshabilitado (mail: false):', {
          transactionId: transaction.id,
          invoiceNumber: invoice.number
        })
      }

      return {
        providerInvoiceId: invoice.id.toString(),
        invoiceNumber: invoice.number,
        providerProductId: siigoProduct.id.toString(),
        providerCustomerId: invoice.customer?.id?.toString(),
        emailSent: invoice.mail?.status === 'sent',
        acceptedByDian: invoice.stamp?.status === 'Accepted',
        providerCreatedAt: new Date(invoice.date),
        metadata: {
          siigoResponse: invoice,
          productCode: product.productRef,
          originalAmount: transaction.amount
        }
      }
    } catch (error) {
      logger.error('❌ Error al crear factura en Siigo:', {
        transactionId: transaction.id,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      })
      throw error
    }
  }

  /**
   * Consulta el estado de una factura en Siigo
   * @param {string} providerInvoiceId - ID de la factura en Siigo
   * @returns {Promise<Object>} Estado de la factura
   */
  async getInvoiceStatus (providerInvoiceId) {
    try {
      logger.debug(`🔍 Consultando estado de factura ${providerInvoiceId} en Siigo`)

      const token = await this.authService.getAccessToken()

      const response = await axios.get(`${this.baseURL}/v1/invoices/${providerInvoiceId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Partner-Id': this.partnerId
        }
      })

      const invoice = response.data
      return {
        emailSent: invoice.mail?.status === 'sent',
        acceptedByDian: invoice.stamp?.status === 'Accepted',
        metadata: invoice
      }
    } catch (error) {
      logger.error('❌ Error al consultar estado de factura en Siigo:', {
        providerInvoiceId,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      })
      throw error
    }
  }

  /**
   * Lista facturas desde una fecha específica
   * @param {string} createdStart - Fecha de inicio en formato YYYY-MM-DD
   * @returns {Promise<Array>} Lista de facturas
   */
  async listInvoices (createdStart) {
    try {
      logger.debug(`📋 Listando facturas desde: ${createdStart}`)

      const token = await this.authService.getAccessToken()
      let allInvoices = []
      let url = `${this.baseURL}/v1/invoices?created_start=${createdStart}`

      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Partner-Id': this.partnerId
      }

      while (url) {
        const response = await axios.get(url, { headers })
        const data = response.data
        allInvoices = allInvoices.concat(data.results)

        if (data._links && data._links.next && data._links.next.href) {
          url = data._links.next.href
        } else {
          url = null
        }
      }

      logger.info(`✅ Se obtuvieron ${allInvoices.length} facturas desde ${createdStart}`)
      return allInvoices
    } catch (error) {
      logger.error('❌ Error al listar facturas de Siigo:', {
        createdStart,
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      })
      throw error
    }
  }
}

module.exports = SiigoProvider
