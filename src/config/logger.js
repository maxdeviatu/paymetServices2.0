const { createLogger, format, transports } = require('winston')
const path = require('path')
const winston = require('winston')

// Definir colores para los diferentes niveles de log
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
}

// Añadir colores a winston
require('winston').addColors(colors)

// Formato para desarrollo
const devFormat = format.combine(
  format.colorize({ all: true }),
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  format.printf(
    (info) => {
      const { timestamp, level, message, ...meta } = info
      let metaStr = ''
      if (Object.keys(meta).length > 0) {
        metaStr = '\n' + JSON.stringify(meta, null, 2)
      }
      return `[${timestamp}] ${level}: ${message}${metaStr}`
    }
  )
)

// Formato para producción
const prodFormat = format.combine(
  format.timestamp(),
  format.json()
)

// Crear el logger
const logger = createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: process.env.NODE_ENV === 'development' ? devFormat : prodFormat,
  transports: [
    // Consola para todos los entornos
    new transports.Console(),
    // Archivo de errores para todos los entornos
    new transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
})

// En desarrollo, añadir un archivo para todos los logs
if (process.env.NODE_ENV === 'development') {
  logger.add(new transports.File({
    filename: path.join('logs', 'combined.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }))
}

// Función helper para logging de errores
logger.logError = (error, context = {}) => {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    ...context
  }

  if (process.env.NODE_ENV === 'development') {
    logger.error('Error detallado:', errorInfo)
  } else {
    logger.error(error.message, { context })
  }
}

// Función helper para logging de operaciones de base de datos
logger.logDB = (operation, details) => {
  if (process.env.NODE_ENV === 'development') {
    logger.debug(`DB Operation [${operation}]:`, details)
  }
}

// Función helper para logging de operaciones de negocio
logger.logBusiness = (operation, details) => {
  if (process.env.NODE_ENV === 'development') {
    logger.info(`Business Operation [${operation}]:`, details)
  } else {
    logger.info(`Business Operation [${operation}]`)
  }
}

module.exports = logger
