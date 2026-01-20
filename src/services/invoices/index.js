const logger = require('../../config/logger')
const SiigoProvider = require('./providers/siigo')
const MockProvider = require('./providers/mock')
const { Transaction, Invoice, Order, Product, User } = require('../../models')
const { Op } = require('sequelize')
const TransactionManager = require('../../utils/transactionManager')

/**
 * Servicio orquestador de facturación
 * Maneja múltiples proveedores de facturación y coordina el proceso
 */
class InvoiceService {
  constructor () {
    this.providers = {
      siigo: new SiigoProvider(),
      mock: new MockProvider()
    }
    this.defaultProvider = process.env.INVOICE_PROVIDER || 'siigo'
    this.initialized = false
  }

  /**
   * Inicializa el servicio y autentica proveedores
   */
  async initialize () {
    if (this.initialized) return

    try {
      logger.info('🚀 Inicializando servicio de facturación...')

      // Autenticar proveedores que lo requieran
      for (const [providerName, provider] of Object.entries(this.providers)) {
        if (typeof provider.authenticate === 'function') {
          try {
            await provider.authenticate()
            logger.info(`✅ Proveedor ${providerName} autenticado correctamente`)
          } catch (error) {
            logger.error(`❌ Error autenticando proveedor ${providerName}:`, error.message)
          }
        }
      }

      this.initialized = true
      logger.info('✅ Servicio de facturación inicializado')
    } catch (error) {
      logger.error('❌ Error inicializando servicio de facturación:', error.message)
      throw error
    }
  }

  /**
   * Obtiene un proveedor específico
   * @param {string} providerName - Nombre del proveedor
   * @returns {Object} Instancia del proveedor
   */
  getProvider (providerName = this.defaultProvider) {
    const provider = this.providers[providerName]
    if (!provider) {
      throw new Error(`Proveedor de facturación '${providerName}' no encontrado`)
    }
    return provider
  }

  /**
   * Procesa una transacción individual para generar factura
   * @param {Object} transaction - Transacción a procesar
   * @param {string} providerName - Proveedor a usar
   * @returns {Promise<Object>} Factura generada
   */
  async processTransaction (transaction, providerName = this.defaultProvider) {
    return await TransactionManager.executePaymentTransaction(async (dbTransaction) => {
      try {
        logger.info(`📄 Procesando facturación para transacción ${transaction.id}`)

        // Verificar que la transacción no tenga factura ya
        if (transaction.invoiceId) {
          logger.warn(`⚠️ Transacción ${transaction.id} ya tiene factura asociada`)
          return await Invoice.findByPk(transaction.invoiceId)
        }

        // Verificar que la transacción esté pagada
        if (transaction.status !== 'PAID') {
          logger.warn(`⚠️ Transacción ${transaction.id} no está en estado PAID (actual: ${transaction.status})`)
          return null
        }

        // Obtener datos relacionados
        const order = transaction.order || await Order.findByPk(transaction.orderId, {
          include: [
            { model: Product, as: 'product' },
            { model: User, as: 'customer' }
          ],
          transaction: dbTransaction
        })

        if (!order) {
          throw new Error(`Orden ${transaction.orderId} no encontrada`)
        }

        const product = order.product
        if (!product) {
          throw new Error(`Producto no encontrado para orden ${order.id}`)
        }

        const customer = order.customer
        if (!customer) {
          throw new Error(`Cliente no encontrado para orden ${order.id}`)
        }

        // Obtener proveedor y crear factura
        const provider = this.getProvider(providerName)
        const invoiceData = await provider.createInvoice({
          transaction,
          order,
          product,
          customer
        })

        // Crear registro de factura en la base de datos
        const invoice = await Invoice.create({
          providerInvoiceId: invoiceData.providerInvoiceId,
          invoiceNumber: invoiceData.invoiceNumber,
          transactionId: transaction.id,
          provider: providerName,
          emailSent: invoiceData.emailSent || false,
          acceptedByDian: invoiceData.acceptedByDian || false,
          providerProductId: invoiceData.providerProductId,
          providerCustomerId: invoiceData.providerCustomerId,
          providerCreatedAt: invoiceData.providerCreatedAt,
          metadata: invoiceData.metadata || {},
          status: 'GENERATED'
        }, { transaction: dbTransaction })

        // Actualizar transacción con el ID de la factura
        await transaction.update({
          invoiceId: invoice.id
        }, { transaction: dbTransaction })

        logger.info('✅ Factura generada exitosamente:', {
          invoiceId: invoice.id,
          providerInvoiceId: invoice.providerInvoiceId,
          transactionId: transaction.id,
          provider: providerName
        })

        return invoice
      } catch (error) {
        // Crear registro de factura fallida
        try {
          await Invoice.create({
            transactionId: transaction.id,
            provider: providerName,
            status: 'FAILED',
            errorMessage: error.message,
            metadata: { error: error.message, stack: error.stack }
          }, { transaction: dbTransaction })
        } catch (createError) {
          logger.error('❌ Error creando registro de factura fallida:', createError.message)
        }

        logger.error(`❌ Error procesando facturación para transacción ${transaction.id}:`, error.message)
        throw error
      }
    })
  }

