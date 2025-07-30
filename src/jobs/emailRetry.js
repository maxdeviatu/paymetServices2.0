const { Order, License } = require('../models')
const { Op } = require('sequelize')
const logger = require('../config/logger')
const TransactionManager = require('../utils/transactionManager')

/**
 * Email retry job - retries failed license emails for completed orders
 */
class EmailRetryJob {
  constructor () {
    this.name = 'emailRetry'
    this.maxRetries = 3
    this.retryIntervalMinutes = 15 // Reintentar cada 15 minutos
  }

  /**
   * Execute the email retry job
   */
  async execute () {
    try {
      logger.logBusiness('job:emailRetry.start', {
        maxRetries: this.maxRetries,
        retryIntervalMinutes: this.retryIntervalMinutes
      })

      // Find orders with failed emails or missing email info
      const ordersWithFailedEmail = await Order.findAll({
        where: {
          [Op.or]: [
            // Orders IN_PROCESS with failed email attempts
            {
              status: 'IN_PROCESS',
              [Op.or]: [
                { shippingInfo: null },
                {
                  shippingInfo: {
                    email: {
                      sent: false
                    }
                  }
                }
              ]
            },
            // Orders COMPLETED but without email info (legacy cases)
            {
              status: 'COMPLETED',
              shippingInfo: null
            }
          ]
        },
        include: [
          {
            association: 'customer',
            required: true
          },
          {
            association: 'product',
            required: true
          },
          {
            association: 'transactions',
            where: { status: 'PAID' },
            required: true
          }
        ]
      })

      // Filter orders that have sold licenses
      const ordersWithLicenses = []
      for (const order of ordersWithFailedEmail) {
        const license = await License.findOne({
          where: {
            orderId: order.id,
            status: 'SOLD'
          }
        })
        if (license) {
          order.licenses = [license]
          ordersWithLicenses.push(order)
        }
      }

      if (ordersWithLicenses.length === 0) {
        logger.logBusiness('job:emailRetry.noOrders', {
          checkedAt: new Date()
        })
        return { processed: 0, message: 'No orders without email found' }
      }

      let processedCount = 0
      let successCount = 0
      const errors = []

      // Process each order without email
      for (const order of ordersWithLicenses) {
        try {
          const result = await this.retryEmailForOrder(order)
          processedCount++
          if (result.success) {
            successCount++
          }
        } catch (error) {
          logger.logError(error, {
            operation: 'emailRetry.processOrder',
            orderId: order.id
          })
          errors.push({
            orderId: order.id,
            error: error.message
          })
        }
      }

      logger.logBusiness('job:emailRetry.completed', {
        totalOrders: ordersWithLicenses.length,
        processed: processedCount,
        success: successCount,
        errors: errors.length
      })

      return {
        processed: processedCount,
        success: successCount,
        total: ordersWithLicenses.length,
        errors
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'emailRetry.execute'
      })
      throw error
    }
  }

  /**
   * Retry email for a single order
   */
  async retryEmailForOrder (order) {
    return await TransactionManager.executeWebhookTransaction(async (dbTransaction) => {
      try {
        logger.logBusiness('emailRetry:processing', {
          orderId: order.id,
          customerEmail: order.customer.email,
          productRef: order.product.productRef,
          currentStatus: order.status
        })

        // Get the sold license for this order
        const license = order.licenses.find(l => l.status === 'SOLD')
        if (!license) {
          throw new Error('No sold license found for order')
        }

        // Import the transaction handler
        const transactionHandler = require('../services/webhook/handlers/transactionHandler')

        // Try to send the license email with database transaction
        const emailResult = await transactionHandler.sendLicenseEmail(
          order, 
          { id: 'retry' }, 
          license, 
          dbTransaction
        )

        // If email was successful and order is IN_PROCESS, complete it
        if (emailResult && emailResult.success && order.status === 'IN_PROCESS') {
          await order.update({
            status: 'COMPLETED'
          }, { transaction: dbTransaction })

          logger.logBusiness('emailRetry:orderCompleted', {
            orderId: order.id,
            previousStatus: 'IN_PROCESS',
            newStatus: 'COMPLETED'
          })
        }

        logger.logBusiness('emailRetry:success', {
          orderId: order.id,
          customerEmail: order.customer.email,
          licenseId: license.id,
          orderCompleted: order.status === 'IN_PROCESS'
        })

        return { success: true, orderCompleted: order.status === 'IN_PROCESS' }
      } catch (error) {
        logger.logError(error, {
          operation: 'emailRetry.retryEmail',
          orderId: order.id,
          customerEmail: order.customer?.email
        })

        // Update shipping info with retry attempt
        const currentShippingInfo = order.shippingInfo || {}
        const updatedShippingInfo = {
          ...currentShippingInfo,
          email: {
            sent: false,
            attemptedAt: new Date().toISOString(),
            error: error.message,
            recipient: order.customer?.email,
            type: 'license_delivery',
            retryAttempt: (currentShippingInfo.email?.retryAttempt || 0) + 1
          }
        }

        await order.update({
          shippingInfo: updatedShippingInfo
        }, { transaction: dbTransaction })

        return { success: false, error: error.message }
      }
    })
  }

  /**
   * Run the job (for manual execution)
   */
  async run () {
    try {
      logger.info('EmailRetryJob: Starting manual execution')
      const result = await this.execute()
      logger.info('EmailRetryJob: Manual execution completed', result)
      return result
    } catch (error) {
      logger.error('EmailRetryJob: Manual execution failed', error)
      throw error
    }
  }

  /**
   * Get cron configuration for this job
   */
  getCronConfig () {
    return {
      interval: `${this.retryIntervalMinutes} * * * *`, // Every 15 minutes
      timezone: 'America/Bogota'
    }
  }
}

module.exports = EmailRetryJob 