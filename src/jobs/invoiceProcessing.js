const InvoiceService = require('../services/invoices')
const logger = require('../config/logger')
const { Transaction, Invoice, Order, User, Product } = require('../models')

/**
 * Job para el procesamiento automático de facturas
 * Se ejecuta diariamente para procesar transacciones pendientes
 */
class InvoiceProcessingJob {
  constructor () {
    this.name = 'invoiceProcessing'
    this.invoiceService = new InvoiceService()
    this.isRunning = false
    this.lastRun = null
    this.isEnabled = process.env.ENABLE_INVOICE_PROCESSING === 'true'
    this.schedule = process.env.INVOICE_JOB_SCHEDULE || '0 2 * * *' // 2 AM todos los días por defecto
  }

  /**
   * Verifica si el job debe ejecutarse
   */
  shouldRun() {
    if (!this.isEnabled) {
      logger.info('Job de facturación deshabilitado por configuración')
      return false
    }
    return true
  }

  /**
   * Ejecuta el job de procesamiento de facturas
   */
  async run () {
    if (this.isRunning) {
      logger.warn('⚠️ Job de facturación ya está en ejecución, omitiendo...')
      return
    }

    this.isRunning = true
    const startTime = Date.now()

    try {
      logger.info('🚀 Iniciando job de procesamiento de facturas...')

      // Asegurar que el servicio esté inicializado
      await this.invoiceService.initialize()

      // Obtener configuración del job
      const config = {
        providerName: process.env.INVOICE_DEFAULT_PROVIDER || 'siigo',
        delayBetweenInvoices: parseInt(process.env.INVOICE_DELAY_BETWEEN_MS, 10) || 60000 // 1 minuto
      }

      logger.info('📋 Configuración del job:', config)

      // Buscar transacciones en estado PENDING para facturación
      const pendingTransactions = await Transaction.findAll({
        where: {
          status: 'PAID',
          invoiceStatus: 'PENDING'
        },
        include: [{
          model: Order,
          as: 'order',
          include: [
            { model: User, as: 'customer' },
            { model: Product, as: 'product' }
          ]
        }],
        order: [['id', 'ASC']]
      })

      if (pendingTransactions.length === 0) {
        logger.info('✅ No hay transacciones pendientes de facturar')
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

      // Procesar cada transacción
      for (const transaction of pendingTransactions) {
        try {
          // Marcar como en proceso
          await transaction.update({ invoiceStatus: 'PROCESSING' })

          // Generar factura
          const invoice = await this.invoiceService.processTransaction(transaction, config.providerName)

          if (invoice) {
            // La factura ya fue creada por el servicio, solo actualizar el estado
            await transaction.update({
              invoiceStatus: 'COMPLETED'
            })

            results.successful++
            logger.info(`✅ Factura procesada exitosamente para transacción ${transaction.id}`)
          } else {
            // Marcar como fallida
            await transaction.update({ invoiceStatus: 'FAILED' })
            results.failed++
            results.errors.push({
              transactionId: transaction.id,
              error: 'No se pudo generar la factura'
            })
            logger.error(`❌ Falló la generación de factura para transacción ${transaction.id}`)
          }

          results.processed++

          // Esperar antes de la siguiente factura
          if (config.delayBetweenInvoices > 0) {
            await new Promise(resolve => setTimeout(resolve, config.delayBetweenInvoices))
          }
        } catch (error) {
          // En caso de error, marcar como fallida
          await transaction.update({ invoiceStatus: 'FAILED' })
          results.failed++
          results.errors.push({
            transactionId: transaction.id,
            error: error.message
          })
          results.processed++
        }
      }

      const duration = Date.now() - startTime

      logger.info('✅ Job de facturación completado:', {
        ...results,
        duration: `${duration}ms`,
        durationMinutes: Math.round(duration / 60000 * 100) / 100
      })

      // Registrar evento de negocio
      logger.logBusiness('invoiceJob.completed', {
        ...results,
        duration,
        config
      })

      this.lastRun = new Date()
      return results
    } catch (error) {
      const duration = Date.now() - startTime

      logger.error('❌ Error en job de facturación:', {
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`
      })

      logger.logError(error, {
        operation: 'invoiceJob.run',
        duration
      })

      throw error
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Ejecuta el job de forma manual (forzada)
   * @param {Object} options - Opciones de ejecución
   */
  async runManual (options = {}) {
    if (this.isRunning) {
      throw new Error('Job de facturación ya está en ejecución')
    }

    this.isRunning = true
    const startTime = Date.now()

    try {
      logger.info('🔧 Ejecutando job de facturación manual...')

      // Asegurar que el servicio esté inicializado
      await this.invoiceService.initialize()

      // Configuración manual con opciones personalizadas
      const config = {
        providerName: options.provider || process.env.INVOICE_DEFAULT_PROVIDER || 'siigo',
        delayBetweenInvoices: options.delayBetweenInvoices || 60000,
        includeAll: Boolean(options.includeAll) // Permitir procesar todas las transacciones
      }

      logger.info('📋 Configuración manual del job:', config)

      // Ejecutar procesamiento
      const result = await this.invoiceService.processAllPendingTransactions(config)

      const duration = Date.now() - startTime

      logger.info('✅ Job manual de facturación completado:', {
        ...result,
        duration: `${duration}ms`
      })

      logger.logBusiness('invoiceJob.manual.completed', {
        ...result,
        duration,
        config,
        manual: true
      })

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      logger.error('❌ Error en job manual de facturación:', {
        error: error.message,
        duration: `${duration}ms`
      })

      logger.logError(error, {
        operation: 'invoiceJob.runManual',
        duration,
        options
      })

      throw error
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Obtiene el estado del job
   */
  getStatus () {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      schedule: this.schedule,
      nextScheduledRun: this.getNextScheduledRun()
    }
  }

  /**
   * Calcula la próxima ejecución programada (simplificado)
   */
  getNextScheduledRun () {
    // Para simplificar, calculamos la próxima ejecución a las 2 AM
    const now = new Date()
    const next = new Date(now)
    next.setHours(2, 0, 0, 0)

    // Si ya pasaron las 2 AM de hoy, programar para mañana
    if (next <= now) {
      next.setDate(next.getDate() + 1)
    }

    return next
  }

  /**
   * Verifica si es tiempo de ejecutar el job
   */
  shouldRun () {
    if (this.isRunning) return false

    const now = new Date()
    const nextRun = this.getNextScheduledRun()

    // Si no hay última ejecución, verificar si es tiempo
    if (!this.lastRun) {
      return now.getHours() === 2 && now.getMinutes() < 5 // Ventana de 5 minutos
    }

    // Verificar si han pasado más de 23 horas desde la última ejecución
    const timeSinceLastRun = now.getTime() - this.lastRun.getTime()
    const hoursThreshold = 23 * 60 * 60 * 1000 // 23 horas en milisegundos

    return timeSinceLastRun > hoursThreshold && now.getHours() === 2
  }
}

module.exports = InvoiceProcessingJob
