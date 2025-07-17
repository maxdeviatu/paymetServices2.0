const waitlistService = require('../services/waitlist.service')
const logger = require('../config/logger')

/**
 * Obtener métricas de la lista de espera
 */
exports.getMetrics = async (req, res) => {
  try {
    const { productRef } = req.query
    const metrics = await waitlistService.getWaitlistMetrics(productRef)

    res.json({
      success: true,
      data: metrics
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'getWaitlistMetrics',
      query: req.query
    })
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Obtener lista de espera con filtros
 */
exports.getWaitlist = async (req, res) => {
  try {
    const filters = {}

    if (req.query.status) {
      filters.status = req.query.status
    }
    if (req.query.productRef) {
      filters.productRef = req.query.productRef
    }
    if (req.query.customerId) {
      filters.customerId = req.query.customerId
    }

    const entries = await waitlistService.getWaitlist(filters)

    res.json({
      success: true,
      data: entries,
      count: entries.length
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'getWaitlist',
      query: req.query
    })
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Reservar licencias disponibles para lista de espera
 */
exports.reserveLicenses = async (req, res) => {
  try {
    const { productRef } = req.body

    if (!productRef) {
      return res.status(400).json({
        success: false,
        message: 'productRef is required'
      })
    }

    const result = await waitlistService.reserveAvailableLicenses(productRef)

    res.json({
      success: true,
      data: result,
      message: result.message
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'reserveLicenses',
      body: req.body
    })
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Procesar licencias reservadas manualmente
 */
exports.processReservedLicenses = async (req, res) => {
  try {
    const result = await waitlistService.processNextReservedEntry()

    res.json({
      success: true,
      data: result,
      message: `Processed ${result.processed} entries, ${result.failed} failed`
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'processReservedLicenses'
    })
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Remover entrada de la lista de espera
 */
exports.removeFromWaitlist = async (req, res) => {
  try {
    const { waitlistEntryId } = req.params
    const { reason = 'MANUAL' } = req.body

    const result = await waitlistService.removeFromWaitlist(waitlistEntryId, reason)

    res.json({
      success: true,
      data: result,
      message: 'Entry removed from waitlist successfully'
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'removeFromWaitlist',
      waitlistEntryId: req.params.waitlistEntryId,
      body: req.body
    })

    const statusCode = error.message === 'Waitlist entry not found' ? 404 : 500
    res.status(statusCode).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Obtener entrada específica de la lista de espera
 */
exports.getWaitlistEntry = async (req, res) => {
  try {
    const { waitlistEntryId } = req.params

    const entries = await waitlistService.getWaitlist({ id: waitlistEntryId })

    if (entries.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Waitlist entry not found'
      })
    }

    res.json({
      success: true,
      data: entries[0]
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'getWaitlistEntry',
      waitlistEntryId: req.params.waitlistEntryId
    })
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Obtener estado del job de procesamiento
 */
exports.getJobStatus = async (req, res) => {
  try {
    const WaitlistProcessingJob = require('../jobs/waitlistProcessing')
    const job = new WaitlistProcessingJob()
    const status = job.getStatus()

    res.json({
      success: true,
      data: status
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'getJobStatus'
    })
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Ejecutar job de procesamiento manualmente
 */
exports.runJob = async (req, res) => {
  try {
    const jobScheduler = require('../jobs/scheduler')
    const result = await jobScheduler.runJob('waitlistProcessing')

    res.json({
      success: true,
      data: result,
      message: 'Job executed successfully'
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'runWaitlistJob'
    })
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
