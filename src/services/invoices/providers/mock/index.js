const logger = require('../../../../config/logger')

/**
 * Proveedor de facturación Mock para testing y desarrollo
 * Simula el comportamiento de un proveedor real sin hacer llamadas externas
 */
class MockProvider {
  constructor () {
    this.mockToken = 'mock-token-123456'
    this.tokenExpiration = null
    this.invoiceCounter = 1000
  }

  /**
   * Simula autenticación
   */
  async authenticate () {
    logger.info('🔐 Autenticación Mock iniciada')
    this.tokenExpiration = new Date(Date.now() + 3600000) // 1 hora
    logger.info('✅ Autenticación Mock exitosa')
    return this.mockToken
  }

  /**
   * Verifica si el token mock es válido
   */
  isTokenValid () {
    return this.tokenExpiration && this.tokenExpiration > new Date()
  }

  /**
   * Simula renovación del token
   */
  async refreshToken () {
    logger.info('🔄 Renovando token Mock')
    return await this.authenticate()
  }

  /**
   * Simula la creación de una factura
   * @param {Object} params - Parámetros de la factura
   * @returns {Promise<Object>} Datos simulados de la factura
   */
  async createInvoice ({ transaction, order, product, customer }) {
    try {
      logger.info(`📄 Creando factura Mock para transacción ${transaction.id}`)

      // Simular delay de procesamiento
      await new Promise(resolve => setTimeout(resolve, 500))

      const mockInvoiceId = `MOCK-${this.invoiceCounter++}`
      const mockInvoiceNumber = `FV-${Date.now()}`

      logger.info('✅ Factura Mock creada exitosamente:', {
        mockInvoiceId,
        mockInvoiceNumber,
        transactionId: transaction.id
      })

      return {
        providerInvoiceId: mockInvoiceId,
        invoiceNumber: mockInvoiceNumber,
        providerProductId: `MOCK-PROD-${product.id}`,
        providerCustomerId: `MOCK-CUSTOMER-${order.customerId}`,
        emailSent: true, // Simula que siempre se envía el email
        acceptedByDian: true, // Simula que siempre es aceptada por DIAN
        providerCreatedAt: new Date(),
        metadata: {
          mockProvider: true,
          originalTransactionId: transaction.id,
          productRef: product.productRef,
          amount: transaction.amount
        }
      }
    } catch (error) {
      logger.error('❌ Error al crear factura Mock:', {
        transactionId: transaction.id,
        message: error.message
      })
      throw error
    }
  }

  /**
   * Simula consulta del estado de una factura
   * @param {string} providerInvoiceId - ID de la factura mock
   * @returns {Promise<Object>} Estado simulado de la factura
   */
  async getInvoiceStatus (providerInvoiceId) {
    try {
      logger.debug(`🔍 Consultando estado de factura Mock ${providerInvoiceId}`)

      // Simular delay de consulta
      await new Promise(resolve => setTimeout(resolve, 200))

      return {
        emailSent: true,
        acceptedByDian: true,
        metadata: {
          mockProvider: true,
          invoiceId: providerInvoiceId,
          statusCheckedAt: new Date()
        }
      }
    } catch (error) {
      logger.error('❌ Error al consultar estado de factura Mock:', {
        providerInvoiceId,
        message: error.message
      })
      throw error
    }
  }

  /**
   * Simula listado de facturas
   * @param {string} createdStart - Fecha de inicio
   * @returns {Promise<Array>} Lista simulada de facturas
   */
  async listInvoices (createdStart) {
    try {
      logger.debug(`📋 Listando facturas Mock desde: ${createdStart}`)

      // Simular delay de consulta
      await new Promise(resolve => setTimeout(resolve, 300))

      // Generar facturas mock de ejemplo
      const mockInvoices = []
      const startDate = new Date(createdStart)
      const now = new Date()

      // Generar entre 0 y 5 facturas mock
      const count = Math.floor(Math.random() * 6)
      for (let i = 0; i < count; i++) {
        const invoiceDate = new Date(startDate.getTime() + (Math.random() * (now.getTime() - startDate.getTime())))
        mockInvoices.push({
          id: `MOCK-${1000 + i}`,
          number: `FV-${Date.now() + i}`,
          date: invoiceDate.toISOString().slice(0, 10),
          customer: {
            id: `MOCK-CUSTOMER-${i}`,
            name: `Cliente Mock ${i + 1}`
          },
          items: [
            {
              id: `MOCK-ITEM-${i}`,
              code: `MOCK-PROD-${i}`,
              description: `Producto Mock ${i + 1}`,
              quantity: 1,
              price: (Math.random() * 100000) + 10000
            }
          ],
          total: (Math.random() * 100000) + 10000,
          mail: { status: 'sent' },
          stamp: { status: 'Accepted' }
        })
      }

      logger.info(`✅ Se generaron ${mockInvoices.length} facturas Mock desde ${createdStart}`)
      return mockInvoices
    } catch (error) {
      logger.error('❌ Error al listar facturas Mock:', {
        createdStart,
        message: error.message
      })
      throw error
    }
  }
}

module.exports = MockProvider
