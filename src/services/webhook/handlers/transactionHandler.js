const { Transaction, Order, CobreCheckout, sequelize } = require('../../../models')
const { Op } = require('sequelize')
const logger = require('../../../config/logger')
const TransactionManager = require('../../../utils/transactionManager')

/**
 * Handler para procesar eventos de transacciones de webhooks
 */
class TransactionHandler {
  /**
   * Procesa un evento de webhook
   * @param {Object} webhookEvent - Evento normalizado del webhook
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async handle (webhookEvent) {
    try {
      logger.info('TransactionHandler: Processing webhook event', {
        provider: webhookEvent.provider,
        type: webhookEvent.type,
        externalRef: webhookEvent.externalRef,
        status: webhookEvent.status,
        amount: webhookEvent.amount
      })

      // Optimización: Usar TransactionManager para webhook con configuración optimizada
      return await TransactionManager.executeWebhookTransaction(async (t) => {
        // Buscar la transacción por referencia externa
        const transaction = await this.findTransaction(webhookEvent, t)

        if (!transaction) {
          // Para eventos balance_credit, retornar success sin procesamiento
          if (webhookEvent.type === 'balance_credit') {
            logger.info('TransactionHandler: balance_credit event ignored - internal notification', {
              externalRef: webhookEvent.externalRef,
              provider: webhookEvent.provider,
              amount: webhookEvent.amount
            })
            return {
              success: true,
              reason: 'balance_credit_ignored',
              externalRef: webhookEvent.externalRef,
              message: 'balance_credit events are internal Cobre notifications'
            }
          }

          logger.warn('TransactionHandler: Transaction not found', {
            externalRef: webhookEvent.externalRef,
            provider: webhookEvent.provider
          })
          return {
            success: false,
            reason: 'transaction_not_found',
            externalRef: webhookEvent.externalRef
          }
        }

        // Verificar si ya fue procesado (idempotencia)
        if (this.isAlreadyProcessed(transaction, webhookEvent)) {
          logger.info('TransactionHandler: Event already processed', {
            transactionId: transaction.id,
            currentStatus: transaction.status,
            webhookStatus: webhookEvent.status
          })
          return {
            success: true,
            reason: 'already_processed',
            transactionId: transaction.id
          }
        }

        // Actualizar la transacción de forma más eficiente
        const oldStatus = transaction.status
        // Actualizar la transacción y su estado de facturación si es necesario
        const updateData = {
          status: webhookEvent.status,
          paymentMethod: webhookEvent.paymentMethod,
          meta: {
            ...transaction.meta,
            webhook: webhookEvent,
            lastWebhookAt: new Date().toISOString()
          }
        }

        // Si el pago es exitoso, marcar para facturación
        if (webhookEvent.status === 'PAID') {
          updateData.invoiceStatus = 'PENDING'
        }

        await transaction.update(updateData, { transaction: t })

        // Procesar lógica específica según el estado (sin bloquear la transacción principal)
        const processingPromises = []

        if (webhookEvent.status === 'PAID' && oldStatus !== 'PAID') {
          processingPromises.push(this.handlePaymentSuccessOptimized(transaction, t))
        } else if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(webhookEvent.status)) {
          processingPromises.push(this.handlePaymentFailureOptimized(transaction, t))
        }

        // Ejecutar procesamiento en paralelo cuando sea posible
        await Promise.all(processingPromises)

        logger.info('TransactionHandler: Successfully processed webhook', {
          transactionId: transaction.id,
          orderId: transaction.orderId,
          oldStatus,
          newStatus: webhookEvent.status,
          externalRef: webhookEvent.externalRef
        })

        return {
          success: true,
          transactionId: transaction.id,
          orderId: transaction.orderId,
          oldStatus,
          newStatus: webhookEvent.status
        }
      })
    } catch (error) {
      logger.error('TransactionHandler: Error processing webhook', {
        error: error.message,
        stack: error.stack,
        webhookEvent: {
          provider: webhookEvent.provider,
          externalRef: webhookEvent.externalRef,
          type: webhookEvent.type
        }
      })
      throw error
    }
  }

  /**
   * Busca la transacción por referencia externa
   * @param {Object} webhookEvent - Evento del webhook
   * @param {Object} transaction - Transacción de Sequelize
   * @returns {Promise<Transaction>} - Transacción encontrada
   */
  async findTransaction (webhookEvent, transaction) {
    const provider = webhookEvent.provider
    const externalRef = webhookEvent.externalRef
    const eventType = webhookEvent.type

    logger.info('TransactionHandler: Searching for transaction', {
      provider,
      externalRef,
      eventType
    })

    let foundTransaction = null

    if (provider === 'cobre') {
      // Para Cobre, intentar múltiples estrategias de búsqueda
      foundTransaction = await this.findCobreTransaction(webhookEvent, transaction)
    } else {
      // Para otros proveedores, buscar por gatewayRef directamente
      foundTransaction = await Transaction.findOne({
        where: {
          gateway: provider,
          gatewayRef: externalRef
        },
        include: [{
          association: 'order',
          include: [
            { association: 'product' },
            { association: 'customer' }
          ]
        }],
        transaction
      })
    }

    if (!foundTransaction) {
      logger.warn('TransactionHandler: Transaction not found after all search strategies', {
        provider,
        externalRef,
        eventType
      })
      return null
    }

    logger.info('TransactionHandler: Transaction found', {
      transactionId: foundTransaction.id,
      orderId: foundTransaction.orderId,
      gateway: foundTransaction.gateway,
      gatewayRef: foundTransaction.gatewayRef,
      status: foundTransaction.status
    })

    return foundTransaction
  }

