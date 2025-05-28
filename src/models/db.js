const { Sequelize } = require('sequelize')
const config = require('../config')
const logger = require('../config/logger')

// Crear instancia de Sequelize
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
    timezone: 'America/Bogota'
  }
)

/**
 * Inicializa la conexión a la base de datos y sincroniza los modelos
 * @returns {Promise<void>}
 */
async function initDB() {
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
