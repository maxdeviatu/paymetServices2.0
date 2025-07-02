const logger = require('../config/logger')
const waitlistService = require('../services/waitlist.service')

/**
 * Job de procesamiento de lista de espera
 * Se ejecuta cada 30 segundos para procesar licencias reservadas
 */
class WaitlistProcessingJob {
  constructor() {
    this.name = 'waitlistProcessing'
    this.isRunning = false
  }

  /**
   * Ejecutar el job de procesamiento
   */
  async execute() {
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
      
      // Paso 2: Procesar entradas RESERVED (enviar emails con control de tiempo)
      const processResults = await waitlistService.processReservedLicenses()
      
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
   * Reservar automáticamente licencias disponibles para entradas PENDING
   */
  async autoReserveLicenses() {
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
        const productRef = productData.productRef
        
        try {
          const reserveResult = await waitlistService.reserveAvailableLicenses(productRef)
          
          if (reserveResult.reserved > 0) {
            logger.info(`AutoReserve: Reserved ${reserveResult.reserved} licenses for ${productRef}`)
            results.totalReserved += reserveResult.reserved
            results.details.push({
              productRef,
              reserved: reserveResult.reserved,
              waitlistCount: reserveResult.waitlistCount
            })
          }
        } catch (error) {
          logger.error(`AutoReserve: Error reserving licenses for ${productRef}:`, error.message)
          results.details.push({
            productRef,
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
  async run() {
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
  getCronConfig() {
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
  getStatus() {
    return {
      name: this.name,
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      nextRun: this.nextRun
    }
  }
}

module.exports = WaitlistProcessingJob 