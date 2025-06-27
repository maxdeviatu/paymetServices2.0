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

      const results = await waitlistService.processReservedLicenses()
      const duration = Date.now() - startTime

      logger.logBusiness('job:waitlistProcessing.completed', {
        duration: `${duration}ms`,
        ...results
      })

      return {
        success: true,
        duration,
        ...results
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