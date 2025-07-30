const transactionStatusVerifier = require('../services/payment/transactionStatusVerifier')
const { Transaction, CobreCheckout } = require('../models')
const { Op } = require('sequelize')
const logger = require('../config/logger')

/**
 * Verificar estado de una transacción específica
 */
exports.verifyTransactionStatus = async (req, res) => {
  try {
    const { transactionId } = req.params
    const { moneyMovementId } = req.body

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'transactionId es requerido'
      })
    }

    logger.logBusiness('api:verifyTransactionStatus', {
      transactionId: parseInt(transactionId),
      moneyMovementId,
      adminId: req.user?.id
    })

    const result = await transactionStatusVerifier.verifyTransactionStatus(
      parseInt(transactionId),
      moneyMovementId
    )

    res.status(200).json({
      success: true,
      data: result,
      message: result.message
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'verifyTransactionStatus',
      transactionId: req.params.transactionId,
      moneyMovementId: req.body?.moneyMovementId,
      adminId: req.user?.id
    })

    let statusCode = 500

    if (error.message.includes('no encontrada')) {
      statusCode = 404
    } else if (error.code === 'ALREADY_PROCESSING') {
      statusCode = 409 // Conflict
    } else if (error.code === 'RATE_LIMIT_EXCEEDED') {
      statusCode = 429 // Too Many Requests
    }

    res.status(statusCode).json({
      success: false,
      message: error.message,
      code: error.code
    })
  }
}

/**
 * Verificar múltiples transacciones pendientes
 */
exports.verifyMultipleTransactions = async (req, res) => {
  try {
    const { transactionIds, status = 'PENDING', limit = 10 } = req.body

    logger.logBusiness('api:verifyMultipleTransactions', {
      transactionIds: transactionIds?.length || 0,
      status,
      limit,
      adminId: req.user?.id
    })

    let transactionIdsToVerify = transactionIds

    // Si no se proporcionan IDs específicos, buscar transacciones pendientes
    if (!transactionIds || transactionIds.length === 0) {
      const pendingTransactions = await Transaction.findAll({
        where: {
          gateway: 'cobre',
          status,
          '$cobreCheckout.id$': {
            [Op.ne]: null
          }
        },
        include: [
          {
            association: 'cobreCheckout',
            required: true
          }
        ],
        limit: parseInt(limit),
        order: [['createdAt', 'ASC']]
      })

      transactionIdsToVerify = pendingTransactions.map(t => t.id)

      logger.logBusiness('api:verifyMultipleTransactions.found', {
        found: pendingTransactions.length,
        status
      })
    }

    if (transactionIdsToVerify.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          total: 0,
          processed: 0,
          errors: [],
          details: []
        },
        message: 'No hay transacciones para verificar'
      })
    }

    const result = await transactionStatusVerifier.verifyMultipleTransactions(transactionIdsToVerify)

    res.status(200).json({
      success: true,
      data: result,
      message: `Verificación completada: ${result.processed} procesadas, ${result.errors.length} errores`
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'verifyMultipleTransactions',
      body: req.body,
      adminId: req.user?.id
    })

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Obtener estadísticas de transacciones pendientes
 */
exports.getPendingTransactionsStats = async (req, res) => {
  try {
    const { status = 'PENDING' } = req.query

    logger.logBusiness('api:getPendingTransactionsStats', {
      status,
      adminId: req.user?.id
    })

    // Contar transacciones por estado
    const stats = await Transaction.findAll({
      where: {
        gateway: 'cobre',
        '$cobreCheckout.id$': {
          [Op.ne]: null
        }
      },
      include: [
        {
          association: 'cobreCheckout',
          required: true
        }
      ],
      attributes: [
        'status',
        [Transaction.sequelize.fn('COUNT', Transaction.sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    })

    // Contar total de transacciones con checkout
    const totalWithCheckout = await Transaction.count({
      where: {
        gateway: 'cobre',
        '$cobreCheckout.id$': {
          [Op.ne]: null
        }
      },
      include: [
        {
          association: 'cobreCheckout',
          required: true
        }
      ]
    })

    // Contar transacciones sin checkout
    const totalWithoutCheckout = await Transaction.count({
      where: {
        gateway: 'cobre',
        '$cobreCheckout.id$': null
      },
      include: [
        {
          association: 'cobreCheckout',
          required: false
        }
      ]
    })

    const result = {
      byStatus: stats,
      total: {
        withCheckout: totalWithCheckout,
        withoutCheckout: totalWithoutCheckout,
        total: totalWithCheckout + totalWithoutCheckout
      },
      pendingCount: stats.find(s => s.status === 'PENDING')?.count || 0,
      paidCount: stats.find(s => s.status === 'PAID')?.count || 0,
      failedCount: stats.find(s => s.status === 'FAILED')?.count || 0
    }

    res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'getPendingTransactionsStats',
      adminId: req.user?.id
    })

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Verificar y reenviar email de licencia
 */
exports.verifyAndResendLicenseEmail = async (req, res) => {
  try {
    const { orderId } = req.params

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'orderId es requerido'
      })
    }

    logger.logBusiness('api:verifyAndResendLicenseEmail', {
      orderId: parseInt(orderId),
      adminId: req.user?.id
    })

    const result = await transactionStatusVerifier.verifyAndResendLicenseEmail(parseInt(orderId))

    res.status(200).json({
      success: true,
      data: result,
      message: result.message
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'verifyAndResendLicenseEmail',
      orderId: req.params.orderId,
      adminId: req.user?.id
    })

    let statusCode = 500

    if (error.message.includes('no encontrada')) {
      statusCode = 404
    } else if (error.message.includes('no está en estado válido') || 
               error.message.includes('no tiene transacciones pagadas')) {
      statusCode = 400
    } else if (error.message.includes('no tiene licencia')) {
      statusCode = 404
    }

    res.status(statusCode).json({
      success: false,
      message: error.message
    })
  }
}
