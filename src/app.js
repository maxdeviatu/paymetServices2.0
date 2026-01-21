const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const helmet = require('helmet')
const { initDB } = require('./models/db')
require('./models/index.js') // Importa todos los modelos y relaciones antes de sincronizar
const { createSuperAdmin } = require('./scripts/createSuperAdmin')
const logger = require('./config/logger')
const { PORT } = require('./config')
const jobScheduler = require('./jobs/scheduler')
const { generalLimiter } = require('./middlewares/rateLimiter')
const paymentService = require('./services/payment')
const SiigoInitializer = require('./services/siigoInitializer')
const EnvironmentValidator = require('./config/envValidator')

const app = express()

// Trust proxy for webhooks and ngrok
app.set('trust proxy', true)

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API
  crossOriginEmbedderPolicy: false
}))

// Rate limiting for all requests
app.use('/api', generalLimiter)

// CORS middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}))

// Mount webhook routes BEFORE body parsing to preserve raw body
app.use('/api/webhooks', require('./routes/webhook.routes'))

// Mount external webhook routes (for providers that expect specific URLs)
app.use('/webhooks', require('./routes/webhook.routes'))

// Body parsing middleware for all other routes
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message) => {
      logger.info(message.trim())
    }
  }
}))

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date(),
    environment: process.env.NODE_ENV
  })
})

// Montar rutas
app.use('/api', require('./routes'))

// Manejo de errores 404
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  })
})

