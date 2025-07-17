const { Transaction, Order, Product, User, License, CobreCheckout } = require('../../models')
const { Op } = require('sequelize')
const logger = require('../../config/logger')
const TransactionManager = require('../../utils/transactionManager')
const emailService = require('../email')
const CobreProvider = require('./providers/cobre')

/**
 * Servicio para verificar el estado de transacciones en Cobre cuando los webhooks fallan
 * Este servicio consulta directamente la API de Cobre para obtener el estado actual
 * y procesa las órdenes si están pagadas
 */
class TransactionStatusVerifier {
  constructor () {
    this.cobreProvider = CobreProvider
    // Cache global para prevenir procesamiento duplicado
    this.processingCache = new Set()
  }

  /**
   * Verifica el estado de una transacción específica por ID con prevención de duplicados
   * @param {number} transactionId - ID de la transacción interna
   * @param {string} moneyMovementId - ID del money movement de Cobre (opcional)
   * @returns {Promise<Object>} - Resultado de la verificación
   */
  async verifyTransactionStatus (transactionId, moneyMovementId = null) {
    // Verificar si ya está siendo procesado
    if (this.processingCache.has(transactionId)) {
      const error = new Error(`La transacción ${transactionId} ya está siendo procesada`)
      error.code = 'ALREADY_PROCESSING'
      throw error
    }

    this.processingCache.add(transactionId)

    try {
      logger.logBusiness('transaction:statusVerification.start', { transactionId, moneyMovementId })

      // Buscar la transacción con todas sus relaciones
      const transaction = await Transaction.findByPk(transactionId, {
        include: [
          {
            association: 'order',
            include: [
              { association: 'product' },
              { association: 'customer' }
            ]
          },
          {
            association: 'cobreCheckout'
          }
        ]
      })

      if (!transaction) {
        throw new Error(`Transacción ${transactionId} no encontrada`)
      }

      // Verificar que sea una transacción de Cobre
      if (transaction.gateway !== 'cobre') {
        throw new Error(`La transacción ${transactionId} no es de Cobre (gateway: ${transaction.gateway})`)
      }

      // Si no se proporciona moneyMovementId, intentar obtenerlo del checkout
      let mmId = moneyMovementId
      if (!mmId && transaction.cobreCheckout) {
        // Intentar obtener el money movement ID del checkout
        try {
          const checkoutStatus = await this.cobreProvider.getCheckoutStatus(transaction.cobreCheckout.checkoutId)
          // El checkout podría tener información del money movement
          mmId = checkoutStatus.rawData?.money_movement_id || null
        } catch (checkoutError) {
          logger.warn('No se pudo obtener money movement ID del checkout:', checkoutError.message)
        }
      }

      if (!mmId) {
        throw new Error(`No se pudo obtener el Money Movement ID para la transacción ${transactionId}`)
      }

      // Consultar estado del money movement en Cobre
      const movementStatus = await this.cobreProvider.getMoneyMovementStatus(mmId, {
        nested: true,
        sensitiveData: false
      })

      logger.logBusiness('transaction:statusVerification.moneyMovementResponse', {
        transactionId,
        moneyMovementId: mmId,
        cobreStatus: movementStatus.status,
        internalStatus: transaction.status,
        externalId: movementStatus.externalId
      })

      // Validar que el external ID coincida con el gatewayRef de la transacción
      if (movementStatus.externalId !== transaction.gatewayRef) {
        throw new Error(`External ID no coincide: esperado ${transaction.gatewayRef}, recibido ${movementStatus.externalId}`)
      }

      // Validar que el monto coincida
      if (movementStatus.amount !== transaction.amount) {
        throw new Error(`Monto no coincide: esperado ${transaction.amount}, recibido ${movementStatus.amount}`)
      }

      // Validar que la moneda coincida
      if (movementStatus.currency.toLowerCase() !== transaction.currency.toLowerCase()) {
        throw new Error(`Moneda no coincide: esperado ${transaction.currency}, recibido ${movementStatus.currency}`)
      }

      // Mapear estado de Cobre a estado interno
      const newStatus = this.cobreProvider.mapMoneyMovementStatus(movementStatus.status)

      logger.logBusiness('transaction:statusVerification.statusMapping', {
        transactionId,
        cobreStatus: movementStatus.status,
        mappedStatus: newStatus,
        currentStatus: transaction.status
      })

      // Si el estado no cambió, no procesar
      if (newStatus === transaction.status) {
        return {
          success: true,
          message: 'Estado sin cambios',
          transactionId: transaction.id,
          status: transaction.status,
          processed: false
        }
      }

      // Procesar el cambio de estado
      const result = await this.processStatusChange(transaction, newStatus, movementStatus)

      return {
        success: true,
        message: 'Estado actualizado y procesado',
        transactionId: transaction.id,
        orderId: transaction.order.id,
        oldStatus: transaction.status,
        newStatus,
        processed: true,
        moneyMovementId: mmId,
        cobreStatus: movementStatus.status,
        ...result
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'verifyTransactionStatus',
        transactionId
      })
      throw error
    } finally {
      // Siempre remover del cache al finalizar
      this.processingCache.delete(transactionId)
    }
  }

  /**
   * Procesa el cambio de estado de una transacción
   * @param {Transaction} transaction - Transacción a procesar
   * @param {string} newStatus - Nuevo estado
   * @param {Object} movementStatus - Estado del money movement de Cobre
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processStatusChange (transaction, newStatus, movementStatus) {
    return await TransactionManager.executeWebhookTransaction(async (t) => {
      const order = transaction.order
      const oldStatus = transaction.status

      logger.logBusiness('transaction:statusVerification.processing', {
        transactionId: transaction.id,
        orderId: order.id,
        oldStatus,
        newStatus,
        moneyMovementId: movementStatus.moneyMovementId
      })

      // Actualizar estado de la transacción
      await transaction.update({
        status: newStatus,
        paymentMethod: movementStatus.type,
        meta: {
          ...transaction.meta,
          statusVerification: {
            verifiedAt: new Date().toISOString(),
            cobreStatus: movementStatus.status,
            moneyMovementData: {
              id: movementStatus.moneyMovementId,
              externalId: movementStatus.externalId,
              trackingKey: movementStatus.trackingKey,
              reference: movementStatus.reference,
              cepUrl: movementStatus.cepUrl
            }
          }
        }
      }, { transaction: t })

      // Si el pago fue exitoso, procesar la orden
      if (newStatus === 'PAID' && oldStatus !== 'PAID') {
        await this.handlePaymentSuccess(transaction, t)
      } else if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(newStatus)) {
        await this.handlePaymentFailure(transaction, t)
      }

      logger.logBusiness('transaction:statusVerification.completed', {
        transactionId: transaction.id,
        orderId: order.id,
        oldStatus,
        newStatus,
        processed: true
      })

      return {
        success: true,
        message: 'Estado actualizado y procesado',
        transactionId: transaction.id,
        orderId: order.id,
        oldStatus,
        newStatus,
        processed: true
      }
    })
  }

  /**
   * Maneja el pago exitoso reutilizando el servicio existente
   * @param {Transaction} transaction - Transacción pagada
   * @param {Object} dbTransaction - Transacción de base de datos
   */
  async handlePaymentSuccess (transaction, dbTransaction) {
    try {
      const transactionHandler = require('../webhook/handlers/transactionHandler')

      logger.logBusiness('transaction:statusVerification.paymentSuccess.start', {
        transactionId: transaction.id,
        orderId: transaction.order.id
      })

      // Reutilizar la lógica optimizada existente del webhook handler
      await transactionHandler.handlePaymentSuccessOptimized(transaction, dbTransaction)

      logger.logBusiness('transaction:statusVerification.paymentSuccess.completed', {
        transactionId: transaction.id,
        orderId: transaction.order.id
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'handlePaymentSuccess',
        transactionId: transaction.id
      })
      throw error
    }
  }

  /**
   * Maneja el pago fallido reutilizando el servicio existente
   * @param {Transaction} transaction - Transacción fallida
   * @param {Object} dbTransaction - Transacción de base de datos
   */
  async handlePaymentFailure (transaction, dbTransaction) {
    try {
      const transactionHandler = require('../webhook/handlers/transactionHandler')

      logger.logBusiness('transaction:statusVerification.paymentFailure.start', {
        transactionId: transaction.id,
        orderId: transaction.order.id
      })

      // Reutilizar la lógica optimizada existente del webhook handler
      await transactionHandler.handlePaymentFailureOptimized(transaction, dbTransaction)

      logger.logBusiness('transaction:statusVerification.paymentFailure.completed', {
        transactionId: transaction.id,
        orderId: transaction.order.id
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'handlePaymentFailure',
        transactionId: transaction.id
      })
      throw error
    }
  }

  /**
   * Reserva una licencia para la orden o la agrega a lista de espera
   * Reutiliza el servicio existente del webhook handler
   * @param {Order} order - Orden
   * @param {Object} dbTransaction - Transacción de base de datos
   * @returns {Promise<{license?: License, waitlisted?: boolean}>} - Resultado de la reserva
   */
  async reserveLicenseForOrder (order, dbTransaction) {
    try {
      const transactionHandler = require('../webhook/handlers/transactionHandler')

      logger.logBusiness('transaction:statusVerification.licenseReservation.start', {
        orderId: order.id,
        productRef: order.productRef
      })

      // Reutilizar la lógica existente del webhook handler
      const result = await transactionHandler.reserveLicenseForOrder(order, dbTransaction)

      logger.logBusiness('transaction:statusVerification.licenseReservation.completed', {
        orderId: order.id,
        productRef: order.productRef,
        hasLicense: !!result.license,
        waitlisted: !!result.waitlisted
      })

      return result
    } catch (error) {
      logger.logError(error, {
        operation: 'reserveLicenseForOrder',
        orderId: order.id,
        productRef: order.productRef
      })
      throw error
    }
  }

  /**
   * Verifica múltiples transacciones pendientes con procesamiento en lotes
   * @param {Array<number>} transactionIds - IDs de transacciones a verificar
   * @returns {Promise<Object>} - Resultados de la verificación
   */
  async verifyMultipleTransactions (transactionIds) {
    const results = {
      total: transactionIds.length,
      processed: 0,
      errors: [],
      details: []
    }

    logger.logBusiness('transaction:statusVerification.batchStart', {
      total: transactionIds.length
    })

    // Procesar en lotes de 5 para evitar saturar la API de Cobre
    const batchSize = 5
    const processingCache = new Set()

    for (let i = 0; i < transactionIds.length; i += batchSize) {
      const batch = transactionIds.slice(i, i + batchSize)

      logger.logBusiness('transaction:statusVerification.batchProcessing', {
        batchNumber: Math.floor(i / batchSize) + 1,
        batchSize: batch.length,
        totalBatches: Math.ceil(transactionIds.length / batchSize)
      })

      const batchPromises = batch.map(async (transactionId) => {
        // Prevenir procesamiento duplicado
        if (processingCache.has(transactionId)) {
          return {
            transactionId,
            error: 'Ya está siendo procesado'
          }
        }

        processingCache.add(transactionId)

        try {
          const result = await this.verifyTransactionStatus(transactionId)
          results.details.push(result)
          if (result.processed) {
            results.processed++
          }
          return result
        } catch (error) {
          logger.logError(error, {
            operation: 'verifyMultipleTransactions',
            transactionId
          })

          const errorResult = {
            transactionId,
            error: error.message
          }
          results.errors.push(errorResult)
          return errorResult
        } finally {
          processingCache.delete(transactionId)
        }
      })

      await Promise.all(batchPromises)

      // Pausa entre lotes para evitar saturar la API
      if (i + batchSize < transactionIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    logger.logBusiness('transaction:statusVerification.batchCompleted', {
      total: results.total,
      processed: results.processed,
      errors: results.errors.length
    })

    return results
  }

  /**
   * Verifica si se envió el email de licencia y lo reenvía si es necesario
   * @param {number} orderId - ID de la orden
   * @returns {Promise<Object>} - Resultado de la verificación y reenvío
   */
  async verifyAndResendLicenseEmail (orderId) {
    try {
      logger.logBusiness('transaction:statusVerification.emailVerification.start', { orderId })

      // Buscar la orden con todas sus relaciones
      const order = await Order.findByPk(orderId, {
        include: [
          { association: 'product' },
          { association: 'customer' },
          { association: 'transactions' }
        ]
      })

      if (!order) {
        throw new Error(`Orden ${orderId} no encontrada`)
      }

      // Verificar que la orden esté completada
      if (order.status !== 'COMPLETED') {
        throw new Error(`La orden ${orderId} no está completada (estado actual: ${order.status})`)
      }

      // Buscar la licencia asociada a la orden
      const license = await License.findOne({
        where: { orderId: order.id }
      })

      if (!license) {
        throw new Error(`La orden ${orderId} no tiene licencia asociada`)
      }

      // Verificar si ya se envió el email exitosamente
      const shippingInfo = order.shippingInfo || {}
      const emailInfo = shippingInfo.email

      if (emailInfo && emailInfo.sent === true) {
        logger.logBusiness('transaction:statusVerification.emailVerification.alreadySent', {
          orderId,
          sentAt: emailInfo.sentAt,
          messageId: emailInfo.messageId,
          recipient: emailInfo.recipient
        })

        return {
          success: true,
          message: 'Email ya fue enviado exitosamente',
          orderId: order.id,
          emailSent: true,
          sentAt: emailInfo.sentAt,
          messageId: emailInfo.messageId,
          recipient: emailInfo.recipient,
          resent: false
        }
      }

      // Si no se envió o falló, reenviar el email
      logger.logBusiness('transaction:statusVerification.emailVerification.resending', {
        orderId,
        customerEmail: order.customer.email,
        previousAttempt: emailInfo ? {
          sent: emailInfo.sent,
          attemptedAt: emailInfo.attemptedAt,
          error: emailInfo.error
        } : 'No previous attempt'
      })

      const emailService = require('../email')
      const emailResult = await emailService.sendLicenseEmail({
        customer: order.customer,
        product: order.product,
        license,
        order
      })

      // Actualizar shippingInfo con la información del reenvío
      const updatedShippingInfo = {
        ...shippingInfo,
        email: {
          sent: true,
          sentAt: new Date().toISOString(),
          messageId: emailResult.messageId,
          recipient: order.customer.email,
          type: 'license_delivery',
          resent: true,
          originalAttempt: emailInfo || null
        }
      }

      await order.update({
        shippingInfo: updatedShippingInfo
      })

      logger.logBusiness('transaction:statusVerification.emailVerification.resent', {
        orderId,
        customerEmail: order.customer.email,
        messageId: emailResult.messageId,
        resent: true
      })

      return {
        success: true,
        message: 'Email reenviado exitosamente',
        orderId: order.id,
        emailSent: true,
        sentAt: updatedShippingInfo.email.sentAt,
        messageId: emailResult.messageId,
        recipient: order.customer.email,
        resent: true,
        previousAttempt: emailInfo || null
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'verifyAndResendLicenseEmail',
        orderId
      })
      throw error
    }
  }
}

module.exports = new TransactionStatusVerifier()
