const logger = require('../config/logger')
const waitlistService = require('../services/waitlist.service')

/**
 * Job de procesamiento de lista de espera
 * Se ejecuta cada 30 segundos para procesar licencias reservadas
 */
class WaitlistProcessingJob {
  constructor () {
    this.name = 'waitlistProcessing'
    this.isRunning = false
  }

  /**
   * Ejecutar el job de procesamiento
   */
  async execute () {
    if (this.isRunning) {
      logger.info('WaitlistProcessingJob: Already running, skipping execution')
      return { skipped: true, reason: 'Already running' }
    }

    this.isRunning = true
    const startTime = Date.now()

    try {
      logger.logBusiness('job:waitlistProcessing.start', {
        timestamp: new Date().toISOString()
      })

      // Paso 1: Reservar automáticamente licencias disponibles para entradas PENDING
      const reserveResults = await this.autoReserveLicenses()

      // Paso 2: Procesar una entrada READY_FOR_EMAIL (enviar email con control de tiempo)
      const processResults = await waitlistService.processNextReservedEntry()

      const duration = Date.now() - startTime
      const combinedResults = {
        ...processResults,
        autoReserved: reserveResults.totalReserved,
        autoReserveDetails: reserveResults.details
      }

      logger.logBusiness('job:waitlistProcessing.completed', {
        duration: `${duration}ms`,
        ...combinedResults
      })

      return {
        success: true,
        duration,
        ...combinedResults
      }
    } catch (error) {
      const duration = Date.now() - startTime

      logger.logError(error, {
        operation: 'waitlistProcessing.execute',
        duration: `${duration}ms`
      })

      return {
        success: false,
        duration,
        error: error.message
      }
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Ejecutar procesamiento completo manual - procesa TODAS las entradas READY_FOR_EMAIL
   */
  async executeManual () {
    if (this.isRunning) {
      logger.info('WaitlistProcessingJob: Already running, skipping manual execution')
      return { skipped: true, reason: 'Already running' }
    }

    this.isRunning = true
    const startTime = Date.now()

    try {
      logger.logBusiness('job:waitlistProcessing.manualStart', {
        timestamp: new Date().toISOString()
      })

      // Paso 1: Reservar automáticamente licencias disponibles para entradas PENDING
      const reserveResults = await this.autoReserveLicenses()

      // Paso 2: Procesar TODAS las entradas READY_FOR_EMAIL existentes
      const processResults = await this.processAllReadyForEmail()

      const duration = Date.now() - startTime
      const combinedResults = {
        ...processResults,
        autoReserved: reserveResults.totalReserved,
        autoReserveDetails: reserveResults.details
      }

      logger.logBusiness('job:waitlistProcessing.manualCompleted', {
        duration: `${duration}ms`,
        ...combinedResults
      })

      return {
        success: true,
        duration,
        ...combinedResults
      }
    } catch (error) {
      const duration = Date.now() - startTime

      logger.logError(error, {
        operation: 'waitlistProcessing.executeManual',
        duration: `${duration}ms`
      })

      return {
        success: false,
        duration,
        error: error.message
      }
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Procesar todas las entradas READY_FOR_EMAIL (para ejecución manual)
   */
  async processAllReadyForEmail () {
    try {
      const { WaitlistEntry } = require('../models')
      
      // Obtener TODAS las entradas READY_FOR_EMAIL
      const readyEntries = await WaitlistEntry.findAll({
        where: {
          status: 'READY_FOR_EMAIL'
        },
        include: [
          {
            association: 'order',
            include: ['customer', 'product'],
            required: true
          },
          {
            association: 'license',
            required: true
          }
        ],
        order: [['priority', 'ASC']] // FIFO - más antiguos primero
      })

      const results = {
        processed: 0,
        failed: 0,
        queued: 0,
        errors: [],
        total: readyEntries.length
      }

      logger.logBusiness('job:waitlistProcessing.processAllReadyForEmail', {
        totalEntries: readyEntries.length
      })

      // Procesar cada entrada
      for (const entry of readyEntries) {
        try {
          await waitlistService.processWaitlistEntryWithEmail(entry)
          results.processed++
          results.queued++

          logger.logBusiness('job:waitlistProcessing.entryProcessed', {
            waitlistEntryId: entry.id,
            orderId: entry.orderId,
            customerEmail: entry.order?.customer?.email
          })
        } catch (error) {
          logger.logError(error, {
            operation: 'processWaitlistEntryWithEmail',
            waitlistEntryId: entry.id,
            orderId: entry.orderId
          })

          // Incrementar contador de fallos en la entrada si excede reintentos
          if (entry.retryCount >= 3) {
            await entry.update({
              status: 'FAILED',
              errorMessage: error.message
            })
            results.failed++
          } else {
            await entry.update({
              retryCount: entry.retryCount + 1,
              errorMessage: error.message
            })
          }

          results.errors.push({
            waitlistEntryId: entry.id,
            orderId: entry.orderId,
            error: error.message
          })
        }
      }

      logger.logBusiness('job:waitlistProcessing.processAllReadyForEmailCompleted', results)
      return results
    } catch (error) {
      logger.logError(error, {
        operation: 'processAllReadyForEmail'
      })
      throw error
    }
  }

  /**
   * Reservar automáticamente licencias disponibles para entradas PENDING
   */
  async autoReserveLicenses () {
    try {
      // Obtener todos los productos que tienen entradas PENDING en la lista de espera
      const { WaitlistEntry } = require('../models')

      const pendingProducts = await WaitlistEntry.findAll({
        where: {
          status: 'PENDING'
        },
        attributes: ['productRef'],
        group: ['productRef'],
        raw: true
      })

      const results = {
        totalReserved: 0,
        details: []
      }

      // Para cada producto, intentar reservar licencias
      for (const productData of pendingProducts) {
        try {
          const reserveResult = await waitlistService.reserveAvailableLicenses(productData.productRef)

          if (reserveResult.reserved > 0) {
            logger.info(`AutoReserve: Reserved ${reserveResult.reserved} licenses for ${productData.productRef}`)
            results.totalReserved += reserveResult.reserved
            results.details.push({
              productRef: productData.productRef,
              reserved: reserveResult.reserved,
              waitlistCount: reserveResult.waitlistCount
            })
          }
        } catch (error) {
          logger.error(`AutoReserve: Error reserving licenses for ${productData.productRef}:`, error.message)
          results.details.push({
            productRef: productData.productRef,
            reserved: 0,
            error: error.message
          })
        }
      }

      return results
    } catch (error) {
      logger.error('AutoReserve: Failed to auto-reserve licenses:', error.message)
      return {
        totalReserved: 0,
        details: [],
        error: error.message
      }
    }
  }

  /**
   * Ejecutar el job manualmente (para testing)
   */
  async run () {
    logger.info(`Starting ${this.name} job...`)
    const startTime = Date.now()

    try {
      const result = await this.execute()
      const duration = Date.now() - startTime

      logger.info(`${this.name} job completed in ${duration}ms`, result)
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error(`${this.name} job failed after ${duration}ms:`, error)
      throw error
    }
  }

  /**
   * Obtener configuración del job para el scheduler
   */
  getCronConfig () {
    return {
      name: this.name,
      cronTime: '*/30 * * * * *', // Cada 30 segundos
      onTick: () => this.run(),
      start: false,
      timeZone: 'America/Bogota'
    }
  }

  /**
   * Verificar estado del job
   */
  getStatus () {
    return {
      name: this.name,
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      nextRun: this.nextRun
    }
  }
}

module.exports = WaitlistProcessingJob