  /**
   * Busca transacciones específicamente para Cobre usando external_id como identificador único
   * @param {Object} webhookEvent - Evento del webhook
   * @param {Object} transaction - Transacción de Sequelize
   * @returns {Promise<Transaction>} - Transacción encontrada
   */
  async findCobreTransaction (webhookEvent, transaction) {
    const { externalRef, type: eventType } = webhookEvent

    // Filtrar eventos balance_credit que no corresponden a transacciones de usuario
    if (eventType === 'balance_credit') {
      logger.info('TransactionHandler: Skipping balance_credit event - internal Cobre notification', {
        externalRef,
        eventType,
        status: webhookEvent.status,
        amount: webhookEvent.amount,
        message: 'balance_credit events are internal Cobre notifications and do not require transaction processing'
      })
      return null
    }

    // Estrategia 1: buscar por gateway_ref (external_id)
    try {
      const result = await this._searchByGatewayRef(externalRef, transaction)
      if (result) {
        logger.info('TransactionHandler: Found Cobre transaction by external_id', {
          transactionId: result.id,
          externalRef,
          eventType,
          gatewayRef: result.gatewayRef
        })
        return result
      }
    } catch (error) {
      logger.error('TransactionHandler: Error searching by gateway_ref', {
        externalRef,
        eventType,
        error: error.message
      })
    }

    // Estrategia 2: Para eventos de falla/rechazo, buscar por amount correlation (último recurso)
    // Esto es necesario porque Cobre puede no incluir external_id en webhooks de transacciones fallidas
    if (['FAILED', 'CANCELLED', 'REJECTED'].includes(webhookEvent.status)) {
      logger.info('TransactionHandler: Trying amount correlation for failed transaction', {
        externalRef,
        eventType,
        status: webhookEvent.status,
        amount: webhookEvent.amount
      })

      try {
        const result = await this._searchByAmountCorrelationFallback(webhookEvent, transaction)
        if (result) {
          logger.info('TransactionHandler: Found Cobre transaction by amount correlation (failed transaction)', {
            transactionId: result.id,
            externalRef,
            eventType,
            gatewayRef: result.gatewayRef,
            amount: webhookEvent.amount
          })
          return result
        }
      } catch (error) {
        logger.error('TransactionHandler: Error in amount correlation fallback', {
          externalRef,
          eventType,
          error: error.message
        })
      }
    }

    // Si no se encuentra la transacción, log warning y retornar null
    logger.warn('TransactionHandler: No transaction found for external_id', {
      externalRef,
      eventType,
      status: webhookEvent.status,
      message: 'Transaction not found - this may indicate a webhook for a different transaction or system issue'
    })

    return null
  }

