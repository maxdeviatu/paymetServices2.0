const { Transaction: SequelizeTransaction } = require('sequelize')
const { sequelize } = require('../models')
const logger = require('../config/logger')

/**
 * Transaction Manager - Manejo centralizado y optimizado de transacciones
 * Implementa diferentes estrategias de isolation level según el tipo de operación
 */
class TransactionManager {
  /**
   * Configuraciones de transacciones optimizadas para diferentes escenarios
   */
  static get TRANSACTION_CONFIGS() {
    return {
      // Para operaciones de lectura intensiva (webhooks, consultas)
      HIGH_CONCURRENCY: {
        isolationLevel: SequelizeTransaction.ISOLATION_LEVELS.READ_COMMITTED,
        description: 'Optimizado para alta concurrencia - permite lecturas no bloqueantes'
      },

      // Para operaciones críticas que requieren consistencia (pagos, creación de órdenes)
      CONSISTENT_WRITE: {
        isolationLevel: SequelizeTransaction.ISOLATION_LEVELS.REPEATABLE_READ,
        description: 'Optimizado para escrituras consistentes - previene phantom reads'
      },

      // Para operaciones de inventario que requieren locks (reserva de licencias)
      SERIALIZABLE_INVENTORY: {
        isolationLevel: SequelizeTransaction.ISOLATION_LEVELS.SERIALIZABLE,
        description: 'Máxima consistencia para inventario - previene race conditions'
      },

      // Para operaciones de bulk/masivas (imports, exports)
      BULK_OPERATIONS: {
        isolationLevel: SequelizeTransaction.ISOLATION_LEVELS.READ_UNCOMMITTED,
        description: 'Optimizado para operaciones masivas - máximo rendimiento'
      },

      // Para operaciones de solo lectura (reports, consultas)
      READ_ONLY: {
        isolationLevel: SequelizeTransaction.ISOLATION_LEVELS.READ_COMMITTED,
        description: 'Solo lectura - sin bloqueos de escritura'
      }
    }
  }