// Manejo de errores global
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`, {
    stack: err.stack,
    url: req.url,
    method: req.method
  })

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  })
})

// Versión del paquete para el banner
const { version } = require('../package.json')

/**
 * Inicializar conexión con Siigo (silencioso, retorna resultado)
 */
async function initializeSiigoConnection () {
  if (process.env.NODE_ENV === 'test') {
    return { success: false, skipped: true }
  }

  try {
    const result = await SiigoInitializer.initialize({ silent: true })
    return result
  } catch (error) {
    logger.detail('Siigo error', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Inicializar suscripción de webhooks de Cobre (silencioso, retorna resultado)
 */
async function initializeCobreWebhookSubscription () {
  if (process.env.NODE_ENV === 'test') {
    return { success: false, skipped: true }
  }

  if (!process.env.COBRE_WEBHOOK_URL || !process.env.COBRE_WEBHOOK_SECRET) {
    return { success: false, skipped: true, reason: 'config_missing' }
  }

  try {
    const CobreSubscriptionBootstrap = require('./scripts/bootstrapCobreSubscription')
    const bootstrap = new CobreSubscriptionBootstrap()
    const result = await bootstrap.bootstrap({ silent: true })
    return { success: true, ...result }
  } catch (error) {
    logger.detail('Cobre webhook error', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Función principal para inicializar el servidor con logs estructurados por fases
 */
async function initializeServer () {
  const startTime = Date.now()
  const warnings = []

  try {
    // ═══════════════════════════════════════════════════════════════
    // BANNER INICIAL
    // ═══════════════════════════════════════════════════════════════
    logger.banner(`PAYMENT SERVICES v${version} | Ambiente: ${process.env.NODE_ENV || 'development'} | Puerto: ${PORT}`, 'start')

    // ═══════════════════════════════════════════════════════════════
    // FASE 1: VALIDACIÓN DE CONFIGURACIÓN
    // ═══════════════════════════════════════════════════════════════
    logger.phase(1, 5, 'Validación de Configuración')

    const envValidator = new EnvironmentValidator()
    const validationResult = envValidator.validate({ silent: true })

    if (!validationResult.isValid) {
      logger.fail('Configuración inválida - No se puede iniciar el servidor')
      envValidator.printDetailedReport(validationResult.report)
      logger.info('📖 Consulta VARIABLES_ENTORNO.md y .env.example para más información')
      process.exit(1)
    }

    // Mostrar categorías validadas
    const categories = Object.keys(validationResult.report.categories)
      .filter(cat => validationResult.report.categories[cat].errors === 0)
      .map(cat => envValidator.getCategoryDisplayName(cat).replace('Configuración de ', '').replace('Configuración ', ''))
    logger.check(categories.join(', '))

    if (validationResult.warnings.length > 0) {
      warnings.push(...validationResult.warnings)
      logger.warning(`${validationResult.warnings.length} advertencia(s) (ver VARIABLES_ENTORNO.md)`)
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 2: BASE DE DATOS
    // ═══════════════════════════════════════════════════════════════
    logger.phase(2, 5, 'Base de Datos')

    const dbResult = await initDB({ silent: true })

    if (!dbResult.success) {
      throw new Error('No se pudo conectar a la base de datos')
    }

    const dbConfig = require('./config').DB_CONFIG
    logger.check(`PostgreSQL conectado (${dbConfig.host}:${dbConfig.port}/${dbConfig.database})`)

    if (dbResult.modelsCount) {
      logger.check(`${dbResult.modelsCount} modelos sincronizados en ${dbResult.syncDuration}ms`)
    }

    // Crear super administrador
    try {
      const adminResult = await createSuperAdmin({ silent: true })
      if (adminResult.created) {
        logger.check('Super administrador creado')
      } else {
        logger.detail('Super admin', 'ya existe')
      }
    } catch (error) {
      logger.detail('Super admin error', error.message)
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 3: SERVICIOS INTERNOS
    // ═══════════════════════════════════════════════════════════════
    logger.phase(3, 5, 'Servicios Internos')

    if (process.env.NODE_ENV !== 'test') {
      // Job Scheduler
      const schedulerResult = jobScheduler.start({ silent: true })
      const activeJobs = schedulerResult.active || []
      const pausedJobs = schedulerResult.paused || []

      let jobStatus = `Job Scheduler: ${activeJobs.length} jobs activos`
      if (activeJobs.length > 0) {
        jobStatus += ` (${activeJobs.join(', ')})`
      }
      if (pausedJobs.length > 0) {
        jobStatus += ` | ${pausedJobs.length} pausado(s)`
      }
      logger.check(jobStatus)

      // Email Queue Service
      const emailQueueService = require('./services/emailQueue.service')
      const emailResult = emailQueueService.initialize({ silent: true })
      logger.check(`Email Queue: ${emailResult.mode || 'modo directo v2.0'}`)
    } else {
      logger.check('Servicios omitidos (modo test)')
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 4: PROVEEDORES EXTERNOS
    // ═══════════════════════════════════════════════════════════════
    logger.phase(4, 5, 'Proveedores Externos')

    // Inicializar proveedores de pago
    const paymentResult = await paymentService.initialize({ silent: true })

    // Mostrar estado de Cobre
    if (paymentResult.providers?.cobre) {
      const cobre = paymentResult.providers.cobre
      if (cobre.authenticated) {
        const tokenExpiry = cobre.tokenExpiration ? new Date(cobre.tokenExpiration).toLocaleTimeString('es-CO') : 'N/A'
        logger.check(`Cobre: autenticado (token válido hasta ${tokenExpiry})`)
      } else {
        logger.warning('Cobre: no autenticado')
      }
    }

    // Inicializar Siigo
    const siigoResult = await initializeSiigoConnection()
    if (siigoResult.success) {
      const siigoExpiry = siigoResult.status?.tokenExpiration
        ? new Date(siigoResult.status.tokenExpiration).toLocaleDateString('es-CO')
        : 'N/A'
      logger.check(`Siigo: conectado (token expira ${siigoExpiry})`)
    } else if (siigoResult.skipped) {
      logger.detail('Siigo', 'omitido (modo test)')
    } else {
      logger.warning('Siigo: no conectado')
    }

    // Inicializar webhook de Cobre
    const webhookResult = await initializeCobreWebhookSubscription()
    if (webhookResult.success) {
      logger.check(`Webhook: suscripción activa (${webhookResult.id}) - ${webhookResult.events?.length || 0} eventos`)
    } else if (webhookResult.skipped) {
      logger.detail('Webhook', 'omitido')
    } else {
      logger.warning('Webhook: no configurado')
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 5: SERVIDOR HTTP
    // ═══════════════════════════════════════════════════════════════
    logger.phase(5, 5, 'Servidor HTTP')

    await new Promise((resolve) => {
      app.listen(PORT, () => {
        logger.check(`Escuchando en http://localhost:${PORT}`)
        logger.check(`Health check: http://localhost:${PORT}/health`)
        resolve()
      })
    })

    // ═══════════════════════════════════════════════════════════════
    // BANNER FINAL
    // ═══════════════════════════════════════════════════════════════
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    let finalMessage = `SERVIDOR LISTO | Tiempo de arranque: ${duration}s`
    if (warnings.length > 0) {
      finalMessage += ` | ${warnings.length} advertencia(s)`
    }
    logger.banner(finalMessage, 'end')
  } catch (error) {
    logger.fail(`Error fatal: ${error.message}`)
    logger.error('Failed to initialize server:', error)
    process.exit(1)
  }
}

// Manejo de señales para cierre graceful
process.on('SIGTERM', () => {
  logger.info('SIGTERM recibido, cerrando servidor...')
  process.exit(0)
})

process.on('SIGINT', () => {
  logger.info('SIGINT recibido, cerrando servidor...')
  process.exit(0)
})

// Inicializar el servidor
initializeServer()

module.exports = app
