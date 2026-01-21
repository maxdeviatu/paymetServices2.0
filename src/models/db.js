const { Sequelize } = require('sequelize')
const config = require('../config')
const logger = require('../config/logger')

// Control de verbosidad durante el inicio
let startupMode = true
let syncQueryCount = 0

/**
 * Función de logging para Sequelize
 * En modo startup, silencia queries de sincronización (CREATE TABLE, SELECT, etc.)
 * Solo muestra logs detallados si DEBUG_STARTUP=true o LOG_LEVEL=debug
 */
const sequelizeLogging = (msg) => {
  // Durante el inicio, solo contar queries sin mostrarlas
  if (startupMode) {
    // Contar CREATE TABLE para el resumen
    if (/CREATE TABLE/.test(msg)) {
      syncQueryCount++
    }
    // Solo mostrar si debug está habilitado
    if (process.env.DEBUG_STARTUP === 'true' || process.env.LOG_LEVEL === 'debug') {
      logger.logDB('sequelize', { message: msg })
    }
    return
  }

  // Después del inicio, comportamiento normal (solo en desarrollo)
  if (process.env.NODE_ENV === 'development') {
    // Silenciar ALTER idempotentes
    if (!/ALTER TABLE/.test(msg) || msg.includes('Elapsed time: 0ms')) {
      logger.logDB('sequelize', { message: msg })
    }
  }
}

// Crear instancia de Sequelize con configuración optimizada para alto volumen
const sequelize = new Sequelize(
  config.DB_CONFIG.database,
  config.DB_CONFIG.username,
  config.DB_CONFIG.password,
  {
    host: config.DB_CONFIG.host,
    port: config.DB_CONFIG.port,
    dialect: config.DB_CONFIG.dialect,
    logging: sequelizeLogging,
    define: {
      timestamps: true,
      underscored: true
    },
    benchmark: true,
    timezone: 'America/Bogota',
    // Configuración de connection pool para alto volumen
    pool: {
      max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX) : 20, // Máximo 20 conexiones
      min: process.env.DB_POOL_MIN ? parseInt(process.env.DB_POOL_MIN) : 5, // Mínimo 5 conexiones
      acquire: process.env.DB_POOL_ACQUIRE ? parseInt(process.env.DB_POOL_ACQUIRE) : 30000, // 30 segundos para adquirir
      idle: process.env.DB_POOL_IDLE ? parseInt(process.env.DB_POOL_IDLE) : 10000, // 10 segundos idle
      evict: process.env.DB_POOL_EVICT ? parseInt(process.env.DB_POOL_EVICT) : 1000 // 1 segundo para evict
    },
    // Configuración de timeouts
    dialectOptions: {
      connectTimeout: process.env.DB_CONNECT_TIMEOUT ? parseInt(process.env.DB_CONNECT_TIMEOUT) : 60000, // 60 segundos
      acquireTimeout: process.env.DB_ACQUIRE_TIMEOUT ? parseInt(process.env.DB_ACQUIRE_TIMEOUT) : 60000, // 60 segundos
      timeout: process.env.DB_QUERY_TIMEOUT ? parseInt(process.env.DB_QUERY_TIMEOUT) : 60000 // 60 segundos
    },
    // Configuración de retry
    retry: {
      max: process.env.DB_RETRY_MAX ? parseInt(process.env.DB_RETRY_MAX) : 3, // 3 reintentos
      timeout: process.env.DB_RETRY_TIMEOUT ? parseInt(process.env.DB_RETRY_TIMEOUT) : 3000 // 3 segundos entre reintentos
    }
    // Nota: isolationLevel y transactionType se configuran por transacción individual
  }
)

/**
 * Inicializa la conexión a la base de datos y sincroniza los modelos
 * @param {Object} options - Opciones de inicialización
 * @param {boolean} options.silent - Si es true, no emite logs (para modo startup estructurado)
 * @returns {Promise<Object>} Resultado de la inicialización
 */
async function initDB (options = {}) {
  const { silent = false } = options

  try {
    // Resetear contador de queries
    syncQueryCount = 0
    startupMode = true

    // Autenticar conexión
    await sequelize.authenticate()

    if (!silent) {
      logger.info('Conexión a la base de datos establecida correctamente')
    }

    let syncDuration = 0
    let modelsCount = 0

    // En desarrollo, sincronizar modelos con la base de datos
    if (process.env.NODE_ENV !== 'production') {
      const startTime = Date.now()
      try {
        // Usar variable de entorno para activar/desactivar alter
        const syncOptions = process.env.SCHEMA_ALTER === '1' ? { alter: true, drop: false } : { alter: false, drop: false }
        await sequelize.sync(syncOptions)

        syncDuration = Date.now() - startTime
        modelsCount = syncQueryCount // Número de CREATE TABLE ejecutados

        if (!silent) {
          logger.info(`Sincronización de modelos completada en ${syncDuration}ms. Clean slate aplicado.`)
        }
      } catch (error) {
        logger.error('Error en sincronización:', error.message)
        throw error
      }
    } else {
      if (!silent) {
        logger.info('Modo producción: sincronización automática desactivada')
      }
    }

    // Desactivar modo startup para logs normales
    startupMode = false

    return {
      success: true,
      syncDuration,
      modelsCount
    }
  } catch (error) {
    startupMode = false
    logger.error('Error al conectar con la base de datos:', error.message)
    throw error
  }
}

module.exports = {
  sequelize,
  initDB
}
