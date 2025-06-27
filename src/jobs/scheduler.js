const logger = require('../config/logger')
const OrderTimeoutJob = require('./orderTimeout')
const WaitlistProcessingJob = require('./waitlistProcessing')

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
   * Register a job
   */
  registerJob (job) {
    try {
      const jobInstance = new job()
      this.jobs.set(jobInstance.name, jobInstance)

      logger.info(`Job registered: ${jobInstance.name}`)
      return jobInstance
    } catch (error) {
      logger.error(`Failed to register job: ${job.name}`, error)
      throw error
    }
  }

  /**
   * Start all registered jobs
   */
  start () {
    if (this.running) {
      logger.warn('Job scheduler is already running')
      return
    }

    logger.info('Starting job scheduler...')
    this.running = true

    // Register default jobs
    this.registerJob(OrderTimeoutJob)
    
    // Solo registrar waitlist job si está habilitado
    if (process.env.ENABLE_WAITLIST_PROCESSING === 'true') {
      this.registerJob(WaitlistProcessingJob)
      logger.info('✅ Waitlist processing job habilitado')
    } else {
      logger.info('⏸️  Waitlist processing job pausado (ENABLE_WAITLIST_PROCESSING=false)')
    }

    // Start each job based on its schedule
    for (const [name, job] of this.jobs) {
      this.startJob(name)
    }

    logger.info(`Job scheduler started with ${this.jobs.size} jobs`)
  }

  /**
   * Start a specific job
   */
  startJob (jobName) {
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
        default:
          intervalMs = 10 * 60 * 1000 // 10 minutes default
      }

      const interval = setInterval(async () => {
        try {
          await job.run()
        } catch (error) {
          logger.error(`Job ${jobName} execution failed:`, error)
        }
      }, intervalMs)

      this.intervals.set(jobName, interval)

      logger.info(`Job ${jobName} started with ${intervalMs}ms interval`)
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

module.exports = jobScheduler