  /**
   * Estrategia 1: Buscar por gatewayRef directo
   * @param {string} externalRef - Referencia externa
   * @param {Object} transaction - Transacción de Sequelize
   * @returns {Promise<Transaction>} - Transacción encontrada
   * @private
   */
  async _searchByGatewayRef (externalRef, transaction) {
    return await Transaction.findOne({
      where: {
        gateway: 'cobre',
        gatewayRef: externalRef
      },
      include: this._getTransactionIncludes(),
      transaction
    })
  }

  /**
   * Estrategia 2: Buscar por uniqueTransactionId en metadata
   * @param {string} externalRef - Referencia externa
   * @param {string} eventType - Tipo de evento
   * @param {Object} transaction - Transacción de Sequelize
   * @returns {Promise<Transaction>} - Transacción encontrada
   * @private
   */
  async _searchByUniqueTransactionId (externalRef, eventType, transaction) {
    // Solo aplicar esta estrategia para eventos de balance credit
    if (eventType !== 'balance_credit') {
      return null
    }

    return await Transaction.findOne({
      where: {
        gateway: 'cobre',
        meta: {
          [Op.contains]: {
            uniqueTransactionId: externalRef
          }
        }
      },
      include: this._getTransactionIncludes(),
      transaction
    })
  }

  /**
   * Estrategia 3: Buscar a través de la tabla cobre_checkouts
   * @param {string} externalRef - Referencia externa
   * @param {Object} transaction - Transacción de Sequelize
   * @returns {Promise<Transaction>} - Transacción encontrada
   * @private
   */
  async _searchByCobreCheckout (externalRef, transaction) {
    const cobreCheckout = await CobreCheckout.findOne({
      where: {
        [Op.or]: [
          { checkoutId: externalRef },
          { checkoutId: { [Op.like]: `%${externalRef}%` } }
        ]
      },
      include: [{
        model: Transaction,
        as: 'transaction',
        include: this._getTransactionIncludes()
      }],
      transaction
    })

    return cobreCheckout?.transaction || null
  }

  /**
   * Estrategia de fallback: Buscar por correlación de monto para transacciones fallidas
   * Solo se usa cuando no se puede encontrar por external_id y es un evento de falla
   * @param {Object} webhookEvent - Evento del webhook
   * @param {Object} transaction - Transacción de Sequelize
   * @returns {Promise<Transaction>} - Transacción encontrada
   * @private
   */
  async _searchByAmountCorrelationFallback (webhookEvent, transaction) {
    const { amount } = webhookEvent
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000) // Solo 1 hora para reducir falsos positivos

    const recentTransactions = await Transaction.findAll({
      where: {
        gateway: 'cobre',
        status: ['CREATED', 'PENDING'], // Solo transacciones que podrían fallar
        amount,
        createdAt: { [Op.gte]: oneHourAgo } // Ventana más corta para mayor precisión
      },
      include: this._getTransactionIncludes(),
      order: [['createdAt', 'DESC']],
      limit: 3, // Límite muy reducido para evitar ambigüedad
      transaction
    })

    // Retornar solo si hay exactamente una coincidencia (para evitar ambigüedad)
    if (recentTransactions.length === 1) {
      return recentTransactions[0]
    }

    if (recentTransactions.length > 1) {
      logger.warn('TransactionHandler: Multiple transactions found with same amount, skipping correlation', {
        amount,
        transactionsFound: recentTransactions.length,
        transactionIds: recentTransactions.map(t => t.id)
      })
    }

