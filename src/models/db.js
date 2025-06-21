const { Sequelize } = require('sequelize')
const config = require('../config')
const logger = require('../config/logger')

// Crear instancia de Sequelize con configuración optimizada para alto volumen
const sequelize = new Sequelize(
  config.DB_CONFIG.database,
  config.DB_CONFIG.username,
  config.DB_CONFIG.password,
  {
    host: config.DB_CONFIG.host,
    port: config.DB_CONFIG.port,
    dialect: config.DB_CONFIG.dialect,
    logging: (msg) => {
      // Silenciar ALTER 'idempotentes' (duración < 1 ms)
      if (!/ALTER TABLE/.test(msg) || msg.includes('Elapsed time: 0ms')) {
        logger.logDB('sequelize', { message: msg })
      }
    },
    define: {
      timestamps: true,
      underscored: true
    },
    benchmark: true,
    timezone: 'America/Bogota',
    // Configuración de connection pool para alto volumen
    pool: {
      max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX) : 20, // Máximo 20 conexiones
      min: process.env.DB_POOL_MIN ? parseInt(process.env.DB_POOL_MIN) : 5,   // Mínimo 5 conexiones
      acquire: process.env.DB_POOL_ACQUIRE ? parseInt(process.env.DB_POOL_ACQUIRE) : 30000, // 30 segundos para adquirir
      idle: process.env.DB_POOL_IDLE ? parseInt(process.env.DB_POOL_IDLE) : 10000,           // 10 segundos idle
      evict: process.env.DB_POOL_EVICT ? parseInt(process.env.DB_POOL_EVICT) : 1000          // 1 segundo para evict
    },
    // Configuración de timeouts
    dialectOptions: {
      connectTimeout: process.env.DB_CONNECT_TIMEOUT ? parseInt(process.env.DB_CONNECT_TIMEOUT) : 60000, // 60 segundos
      acquireTimeout: process.env.DB_ACQUIRE_TIMEOUT ? parseInt(process.env.DB_ACQUIRE_TIMEOUT) : 60000, // 60 segundos
      timeout: process.env.DB_QUERY_TIMEOUT ? parseInt(process.env.DB_QUERY_TIMEOUT) : 60000              // 60 segundos
    },
    // Configuración de retry
    retry: {
      max: process.env.DB_RETRY_MAX ? parseInt(process.env.DB_RETRY_MAX) : 3,  // 3 reintentos
      timeout: process.env.DB_RETRY_TIMEOUT ? parseInt(process.env.DB_RETRY_TIMEOUT) : 3000  // 3 segundos entre reintentos
    }
    // Nota: isolationLevel y transactionType se configuran por transacción individual
  }
)

/**
 * Inicializa la conexión a la base de datos y sincroniza los modelos
 * @returns {Promise<void>}
 */
async function initDB () {
  try {
    // Autenticar conexión
    await sequelize.authenticate()
    logger.info('Conexión a la base de datos establecida correctamente')

    // En desarrollo, sincronizar modelos con la base de datos
    if (process.env.NODE_ENV !== 'production') {
      const startTime = Date.now()
      try {
        // Usar variable de entorno para activar/desactivar alter
        const syncOptions = process.env.SCHEMA_ALTER === '1' ? { alter: true, drop: false } : { alter: false, drop: false }
        await sequelize.sync(syncOptions)
        const endTime = Date.now()
        const duration = endTime - startTime
        logger.info(`Sincronización de modelos completada en ${duration}ms. Clean slate aplicado.`)
        // TODO: Ejecutar seeders cuando process.env.DB_SEED === '1'
      } catch (error) {
        logger.error('Error en sincronización:', error.message)
        throw error
      }
    } else {
      logger.info('Modo producción: sincronización automática desactivada')
    }
    return true
  } catch (error) {
    logger.error('Error al conectar con la base de datos:', error.message)
    throw error
  }
}

module.exports = {
  sequelize,
  initDB
}
