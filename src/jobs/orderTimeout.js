const { Order, Transaction, License, sequelize } = require('../models')
const { Op } = require('sequelize')
const logger = require('../config/logger')

/**
 * Order timeout job - cancels orders that have been pending too long
 */
class OrderTimeoutJob {
  constructor() {
    this.name = 'orderTimeout'
    this.timeoutMinutes = process.env.ORDER_TIMEOUT_MINUTES || 30
  }

  /**
   * Execute the timeout job
   */
  async execute() {
    try {
      logger.logBusiness('job:orderTimeout.start', {
        timeoutMinutes: this.timeoutMinutes
      })

      const cutoffTime = new Date(Date.now() - (this.timeoutMinutes * 60 * 1000))

      // Find expired orders
      const expiredOrders = await Order.findAll({
        where: {
          status: 'PENDING',
          createdAt: {
            [Op.lt]: cutoffTime
          }
        },
        include: [
          { 
            association: 'transactions',
            where: {
              status: { [Op.in]: ['CREATED', 'PENDING'] }
            },
            required: false
          }
        ]
      })

      if (expiredOrders.length === 0) {
        logger.logBusiness('job:orderTimeout.noExpired', {
          checkedAt: new Date()
        })
        return { processed: 0, message: 'No expired orders found' }
      }

      let processedCount = 0
      const errors = []

      // Process each expired order
      for (const order of expiredOrders) {
        try {
          await this.processExpiredOrder(order)
          processedCount++
        } catch (error) {
          logger.logError(error, {
            operation: 'orderTimeout.processOrder',
            orderId: order.id
          })
          errors.push({
            orderId: order.id,
            error: error.message
          })
        }
      }

      logger.logBusiness('job:orderTimeout.completed', {
        totalExpired: expiredOrders.length,
        processed: processedCount,
        errors: errors.length
      })

      return {
        processed: processedCount,
        total: expiredOrders.length,
        errors
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'orderTimeout.execute'
      })
      throw error
    }
  }

  /**
   * Process a single expired order
   */
  async processExpiredOrder(order) {
    return await sequelize.transaction(async (t) => {
      logger.logBusiness('order:timeout', {
        orderId: order.id,
        customerId: order.customerId,
        productRef: order.productRef,
        createdAt: order.createdAt
      })

      // Update order status to CANCELED
      await order.update({
        status: 'CANCELED'
      }, { transaction: t })

      // Update all related transactions to FAILED
      await Transaction.update(
        { status: 'FAILED' },
        {
          where: {
            orderId: order.id,
            status: { [Op.in]: ['CREATED', 'PENDING'] }
          },
          transaction: t
        }
      )

      // Check if any licenses were reserved for this order and return them
      const reservedLicenses = await License.findAll({
        where: {
          orderId: order.id,
          status: { [Op.in]: ['RESERVED', 'SOLD'] }
        },
        transaction: t
      })

      if (reservedLicenses.length > 0) {
        for (const license of reservedLicenses) {
          await license.update({
            status: 'AVAILABLE',
            orderId: null,
            reservedAt: null,
            soldAt: null
          }, { transaction: t })

          logger.logBusiness('license:returned', {
            licenseId: license.id,
            orderId: order.id,
            reason: 'ORDER_TIMEOUT'
          })
        }
      }

      logger.logBusiness('order:timeout.processed', {
        orderId: order.id,
        licensesReturned: reservedLicenses.length
      })
    })
  }

  /**
   * Run the job manually (for testing)
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
   * Get job configuration for cron scheduler
   */
  getCronConfig() {
    return {
      name: this.name,
      cronTime: '*/5 * * * *', // Every 5 minutes
      onTick: () => this.run(),
      start: false,
      timeZone: 'America/Bogota'
    }
  }
}

module.exports = OrderTimeoutJob