    return null
  }

  /**
   * DEPRECATED: Estrategia 4: Buscar por correlación de monto en transacciones recientes
   * Esta función ya no se usa desde que implementamos correlación por external_id
   * Se mantiene comentada para referencia histórica
   */
  // async _searchByAmountCorrelation(webhookEvent, transaction) {
  //   const { amount } = webhookEvent;
  //   const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  //
  //   const recentTransactions = await Transaction.findAll({
  //     where: {
  //       gateway: 'cobre',
  //       status: ['CREATED', 'PENDING'],
  //       amount: amount,
  //       createdAt: { [Op.gte]: oneDayAgo }
  //     },
  //     include: this._getTransactionIncludes(),
  //     order: [['createdAt', 'DESC']],
  //     limit: 5,
  //     transaction
  //   });
  //
  //   return recentTransactions[0] || null;
  // }

  /**
   * Obtiene las inclusiones estándar para consultas de transacciones
   * @returns {Array} - Array de inclusiones
   * @private
   */
  _getTransactionIncludes () {
    return [{
      association: 'order',
      include: [
        { association: 'product' },
        { association: 'customer' }
      ]
    }]
  }

  /**
   * Verifica si el evento ya fue procesado
   * @param {Transaction} transaction - Transacción
   * @param {Object} webhookEvent - Evento del webhook
   * @returns {boolean} - true si ya fue procesado
   */
  isAlreadyProcessed (transaction, webhookEvent) {
    // Si la transacción ya está pagada y el webhook también indica pago, ya fue procesado
    if (transaction.status === 'PAID' && webhookEvent.status === 'PAID') {
      return true
    }

    // Verificar si hay metadata del webhook que indique que ya fue procesado
    if (transaction.meta && transaction.meta.lastWebhookAt) {
      const lastWebhookTime = new Date(transaction.meta.lastWebhookAt)
      const webhookTime = new Date(webhookEvent.payload.created_at || Date.now())

      // Si el webhook es más antiguo que el último procesado, ya fue procesado
      if (webhookTime <= lastWebhookTime) {
        return true
      }
    }

    return false
  }

  /**
   * Actualiza la transacción con los datos del webhook
   * @param {Transaction} transaction - Transacción a actualizar
   * @param {Object} webhookEvent - Evento del webhook
   * @param {Object} dbTransaction - Transacción de base de datos
   */
  async updateTransaction (transaction, webhookEvent, dbTransaction) {
    const updateData = {
      status: webhookEvent.status,
      meta: {
        ...transaction.meta,
        webhook: {
          eventId: webhookEvent.eventId,
          type: webhookEvent.type,
          status: webhookEvent.status,
          amount: webhookEvent.amount,
          currency: webhookEvent.currency,
          processedAt: new Date().toISOString()
        },
        lastWebhookAt: new Date().toISOString()
      }
    }

    // Agregar información específica del proveedor
    if (webhookEvent.provider === 'cobre') {
      updateData.meta.cobreEvent = webhookEvent.payload
    }

    await transaction.update(updateData, { transaction: dbTransaction })
  }

  /**
   * Versión optimizada de updateTransaction para alto volumen
   * @param {Transaction} transaction - Transacción a actualizar
   * @param {Object} webhookEvent - Evento del webhook
   * @param {Object} dbTransaction - Transacción de base de datos
   */
  async updateTransactionOptimized (transaction, webhookEvent, dbTransaction) {
    // Preparar metadata de forma más eficiente
    const webhookMeta = {
      eventId: webhookEvent.eventId,
      type: webhookEvent.type,
      status: webhookEvent.status,
      amount: webhookEvent.amount,
      currency: webhookEvent.currency,
      processedAt: new Date().toISOString()
    }

    // Construir metadata incremental en lugar de reemplazar todo
    const existingMeta = transaction.meta || {}
    const updatedMeta = {
      ...existingMeta,
      webhook: webhookMeta,
      lastWebhookAt: new Date().toISOString()
    }

    // Agregar información específica del proveedor de forma condicional
    if (webhookEvent.provider === 'cobre') {
      updatedMeta.cobreEvent = webhookEvent.payload
    }

    // Update con campos específicos para mejor performance
    await transaction.update({
      status: webhookEvent.status,
      meta: updatedMeta
    }, {
      transaction: dbTransaction,
      fields: ['status', 'meta', 'updated_at'] // Solo actualizar campos necesarios
    })
  }

  /**
   * Maneja el pago exitoso
   * @param {Transaction} transaction - Transacción
   * @param {Object} dbTransaction - Transacción de base de datos
   */
  async handlePaymentSuccess (transaction, dbTransaction) {
    try {
      const order = transaction.order

      // Actualizar estado de la orden
      await order.update({
        status: 'IN_PROCESS'
      }, { transaction: dbTransaction })

      // Si es producto digital con licencia, manejar licencia y email
      if (order.product && order.product.license_type) {
        // Reservar licencia (confirma que el pago fue exitoso)
        const licenseResult = await this.reserveLicenseForOrder(order, dbTransaction)

        // Enviar email de licencia ANTES de completar la orden
        try {
          await this.sendLicenseEmail(order, transaction, licenseResult?.license, dbTransaction)

          // Solo completar la orden si el email se envió exitosamente
          await order.update({
            status: 'COMPLETED'
          }, { transaction: dbTransaction })

          logger.info('TransactionHandler: License email sent and order completed', {
            orderId: order.id,
            transactionId: transaction.id,
            licenseReserved: !!licenseResult
          })
        } catch (emailError) {
          // Si el email falla, mantener la orden en IN_PROCESS
          logger.error('TransactionHandler: Email failed, order kept in IN_PROCESS', {
            error: emailError.message,
            orderId: order.id,
            transactionId: transaction.id
          })
          // NO completar la orden - se reintentará después
        }
      }

      // Enviar email de confirmación
      setImmediate(async () => {
        try {
          // await this.sendOrderConfirmation(order, transaction)
        } catch (emailError) {
          logger.error('TransactionHandler: Error sending order confirmation', {
            error: emailError.message,
            orderId: order.id
          })
        }
      })

      logger.info('TransactionHandler: Payment success handled', {
        orderId: order.id,
        transactionId: transaction.id,
        hasLicense: order.product?.license_type || false
      })
    } catch (error) {
      logger.error('TransactionHandler: Error handling payment success', {
        error: error.message,
        transactionId: transaction.id
      })
      throw error
    }
  }

  /**
   * Versión optimizada de handlePaymentSuccess para alto volumen
   * @param {Transaction} transaction - Transacción
   * @param {Object} dbTransaction - Transacción de base de datos
   */
  async handlePaymentSuccessOptimized (transaction, dbTransaction) {
    try {
      const order = transaction.order

      // Batch updates para mejor performance
      const updates = []

      // Actualizar estado de facturación a PENDING
      updates.push(
        transaction.update({
          invoiceStatus: 'PENDING'
        }, {
          transaction: dbTransaction,
          fields: ['invoiceStatus', 'updated_at']
        })
      )

      // Actualizar estado de la orden
      updates.push(
        order.update({
          status: 'IN_PROCESS'
        }, {
          transaction: dbTransaction,
          fields: ['status', 'updated_at']
        })
      )

      // Si es producto digital con licencia, manejar licencia y completar orden
      if (order.product && order.product.license_type) {
        // Reservar licencia de forma transaccional o agregar a lista de espera
        const licensePromise = this.reserveLicenseForOrder(order, dbTransaction)
        updates.push(licensePromise)

        // Ejecutar actualizaciones en paralelo
        const results = await Promise.all(updates)
        const licenseResult = results.find(result => result && (result.license || result.waitlisted))

        if (licenseResult?.license) {
          // Licencia asignada exitosamente, enviar email ANTES de completar orden
          logger.info('TransactionHandler: About to send license email (optimized)', {
            orderId: order.id,
            transactionId: transaction.id,
            licenseId: licenseResult.license.id
          })

          try {
            const emailResult = await this.sendLicenseEmail(order, transaction, licenseResult.license, dbTransaction)

            logger.info('TransactionHandler: sendLicenseEmail completed (optimized)', {
              orderId: order.id,
              transactionId: transaction.id,
              emailResult
            })

            // Solo completar la orden si el email se envió exitosamente
            await order.update({
              status: 'COMPLETED'
            }, {
              transaction: dbTransaction,
              fields: ['status', 'updated_at']
            })

            logger.info('TransactionHandler: License email sent and order completed (optimized)', {
              orderId: order.id,
              transactionId: transaction.id,
              licenseReserved: true
            })
          } catch (emailError) {
            // Si el email falla, mantener la orden en IN_PROCESS
            logger.error('TransactionHandler: Email failed, order kept in IN_PROCESS (optimized)', {
              error: emailError.message,
              orderId: order.id,
              transactionId: transaction.id
            })
            // NO completar la orden - se reintentará después
          }
        } else if (licenseResult?.waitlisted) {
          // Agregado a lista de espera, mantener orden en IN_PROCESS
          logger.info('TransactionHandler: Order added to waitlist', {
            orderId: order.id,
            waitlistEntryId: licenseResult.waitlistEntry?.id
          })

          // Programar envío de email de lista de espera de forma asíncrona
          setImmediate(() => {
            this.sendWaitlistNotification(order, transaction, licenseResult.waitlistEntry).catch(error => {
              logger.error('TransactionHandler: Error sending waitlist notification', {
                error: error.message,
                orderId: order.id
              })
            })
          })
        }
      } else {
        // Solo ejecutar la actualización de estado
        await Promise.all(updates)

        // Para productos sin licencias, completar la orden inmediatamente
        await order.update({
          status: 'COMPLETED'
        }, {
          transaction: dbTransaction,
          fields: ['status', 'updated_at']
        })

        // Programar envío de email de confirmación de forma asíncrona
        setImmediate(() => {
          this.sendOrderConfirmation(order, transaction).catch(error => {
            logger.error('TransactionHandler: Error sending order confirmation', {
              error: error.message,
              orderId: order.id
            })
          })
        })

        logger.info('TransactionHandler: Order completed for non-license product', {
          orderId: order.id,
          transactionId: transaction.id
        })
      }

      logger.info('TransactionHandler: Payment success handled (optimized)', {
        orderId: order.id,
        transactionId: transaction.id,
        hasLicense: order.product?.license_type || false
      })
    } catch (error) {
      logger.error('TransactionHandler: Error handling payment success (optimized)', {
        error: error.message,
        transactionId: transaction.id
      })
      throw error
    }
  }

  /**
   * Maneja el pago fallido
   * @param {Transaction} transaction - Transacción
   * @param {Object} dbTransaction - Transacción de base de datos
   */
  async handlePaymentFailure (transaction, dbTransaction) {
    try {
      const order = transaction.order

      // Verificar si hay otras transacciones pendientes
      const otherTransactions = await Transaction.findAll({
        where: {
          orderId: order.id,
          id: { [Op.ne]: transaction.id },
          status: { [Op.in]: ['CREATED', 'PENDING'] }
        },
        transaction: dbTransaction
      })

      // Si no hay otras transacciones pendientes, cancelar la orden
      if (otherTransactions.length === 0) {
        await order.update({
          status: 'CANCELED'
        }, { transaction: dbTransaction })
      }

      logger.info('TransactionHandler: Payment failure handled', {
        orderId: order.id,
        transactionId: transaction.id,
        orderCanceled: otherTransactions.length === 0
      })
    } catch (error) {
      logger.error('TransactionHandler: Error handling payment failure', {
        error: error.message,
        transactionId: transaction.id
      })
      throw error
    }
  }

  /**
   * Versión optimizada de handlePaymentFailure para alto volumen
   * @param {Transaction} transaction - Transacción
   * @param {Object} dbTransaction - Transacción de base de datos
   */
  async handlePaymentFailureOptimized (transaction, dbTransaction) {
    try {
      const order = transaction.order

      // Query optimizada con count en lugar de findAll para mejor performance
      const pendingTransactionsCount = await Transaction.count({
        where: {
          orderId: order.id,
          id: { [Op.ne]: transaction.id },
          status: { [Op.in]: ['CREATED', 'PENDING'] }
        },
        transaction: dbTransaction
      })

      // Si no hay otras transacciones pendientes, cancelar la orden
      const shouldCancel = pendingTransactionsCount === 0
      if (shouldCancel) {
        await order.update({
          status: 'CANCELED'
        }, {
          transaction: dbTransaction,
          fields: ['status', 'updated_at']
        })
      }

      logger.info('TransactionHandler: Payment failure handled (optimized)', {
        orderId: order.id,
        transactionId: transaction.id,
        orderCanceled: shouldCancel,
        pendingTransactionsCount
      })
    } catch (error) {
      logger.error('TransactionHandler: Error handling payment failure (optimized)', {
        error: error.message,
        transactionId: transaction.id
      })
      throw error
    }
  }

  /**
   * Reserva una licencia para la orden o la agrega a lista de espera
   * @param {Order} order - Orden
   * @param {Object} dbTransaction - Transacción de base de datos
   * @returns {Promise<{license?: License, waitlisted?: boolean}>} - Resultado de la reserva
   */
  async reserveLicenseForOrder (order, dbTransaction) {
    const { License, WaitlistEntry } = require('../../../models')

    // Nota: dbTransaction ya viene del TransactionManager con configuración optimizada
    // Buscar licencia disponible con lock pesimista para prevenir race conditions
    const license = await License.findOne({
      where: {
        productRef: order.productRef,
        status: 'AVAILABLE'
      },
      lock: dbTransaction.LOCK.UPDATE,
      transaction: dbTransaction
    })

    if (!license) {
      // No hay licencias disponibles, agregar a lista de espera
      logger.info('TransactionHandler: No licenses available, adding to waitlist', {
        orderId: order.id,
        productRef: order.productRef
      })

      // Crear entrada en lista de espera
      const waitlistEntry = await WaitlistEntry.create({
        orderId: order.id,
        customerId: order.customerId,
        productRef: order.productRef,
        qty: order.qty,
        status: 'PENDING',
        priority: new Date(), // FIFO
        retryCount: 0
      }, { transaction: dbTransaction })

      logger.info('TransactionHandler: Added to waitlist', {
        waitlistEntryId: waitlistEntry.id,
        orderId: order.id,
        customerId: order.customerId,
        productRef: order.productRef
      })

      return { waitlisted: true, waitlistEntry }
    }

    // Reservar licencia
    await license.update({
      status: 'SOLD',
      orderId: order.id,
      soldAt: new Date()
    }, { transaction: dbTransaction })

    logger.info('TransactionHandler: License reserved', {
      licenseId: license.id,
      orderId: order.id,
      productRef: order.productRef
    })

    return { license }
  }

  /**
   * Envía email de confirmación de orden
   * @param {Order} order - Orden
   * @param {Transaction} transaction - Transacción
   */
  async sendOrderConfirmation (order, transaction) {
    const emailService = require('../../email')

    await emailService.sendOrderConfirmation({
      customer: order.customer,
      product: order.product,
      order,
      transaction
    })
  }

  /**
   * Envía email con licencia
   * @param {Order} order - Orden
   * @param {Transaction} transaction - Transacción
   * @param {License} providedLicense - Licencia ya reservada (opcional)
   * @param {Object} dbTransaction - Transacción de base de datos (opcional)
   */
  async sendLicenseEmail (order, transaction, providedLicense = null, dbTransaction = null) {
    logger.info('TransactionHandler: sendLicenseEmail method called', {
      orderId: order.id,
      transactionId: transaction.id,
      hasProvidedLicense: !!providedLicense,
      providedLicenseId: providedLicense?.id
    })

    const emailService = require('../../email')
    let license = providedLicense

    // Si no se proporciona la licencia, buscarla en la base de datos
    if (!license) {
      const { License } = require('../../../models')
      license = await License.findOne({
        where: { orderId: order.id }
      })
    }

    logger.info('TransactionHandler: License found for email', {
      orderId: order.id,
      licenseId: license?.id,
      licenseKey: license?.licenseKey,
      source: providedLicense ? 'provided' : 'database'
    })

    if (license) {
      try {
        logger.info('TransactionHandler: About to call emailService.sendLicenseEmail', {
          orderId: order.id,
          customerEmail: order.customer.email,
          licenseId: license.id,
          licenseKey: license.licenseKey
        })

        // Enviar email
        const emailResult = await emailService.sendLicenseEmail({
          customer: order.customer,
          product: order.product,
          license,
          order
        })

        logger.info('TransactionHandler: emailService.sendLicenseEmail returned', {
          orderId: order.id,
          emailResult,
          resultType: typeof emailResult,
          success: emailResult?.success,
          messageId: emailResult?.messageId
        })

        // Si el email se envió exitosamente, actualizar shippingInfo
        if (emailResult && emailResult.success) {
          const currentShippingInfo = order.shippingInfo || {}
          const updatedShippingInfo = {
            ...currentShippingInfo,
            email: {
              sent: true,
              sentAt: new Date().toISOString(),
              messageId: emailResult.messageId,
              recipient: order.customer.email,
              type: 'license_delivery'
            }
          }

          // Actualizar la orden con la información del email enviado
          await order.update({
            shippingInfo: updatedShippingInfo
          }, dbTransaction ? { transaction: dbTransaction } : {})

          logger.info('TransactionHandler: Email sent and shippingInfo updated', {
            orderId: order.id,
            customerEmail: order.customer.email,
            messageId: emailResult.messageId,
            shippingInfoUpdated: true
          })
        } else {
          logger.warn('TransactionHandler: Email result indicates failure or no success flag', {
            orderId: order.id,
            emailResult,
            success: emailResult?.success
          })
        }

        return emailResult
      } catch (emailError) {
        logger.error('TransactionHandler: Error sending license email', {
          error: emailError.message,
          stack: emailError.stack,
          orderId: order.id,
          customerEmail: order.customer.email
        })

        // Registrar el intento fallido en shippingInfo
        const currentShippingInfo = order.shippingInfo || {}
        const updatedShippingInfo = {
          ...currentShippingInfo,
          email: {
            sent: false,
            attemptedAt: new Date().toISOString(),
            error: emailError.message,
            recipient: order.customer.email,
            type: 'license_delivery'
          }
        }

        // Actualizar la orden con la información del intento fallido
        await order.update({
          shippingInfo: updatedShippingInfo
        }, dbTransaction ? { transaction: dbTransaction } : {})

        throw emailError
      }
    } else {
      logger.error('TransactionHandler: No license found for order', {
        orderId: order.id,
        productRef: order.productRef,
        message: 'Cannot send license email without license'
      })

      return {
        success: false,
        error: 'No license found for order',
        orderId: order.id
      }
    }
  }

  /**
   * Envía email de notificación de lista de espera
   * @param {Order} order - Orden
   * @param {Transaction} transaction - Transacción
   * @param {WaitlistEntry} waitlistEntry - Entrada de lista de espera
   */
  async sendWaitlistNotification (order, transaction, waitlistEntry) {
    const emailService = require('../../email')

    if (waitlistEntry) {
      try {
        // Enviar email
        const emailResult = await emailService.sendWaitlistNotification({
          customer: order.customer,
          product: order.product,
          order,
          waitlistEntry
        })

        // Si el email se envió exitosamente, actualizar shippingInfo
        if (emailResult && emailResult.success) {
          const currentShippingInfo = order.shippingInfo || {}
          const updatedShippingInfo = {
            ...currentShippingInfo,
            email: {
              sent: true,
              sentAt: new Date().toISOString(),
              messageId: emailResult.messageId,
              recipient: order.customer.email,
              type: 'waitlist_notification'
            }
          }

          // Actualizar la orden con la información del email enviado
          await order.update({
            shippingInfo: updatedShippingInfo
          })

          logger.info('TransactionHandler: Waitlist email sent and shippingInfo updated', {
            orderId: order.id,
            customerEmail: order.customer.email,
            messageId: emailResult.messageId,
            waitlistEntryId: waitlistEntry.id,
            shippingInfoUpdated: true
          })
        }

        return emailResult
      } catch (emailError) {
        logger.error('TransactionHandler: Error sending waitlist notification', {
          error: emailError.message,
          orderId: order.id,
          customerEmail: order.customer.email,
          waitlistEntryId: waitlistEntry.id
        })

        // Registrar el intento fallido en shippingInfo
        const currentShippingInfo = order.shippingInfo || {}
        const updatedShippingInfo = {
          ...currentShippingInfo,
          email: {
            sent: false,
            attemptedAt: new Date().toISOString(),
            error: emailError.message,
            recipient: order.customer.email,
            type: 'waitlist_notification'
          }
        }

        // Actualizar la orden con la información del intento fallido
        await order.update({
          shippingInfo: updatedShippingInfo
        })

        throw emailError
      }
    }
  }
}

module.exports = new TransactionHandler()
