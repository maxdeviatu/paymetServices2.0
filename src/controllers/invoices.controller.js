const InvoiceService = require('../services/invoices')
const logger = require('../config/logger')

/**
 * Controlador para la gestión de facturas
 */
class InvoicesController {
  constructor () {
    this.invoiceService = new InvoiceService()
  }

  /**
   * Obtiene todas las facturas con paginación y filtros
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getAllInvoices (req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        provider,
        status,
        startDate,
        endDate
      } = req.query

      // Validar parámetros
      const pageNum = parseInt(page, 10)
      const limitNum = parseInt(limit, 10)

      if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({
          success: false,
          message: 'Parámetros de paginación inválidos'
        })
      }

      logger.logBusiness('invoices.getAll', {
        page: pageNum,
        limit: limitNum,
        provider,
        status,
        startDate,
        endDate,
        adminId: req.user.id
      })

      const result = await this.invoiceService.getAllInvoices({
        page: pageNum,
        limit: limitNum,
        provider,
        status,
        startDate,
        endDate
      })

      res.status(200).json({
        success: true,
        data: result.invoices,
        pagination: result.pagination
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'invoices.getAll',
        adminId: req.user?.id,
        query: req.query
      })

      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      })
    }
  }

  /**
   * Obtiene una factura específica por ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getInvoiceById (req, res) {
    try {
      const { id } = req.params
      const invoiceId = parseInt(id, 10)

      if (!invoiceId || invoiceId < 1) {
        return res.status(400).json({
          success: false,
          message: 'ID de factura inválido'
        })
      }

      logger.logBusiness('invoices.getById', {
        invoiceId,
        adminId: req.user.id
      })

      const result = await this.invoiceService.getAllInvoices({
        page: 1,
        limit: 1
      })

      const invoice = result.invoices.find(inv => inv.id === invoiceId)

      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: 'Factura no encontrada'
        })
      }

      res.status(200).json({
        success: true,
        data: invoice
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'invoices.getById',
        invoiceId: req.params.id,
        adminId: req.user?.id
      })

      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      })
    }
  }

  /**
   * Ejecuta el proceso de facturación para todas las transacciones pendientes
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  /**
   * Ejecuta el proceso de facturación manualmente
   * @route POST /api/invoices/execute
   * @access EDITOR+
   */
  async executeInvoicing (req, res) {
    try {
      // Forzar la ejecución del job independientemente de la configuración
      const job = new InvoiceProcessingJob()
      job.isEnabled = true // Forzar habilitación para ejecución manual

      const result = await job.run()

      // Registrar evento de negocio
      logger.logBusiness('invoices.executeInvoicing', {
        result,
        manual: true,
        adminId: req.user.id
      })

      res.json({
        success: true,
        message: 'Proceso de facturación ejecutado exitosamente',
        data: {
          processed: result.processed,
          successful: result.successful,
          failed: result.failed,
          errors: result.errors
        }
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'invoices.executeInvoicing',
        adminId: req.user?.id,
        body: req.body
      })

      res.status(500).json({
        success: false,
        message: 'Error ejecutando proceso de facturación',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    }
  }

  /**
   * Actualiza el estado de una factura consultando al proveedor
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async updateInvoiceStatus (req, res) {
    try {
      const { id } = req.params
      const invoiceId = parseInt(id, 10)

      if (!invoiceId || invoiceId < 1) {
        return res.status(400).json({
          success: false,
          message: 'ID de factura inválido'
        })
      }

      logger.logBusiness('invoices.updateStatus', {
        invoiceId,
        adminId: req.user.id
      })

      // Asegurar que el servicio esté inicializado
      await this.invoiceService.initialize()

      const invoice = await this.invoiceService.updateInvoiceStatus(invoiceId)

      logger.logBusiness('invoices.updateStatus.success', {
        invoiceId,
        emailSent: invoice.emailSent,
        acceptedByDian: invoice.acceptedByDian,
        adminId: req.user.id
      })

      res.status(200).json({
        success: true,
        message: 'Estado de factura actualizado',
        data: invoice
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'invoices.updateStatus',
        invoiceId: req.params.id,
        adminId: req.user?.id
      })

      res.status(500).json({
        success: false,
        message: 'Error actualizando estado de factura',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    }
  }

  /**
   * Obtiene estadísticas de facturación
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getInvoiceStats (req, res) {
    try {
      logger.logBusiness('invoices.getStats', {
        adminId: req.user.id
      })

      // Asegurar que el servicio esté inicializado
      await this.invoiceService.initialize()

      // Obtener estadísticas básicas
      const allInvoices = await this.invoiceService.getAllInvoices({ limit: 1000 })
      const invoices = allInvoices.invoices

      const stats = {
        total: invoices.length,
        byStatus: {
          PENDING: invoices.filter(inv => inv.status === 'PENDING').length,
          GENERATED: invoices.filter(inv => inv.status === 'GENERATED').length,
          SENT: invoices.filter(inv => inv.status === 'SENT').length,
          ACCEPTED: invoices.filter(inv => inv.status === 'ACCEPTED').length,
          REJECTED: invoices.filter(inv => inv.status === 'REJECTED').length,
          FAILED: invoices.filter(inv => inv.status === 'FAILED').length
        },
        byProvider: {
          siigo: invoices.filter(inv => inv.provider === 'siigo').length,
          mock: invoices.filter(inv => inv.provider === 'mock').length
        },
        emailSent: invoices.filter(inv => inv.emailSent).length,
        acceptedByDian: invoices.filter(inv => inv.acceptedByDian).length
      }

      // Obtener transacciones pendientes
      const pendingTransactions = await this.invoiceService.findPendingTransactions()
      stats.pendingTransactions = pendingTransactions.length

      res.status(200).json({
        success: true,
        data: stats
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'invoices.getStats',
        adminId: req.user?.id
      })

      res.status(500).json({
        success: false,
        message: 'Error obteniendo estadísticas de facturación'
      })
    }
  }
}

module.exports = new InvoicesController()
