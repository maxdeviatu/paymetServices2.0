const express = require('express')
const router = express.Router()
const { authenticate } = require('../../middlewares/auth')
const { requireRole } = require('../../middlewares/role')
const jobScheduler = require('../../jobs/scheduler')
const InvoiceProcessingJob = require('../../jobs/invoiceProcessing')
const logger = require('../../config/logger')

/**
 * @route GET /api/admin/jobs/status
 * @desc Obtener estado de todos los jobs
 * @access SUPER_ADMIN
 */
router.get('/status', authenticate, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const schedulerStatus = jobScheduler.getStatus()

    // Obtener estado específico del job de facturas
    const invoiceJob = jobScheduler.jobs.get('invoiceProcessing')
    const invoiceJobStatus = invoiceJob ? invoiceJob.getStatus() : null

    logger.logBusiness('admin.jobs.getStatus', {
      adminId: req.user.id,
      schedulerStatus
    })

    res.status(200).json({
      success: true,
      data: {
        scheduler: schedulerStatus,
        invoiceJob: invoiceJobStatus
      }
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'admin.jobs.getStatus',
      adminId: req.user?.id
    })

    res.status(500).json({
      success: false,
      message: 'Error obteniendo estado de jobs'
    })
  }
})

/**
 * @route POST /api/admin/jobs/invoice/run
 * @desc Ejecutar manualmente el job de facturación
 * @access SUPER_ADMIN
 */
router.post('/invoice/run', authenticate, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const {
      provider = 'siigo',
      includeAll = false,
      delayBetweenInvoices = 60000
    } = req.body

    // Validar proveedor
    const validProviders = ['siigo', 'mock']
    if (!validProviders.includes(provider)) {
      return res.status(400).json({
        success: false,
        message: `Proveedor inválido. Debe ser uno de: ${validProviders.join(', ')}`
      })
    }

    logger.logBusiness('admin.jobs.invoice.runManual', {
      adminId: req.user.id,
      provider,
      includeAll,
      delayBetweenInvoices
    })

    // Crear instancia temporal del job para ejecución manual
    const invoiceJob = new InvoiceProcessingJob()

    // Ejecutar job manual
    const result = await invoiceJob.runManual({
      provider,
      includeAll: Boolean(includeAll),
      delayBetweenInvoices: parseInt(delayBetweenInvoices, 10)
    })

    logger.logBusiness('admin.jobs.invoice.runManual.completed', {
      adminId: req.user.id,
      result
    })

    res.status(200).json({
      success: true,
      message: 'Job de facturación ejecutado exitosamente',
      data: result
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'admin.jobs.invoice.runManual',
      adminId: req.user?.id,
      body: req.body
    })

    res.status(500).json({
      success: false,
      message: 'Error ejecutando job de facturación',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

/**
 * @route POST /api/admin/jobs/:jobName/start
 * @desc Iniciar un job específico
 * @access SUPER_ADMIN
 */
router.post('/:jobName/start', authenticate, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { jobName } = req.params

    const validJobs = ['orderTimeout', 'waitlistProcessing', 'invoiceProcessing']
    if (!validJobs.includes(jobName)) {
      return res.status(400).json({
        success: false,
        message: `Job inválido. Debe ser uno de: ${validJobs.join(', ')}`
      })
    }

    logger.logBusiness('admin.jobs.start', {
      adminId: req.user.id,
      jobName
    })

    jobScheduler.startJob(jobName)

    res.status(200).json({
      success: true,
      message: `Job ${jobName} iniciado exitosamente`
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'admin.jobs.start',
      adminId: req.user?.id,
      jobName: req.params.jobName
    })

    res.status(500).json({
      success: false,
      message: 'Error iniciando job',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

/**
 * @route POST /api/admin/jobs/:jobName/stop
 * @desc Detener un job específico
 * @access SUPER_ADMIN
 */
router.post('/:jobName/stop', authenticate, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { jobName } = req.params

    const validJobs = ['orderTimeout', 'waitlistProcessing', 'invoiceProcessing']
    if (!validJobs.includes(jobName)) {
      return res.status(400).json({
        success: false,
        message: `Job inválido. Debe ser uno de: ${validJobs.join(', ')}`
      })
    }

    logger.logBusiness('admin.jobs.stop', {
      adminId: req.user.id,
      jobName
    })

    jobScheduler.stopJob(jobName)

    res.status(200).json({
      success: true,
      message: `Job ${jobName} detenido exitosamente`
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'admin.jobs.stop',
      adminId: req.user?.id,
      jobName: req.params.jobName
    })

    res.status(500).json({
      success: false,
      message: 'Error deteniendo job',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

module.exports = router