  /**
   * Ejecuta una transacción con configuración optimizada para webhooks
   * @param {Function} callback - Función a ejecutar dentro de la transacción
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<any>} - Resultado de la transacción
   */
  static async executeWebhookTransaction(callback, options = {}) {
    const config = {
      ...this.TRANSACTION_CONFIGS.HIGH_CONCURRENCY,
      ...options
    }

    logger.debug('TransactionManager: Starting webhook transaction', {
      isolationLevel: config.isolationLevel,
      type: config.type,
      description: config.description
    })

    const startTime = Date.now()
    
    try {
      const result = await sequelize.transaction(config, callback)
      
      const duration = Date.now() - startTime
      logger.debug('TransactionManager: Webhook transaction completed', {
        duration: `${duration}ms`,
        isolationLevel: config.isolationLevel
      })
      
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error('TransactionManager: Webhook transaction failed', {
        error: error.message,
        duration: `${duration}ms`,
        isolationLevel: config.isolationLevel,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * Ejecuta una transacción con configuración optimizada para pagos
   * @param {Function} callback - Función a ejecutar dentro de la transacción
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<any>} - Resultado de la transacción
   */
  static async executePaymentTransaction(callback, options = {}) {
    const config = {
      ...this.TRANSACTION_CONFIGS.CONSISTENT_WRITE,
      ...options
    }

    logger.debug('TransactionManager: Starting payment transaction', {
      isolationLevel: config.isolationLevel,
      type: config.type,
      description: config.description
    })

    const startTime = Date.now()
    
    try {
      const result = await sequelize.transaction(config, callback)
      
      const duration = Date.now() - startTime
      logger.info('TransactionManager: Payment transaction completed', {
        duration: `${duration}ms`,
        isolationLevel: config.isolationLevel
      })
      
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error('TransactionManager: Payment transaction failed', {
        error: error.message,
        duration: `${duration}ms`,
        isolationLevel: config.isolationLevel,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * Ejecuta una transacción con configuración optimizada para inventario
   * @param {Function} callback - Función a ejecutar dentro de la transacción
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<any>} - Resultado de la transacción
   */
  static async executeInventoryTransaction(callback, options = {}) {
    const config = {
      ...this.TRANSACTION_CONFIGS.SERIALIZABLE_INVENTORY,
      ...options
    }

    logger.debug('TransactionManager: Starting inventory transaction', {
      isolationLevel: config.isolationLevel,
      type: config.type,
      description: config.description
    })

    const startTime = Date.now()
    
    try {
      const result = await sequelize.transaction(config, callback)
      
      const duration = Date.now() - startTime
      logger.info('TransactionManager: Inventory transaction completed', {
        duration: `${duration}ms`,
        isolationLevel: config.isolationLevel
      })
      
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error('TransactionManager: Inventory transaction failed', {
        error: error.message,
        duration: `${duration}ms`,
        isolationLevel: config.isolationLevel,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * Ejecuta una transacción con configuración optimizada para operaciones masivas
   * @param {Function} callback - Función a ejecutar dentro de la transacción
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<any>} - Resultado de la transacción
   */
  static async executeBulkTransaction(callback, options = {}) {
    const config = {
      ...this.TRANSACTION_CONFIGS.BULK_OPERATIONS,
      ...options
    }

    logger.debug('TransactionManager: Starting bulk transaction', {
      isolationLevel: config.isolationLevel,
      type: config.type,
      description: config.description
    })

    const startTime = Date.now()
    
    try {
      const result = await sequelize.transaction(config, callback)
      
      const duration = Date.now() - startTime
      logger.info('TransactionManager: Bulk transaction completed', {
        duration: `${duration}ms`,
        isolationLevel: config.isolationLevel,
        recordsProcessed: options.recordsCount || 'unknown'
      })
      
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error('TransactionManager: Bulk transaction failed', {
        error: error.message,
        duration: `${duration}ms`,
        isolationLevel: config.isolationLevel,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * Ejecuta una transacción de solo lectura optimizada
   * @param {Function} callback - Función a ejecutar dentro de la transacción
   * @param {Object} options - Opciones adicionales
   * @returns {Promise<any>} - Resultado de la transacción
   */
  static async executeReadOnlyTransaction(callback, options = {}) {
    const config = {
      ...this.TRANSACTION_CONFIGS.READ_ONLY,
      ...options
    }

    logger.debug('TransactionManager: Starting read-only transaction', {
      isolationLevel: config.isolationLevel,
      description: config.description
    })

    const startTime = Date.now()
    
    try {
      const result = await sequelize.transaction(config, callback)
      
      const duration = Date.now() - startTime
      logger.debug('TransactionManager: Read-only transaction completed', {
        duration: `${duration}ms`,
        isolationLevel: config.isolationLevel
      })
      
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error('TransactionManager: Read-only transaction failed', {
        error: error.message,
        duration: `${duration}ms`,
        isolationLevel: config.isolationLevel,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * Ejecuta una transacción con configuración personalizada
   * @param {Function} callback - Función a ejecutor dentro de la transacción
   * @param {string} configName - Nombre de configuración predefinida
   * @param {Object} customOptions - Opciones personalizadas
   * @returns {Promise<any>} - Resultado de la transacción
   */
  static async executeCustomTransaction(callback, configName, customOptions = {}) {
    const baseConfig = this.TRANSACTION_CONFIGS[configName]
    
    if (!baseConfig) {
      throw new Error(`Unknown transaction configuration: ${configName}`)
    }

    const config = {
      ...baseConfig,
      ...customOptions
    }

    logger.debug('TransactionManager: Starting custom transaction', {
      configName,
      isolationLevel: config.isolationLevel,
      type: config.type,
      description: config.description
    })

    const startTime = Date.now()
    
    try {
      const result = await sequelize.transaction(config, callback)
      
      const duration = Date.now() - startTime
      logger.debug('TransactionManager: Custom transaction completed', {
        configName,
        duration: `${duration}ms`,
        isolationLevel: config.isolationLevel
      })
      
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error('TransactionManager: Custom transaction failed', {
        configName,
        error: error.message,
        duration: `${duration}ms`,
        isolationLevel: config.isolationLevel,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * Obtiene estadísticas de uso de transacciones
   * @returns {Object} - Estadísticas de transacciones
   */
  static getTransactionStats() {
    // En un entorno de producción, esto podría conectarse a métricas reales
    return {
      activeConnections: sequelize.connectionManager.pool.size,
      maxConnections: sequelize.connectionManager.pool.options.max,
      minConnections: sequelize.connectionManager.pool.options.min,
      idleConnections: sequelize.connectionManager.pool.available.length,
      usedConnections: sequelize.connectionManager.pool.used.length
    }
  }
}

module.exports = TransactionManager