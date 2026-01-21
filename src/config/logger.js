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

// ============================================================================
// HELPERS PARA LOGS DE STARTUP (solo en desarrollo)
// ============================================================================

const SEPARATOR_CHAR = '═'
const SEPARATOR_LENGTH = 65

/**
 * Muestra un banner con separadores
 * @param {string} title - Título del banner
 * @param {string} type - Tipo: 'start', 'end', 'section'
 */
logger.banner = (title, type = 'section') => {
  if (process.env.NODE_ENV !== 'development') {
    logger.info(title)
    return
  }

  const separator = SEPARATOR_CHAR.repeat(SEPARATOR_LENGTH)

  if (type === 'start' || type === 'end') {
    console.log('')
    console.log(`\x1b[36m${separator}\x1b[0m`)
    console.log(`\x1b[36m  ${title}\x1b[0m`)
    console.log(`\x1b[36m${separator}\x1b[0m`)
    if (type === 'start') console.log('')
  } else {
    console.log('')
    console.log(`\x1b[33m── ${title} ${'─'.repeat(Math.max(0, SEPARATOR_LENGTH - title.length - 4))}\x1b[0m`)
  }
}

/**
 * Muestra encabezado de fase
 * @param {number} current - Número de fase actual
 * @param {number} total - Total de fases
 * @param {string} name - Nombre de la fase
 */
logger.phase = (current, total, name) => {
  if (process.env.NODE_ENV !== 'development') {
    logger.info(`[FASE ${current}/${total}] ${name}`)
    return
  }

  console.log('')
  console.log(`\x1b[1m\x1b[34m[FASE ${current}/${total}] ${name}\x1b[0m`)
}

/**
 * Muestra línea con checkmark verde
 * @param {string} message - Mensaje a mostrar
 */
logger.check = (message) => {
  if (process.env.NODE_ENV !== 'development') {
    logger.info(`✓ ${message}`)
    return
  }

  console.log(`  \x1b[32m✓\x1b[0m ${message}`)
}

/**
 * Muestra línea con advertencia amarilla
 * @param {string} message - Mensaje de advertencia
 */
logger.warning = (message) => {
  if (process.env.NODE_ENV !== 'development') {
    logger.warn(`⚠ ${message}`)
    return
  }

  console.log(`  \x1b[33m⚠\x1b[0m ${message}`)
}

/**
 * Muestra línea con error rojo
 * @param {string} message - Mensaje de error
 */
logger.fail = (message) => {
  if (process.env.NODE_ENV !== 'development') {
    logger.error(`✗ ${message}`)
    return
  }

  console.log(`  \x1b[31m✗\x1b[0m ${message}`)
}

/**
 * Muestra resumen compacto de items
 * @param {Object} items - Objeto con items a mostrar { label: status }
 */
logger.summary = (items) => {
  if (process.env.NODE_ENV !== 'development') {
    logger.info('Summary:', items)
    return
  }

  const parts = Object.entries(items).map(([key, value]) => {
    if (value === true || value === 'ok' || value === 'success') {
      return `\x1b[32m${key}\x1b[0m`
    } else if (value === false || value === 'error' || value === 'failed') {
      return `\x1b[31m${key}\x1b[0m`
    } else if (value === 'warn' || value === 'warning' || value === 'skipped') {
      return `\x1b[33m${key}\x1b[0m`
    }
    return `${key}: ${value}`
  })

  console.log(`  ${parts.join(', ')}`)
}

/**
 * Muestra información detallada (solo en modo debug)
 * @param {string} label - Etiqueta
 * @param {any} data - Datos a mostrar
 */
logger.detail = (label, data) => {
  if (process.env.LOG_LEVEL === 'debug' || process.env.DEBUG_STARTUP === 'true') {
    if (process.env.NODE_ENV === 'development') {
      console.log(`    \x1b[90m${label}: ${typeof data === 'object' ? JSON.stringify(data) : data}\x1b[0m`)
    } else {
      logger.debug(`${label}:`, data)
    }
  }
}

module.exports = logger