  /**
   * Encuentra transacciones pendientes de facturación
   * @param {Object} options - Opciones de búsqueda
   * @returns {Promise<Array>} Lista de transacciones pendientes
   */
  async findPendingTransactions (options = {}) {
    try {
      const {
        limit = 50,
        fromTransactionId = null,
        includeAll = false
      } = options

      const whereClause = {
        status: 'PAID',
        invoiceId: null // Solo transacciones sin factura
      }

      // Si no es includeAll, buscar desde la última transacción procesada
      if (!includeAll && fromTransactionId) {
        whereClause.id = { [Op.gt]: fromTransactionId }
      }

      const transactions = await Transaction.findAll({
        where: whereClause,
        include: [
          {
            model: Order,
            as: 'order',
            include: [
              { model: Product, as: 'product' },
              { model: User, as: 'customer' }
            ]
          }
        ],
        order: [['id', 'ASC']],
        limit
      })

      logger.info(`🔍 Encontradas ${transactions.length} transacciones pendientes de facturación`)
      return transactions
    } catch (error) {
      logger.error('❌ Error buscando transacciones pendientes:', error.message)
      throw error
    }
  }

  /**
   * Procesa todas las transacciones pendientes de facturación
   * @param {Object} options - Opciones de procesamiento
   * @returns {Promise<Object>} Resultado del procesamiento
   */
  async processAllPendingTransactions (options = {}) {
    try {
      const {
        providerName = this.defaultProvider,
        delayBetweenInvoices = 60000, // 1 minuto por defecto
        includeAll = false
      } = options

      logger.info('🔄 Iniciando procesamiento masivo de facturas...')

      let fromTransactionId = null
      if (!includeAll) {
        // Obtener la última transacción procesada
        const lastInvoice = await Invoice.findOne({
          order: [['transactionId', 'DESC']],
          attributes: ['transactionId']
        })
        fromTransactionId = lastInvoice?.transactionId || 0
      }

      const pendingTransactions = await this.findPendingTransactions({
        fromTransactionId,
        includeAll
      })

      if (pendingTransactions.length === 0) {
        logger.info('✅ No hay transacciones pendientes de facturación')
        return {
          processed: 0,
          successful: 0,
          failed: 0,
          errors: []
        }
      }

      const results = {
        processed: 0,
        successful: 0,
        failed: 0,
        errors: []
      }

      for (const transaction of pendingTransactions) {
        try {
          logger.info(`📋 Procesando transacción ${transaction.id} (${results.processed + 1}/${pendingTransactions.length})`)

          await this.processTransaction(transaction, providerName)
          results.successful++

          // Delay entre facturas para no saturar el proveedor
          if (results.processed < pendingTransactions.length - 1) {
            logger.debug(`⏱️ Esperando ${delayBetweenInvoices}ms antes de la siguiente factura...`)
            await new Promise(resolve => setTimeout(resolve, delayBetweenInvoices))
          }
        } catch (error) {
          results.failed++
          results.errors.push({
            transactionId: transaction.id,
            error: error.message
          })
          logger.error(`❌ Error procesando transacción ${transaction.id}:`, error.message)
        }
        results.processed++
      }

      logger.info('✅ Procesamiento masivo completado:', results)
      return results
    } catch (error) {
      logger.error('❌ Error en procesamiento masivo de facturas:', error.message)
      throw error
    }
  }

  /**
   * Obtiene todas las facturas con paginación
   * @param {Object} options - Opciones de paginación y filtros
   * @returns {Promise<Object>} Facturas paginadas
   */
  async getAllInvoices (options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        provider = null,
        status = null,
        startDate = null,
        endDate = null
      } = options

