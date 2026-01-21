const logger = require('../config/logger')
const OrderTimeoutJob = require('./orderTimeout')
const WaitlistProcessingJob = require('./waitlistProcessing')
const InvoiceProcessingJob = require('./invoiceProcessing')
const EmailRetryJob = require('./emailRetry')

/**
 * Simple job scheduler for background tasks
 */
class JobScheduler {
  constructor () {
    this.jobs = new Map()
    this.intervals = new Map()
    this.running = false
  }

  /**
   * Register a job (silencioso por defecto durante startup)
   * @param {Function} job - Clase del job a registrar
   * @param {Object} options - Opciones
   * @param {boolean} options.silent - Si es true, no emite logs
   */
  registerJob (job, options = {}) {
    const { silent = false } = options
    try {
      const jobInstance = new job()
      this.jobs.set(jobInstance.name, jobInstance)

      if (!silent) {
        logger.info(`Job registered: ${jobInstance.name}`)
      }
      return jobInstance
    } catch (error) {
      logger.error(`Failed to register job: ${job.name}`, error)
      throw error
    }
  }

  /**
   * Start all registered jobs
   * @param {Object} options - Opciones
   * @param {boolean} options.silent - Si es true, no emite logs (retorna resumen)
   * @returns {Object} Resumen de jobs iniciados
   */
  start (options = {}) {
    const { silent = false } = options

    if (this.running) {
      if (!silent) {
        logger.warn('Job scheduler is already running')
      }
      return { alreadyRunning: true }
    }

    if (!silent) {
      logger.info('Starting job scheduler...')
    }
    this.running = true

    // Limpiar jobs previos para evitar duplicados
    this.jobs.clear()

    // Register default jobs (silenciosamente)
    this.registerJob(OrderTimeoutJob, { silent: true })
    this.registerJob(WaitlistProcessingJob, { silent: true })
    this.registerJob(EmailRetryJob, { silent: true })

    // Determinar qué jobs están activos vs pausados
    const activeJobs = []
    const pausedJobs = []

    // Start each job based on its schedule
    for (const [name] of this.jobs) {
      // Verificar si el job debe iniciar automáticamente
      const shouldStart =
        (name === 'waitlistProcessing' && process.env.ENABLE_WAITLIST_PROCESSING === 'true') ||
        (name === 'emailRetry' && process.env.ENABLE_EMAIL_RETRY === 'true') ||
        (name !== 'waitlistProcessing' && name !== 'emailRetry')

      if (shouldStart) {
        this.startJob(name, { silent })
        activeJobs.push(name)
      } else {
        pausedJobs.push(name)
        if (!silent) {
          logger.info(`Job ${name} registrado pero no iniciado automáticamente`)
        }
      }
    }

    if (!silent) {
      logger.info(`Job scheduler started with ${this.jobs.size} jobs`)
    }

    return {
      active: activeJobs,
      paused: pausedJobs,
      total: this.jobs.size
    }
  }

  /**
   * Start a specific job
   * @param {string} jobName - Nombre del job
   * @param {Object} options - Opciones
   * @param {boolean} options.silent - Si es true, no emite logs
   */
  startJob (jobName, options = {}) {
    const { silent = false } = options
    const job = this.jobs.get(jobName)
    if (!job) {
      throw new Error(`Job ${jobName} not found`)
    }

    try {
      // For now, use simple intervals instead of cron
      // In production, you might want to use node-cron or similar
      let intervalMs

      switch (jobName) {
        case 'orderTimeout':
          intervalMs = 10 * 60 * 1000 // 10 minutes
          break
        case 'waitlistProcessing':
          intervalMs = 30 * 1000 // 30 seconds
          break
        case 'emailRetry':
          intervalMs = 15 * 60 * 1000 // 15 minutes
          break
        case 'invoiceProcessing':
          intervalMs = 60 * 60 * 1000 // 1 hour (check if should run)
          break
        default:
          intervalMs = 10 * 60 * 1000 // 10 minutes default
      }

      const interval = setInterval(async () => {
        try {
          // Para el job de facturas, verificar si debe ejecutarse
          if (jobName === 'invoiceProcessing') {
            if (job.shouldRun()) {
              await job.run()
            }
          } else {
            await job.run()
          }
        } catch (error) {
          logger.error(`Job ${jobName} execution failed:`, error)
        }
      }, intervalMs)

      this.intervals.set(jobName, interval)

      if (!silent) {
        logger.info(`Job ${jobName} started with ${intervalMs}ms interval`)
      }
    } catch (error) {
      logger.error(`Failed to start job ${jobName}:`, error)
      throw error
    }
  }

  /**
   * Stop a specific job
   */
  stopJob (jobName) {
    const interval = this.intervals.get(jobName)
    if (interval) {
      clearInterval(interval)
      this.intervals.delete(jobName)
      logger.info(`Job ${jobName} stopped`)
    }
  }

  /**
   * Stop all jobs
   */
  stop () {
    if (!this.running) {
      return
    }

    logger.info('Stopping job scheduler...')

    for (const [jobName] of this.intervals) {
      this.stopJob(jobName)
    }

    this.running = false
    logger.info('Job scheduler stopped')
  }

  /**
   * Run a job manually
   */
  async runJob (jobName) {
    const job = this.jobs.get(jobName)
    if (!job) {
      throw new Error(`Job ${jobName} not found`)
    }

    return await job.run()
  }

  /**
   * Get job status
   */
  getStatus () {
    return {
      running: this.running,
      totalJobs: this.jobs.size,
      activeJobs: this.intervals.size,
      jobs: Array.from(this.jobs.keys()),
      activeIntervals: Array.from(this.intervals.keys())
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown () {
    logger.info('Shutting down job scheduler...')
    this.stop()

    // Give running jobs time to complete
    await new Promise(resolve => setTimeout(resolve, 1000))

    logger.info('Job scheduler shutdown complete')
  }
}

// Create singleton instance
const jobScheduler = new JobScheduler()

// Handle process signals for graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down job scheduler...')
  await jobScheduler.shutdown()
})

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down job scheduler...')
  await jobScheduler.shutdown()
})

// Nota: Los jobs se registran en start() para evitar duplicados
// No registrar aquí al cargar el módulo

module.exports = jobScheduler