      const whereClause = {}
      if (provider) whereClause.provider = provider
      if (status) whereClause.status = status
      if (startDate || endDate) {
        whereClause.createdAt = {}
        if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate)
        if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate)
      }

      const offset = (page - 1) * limit

      const { count, rows: invoices } = await Invoice.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: Transaction,
            as: 'transaction',
            include: [
              {
                model: Order,
                as: 'order',
                include: [
                  { model: Product, as: 'product' }
                ]
              }
            ]
          }
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset
      })

      return {
        invoices,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit)
        }
      }
    } catch (error) {
      logger.error('❌ Error obteniendo facturas:', error.message)
      throw error
    }
  }

  /**
   * Actualiza el estado de una factura consultando al proveedor
   * @param {number} invoiceId - ID de la factura
   * @returns {Promise<Object>} Factura actualizada
   */
  async updateInvoiceStatus (invoiceId) {
    try {
      const invoice = await Invoice.findByPk(invoiceId)
      if (!invoice) {
        throw new Error(`Factura ${invoiceId} no encontrada`)
      }

      const provider = this.getProvider(invoice.provider)
      const statusData = await provider.getInvoiceStatus(invoice.providerInvoiceId)

      await invoice.update({
        emailSent: statusData.emailSent,
        acceptedByDian: statusData.acceptedByDian,
        metadata: { ...invoice.metadata, ...statusData.metadata }
      })

      logger.info(`✅ Estado de factura ${invoiceId} actualizado`)
      return invoice
    } catch (error) {
      logger.error(`❌ Error actualizando estado de factura ${invoiceId}:`, error.message)
      throw error
    }
  }

  /**
   * Corrige el estado de transacciones PAID que tienen estados de facturación incorrectos
   *
   * Corrige transacciones con:
   * - invoiceStatus: 'FAILED' → 'COMPLETED' (si tienen factura) o 'PENDING' (si no tienen)
   * - invoiceStatus: 'NOT_REQUIRED' → 'PENDING' (las transacciones PAID no pueden ser NOT_REQUIRED)
   *
   * IMPORTANTE: Excluye automáticamente las transacciones de test que empiecen con "TEST" en gatewayRef
   * Estas transacciones deben mantener su estado de facturación como NOT_REQUIRED
   *
   * @returns {Promise<Object>} Resultado de la corrección
   */
  async fixFailedInvoiceStatus () {
    try {
      logger.info('🔧 Iniciando corrección de estados de facturación...')

      // Buscar transacciones con status PAID pero invoiceStatus incorrecto (FAILED o NOT_REQUIRED)
      // Excluir transacciones de test que empiecen con "TEST"
      const failedTransactions = await Transaction.findAll({
        where: {
          status: 'PAID',
          invoiceStatus: {
            [Op.in]: ['FAILED', 'NOT_REQUIRED'] // Corregir tanto FAILED como NOT_REQUIRED
          },
          gatewayRef: {
            [Op.notLike]: 'TEST%' // Excluir transacciones que empiecen con "TEST"
          }
        },
        include: [
          {
            model: Invoice,
            as: 'invoice',
            required: false // LEFT JOIN para incluir transacciones sin factura
          }
        ]
      })

      // Contar cuántas transacciones de test fueron excluidas para transparencia
      const totalIncorrectTransactions = await Transaction.count({
        where: {
          status: 'PAID',
          invoiceStatus: {
            [Op.in]: ['FAILED', 'NOT_REQUIRED']
          }
        }
      })

      const testTransactionsExcluded = totalIncorrectTransactions - failedTransactions.length
      if (testTransactionsExcluded > 0) {
        logger.info(`🚫 Excluidas ${testTransactionsExcluded} transacciones de test (empiezan con "TEST")`)
      }

      logger.info(`🔍 Encontradas ${failedTransactions.length} transacciones con estados de facturación incorrectos (excluyendo transacciones de test)`)

      let corrected = 0
      const errors = []

      for (const transaction of failedTransactions) {
        try {
          if (transaction.invoice) {
            // La transacción tiene factura generada, corregir el estado
            const oldStatus = transaction.invoiceStatus
            await transaction.update({
              invoiceStatus: 'COMPLETED',
              invoiceId: transaction.invoice.id
            })

            logger.info(`✅ Transacción ${transaction.id} corregida: ${oldStatus} → COMPLETED`)
            corrected++
          } else {
            // La transacción no tiene factura, verificar si se puede generar
            const oldStatus = transaction.invoiceStatus
            logger.info(`⚠️ Transacción ${transaction.id} no tiene factura, marcando como PENDING para reprocesamiento`)

            await transaction.update({
              invoiceStatus: 'PENDING'
            })

            logger.info(`✅ Transacción ${transaction.id} corregida: ${oldStatus} → PENDING`)
            corrected++
          }
        } catch (error) {
          logger.error(`❌ Error corrigiendo transacción ${transaction.id}:`, error.message)
          errors.push({
            transactionId: transaction.id,
            error: error.message
          })
        }
      }

      const result = {
        totalChecked: failedTransactions.length,
        corrected,
        errors,
        summary: {
          correctedToCompleted: corrected - errors.length,
          correctedToPending: errors.length > 0 ? errors.length : 0,
          totalErrors: errors.length
        }
      }

      logger.info('✅ Corrección de estados completada:', result)
      return result
    } catch (error) {
      logger.error('❌ Error en corrección de estados de facturación:', error.message)
      throw error
    }
  }
}

module.exports = InvoiceService
