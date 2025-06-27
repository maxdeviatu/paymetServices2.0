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

// Body parsing middleware
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

/**
 * Inicializar suscripción de webhooks de Cobre
 */
async function initializeCobreWebhookSubscription () {
  try {
    // Solo ejecutar en producción o si está explícitamente habilitado
    if (process.env.NODE_ENV === 'test') {
      logger.info('Skipping Cobre webhook subscription in test environment')
      return
    }

    // Verificar si las variables de entorno están configuradas
    if (!process.env.COBRE_WEBHOOK_URL || !process.env.COBRE_WEBHOOK_SECRET) {
      logger.warn('Cobre webhook configuration missing, skipping subscription setup')
      logger.warn('Required env vars: COBRE_WEBHOOK_URL, COBRE_WEBHOOK_SECRET')
      return
    }

    logger.info('Initializing Cobre webhook subscription...')

    const CobreSubscriptionBootstrap = require('./scripts/bootstrapCobreSubscription')
    const bootstrap = new CobreSubscriptionBootstrap()

    const result = await bootstrap.bootstrap()

    logger.info('✅ Cobre webhook subscription initialized successfully', {
      subscriptionId: result.id,
      url: result.url,
      events: result.events,
      createdAt: result.created_at
    })
  } catch (error) {
    logger.error('❌ Failed to initialize Cobre webhook subscription', {
      error: error.message,
      stack: error.stack
    })

    // No fallar el servidor por problemas de webhook
    logger.warn('Server will continue without webhook subscription')
  }
}

// Función para inicializar el servidor
async function initializeServer () {
  try {
    // 1. VALIDAR VARIABLES DE ENTORNO ANTES QUE NADA
    console.log('\n🔧 Iniciando validación de configuración...')
    const envValidator = new EnvironmentValidator()
    const validationResult = envValidator.validate()

    if (!validationResult.isValid) {
      console.log('\n❌ CONFIGURACIÓN INVÁLIDA - No se puede iniciar el servidor')
      envValidator.printDetailedReport(validationResult.report)
      console.log('\n📖 Consulta VARIABLES_ENTORNO.md y .env.example para más información')
      process.exit(1)
    }

    // Mostrar resumen de configuración
    logger.info('✅ Validación de variables de entorno completada exitosamente')
    if (validationResult.warnings.length > 0) {
      logger.warn(`⚠️ Se encontraron ${validationResult.warnings.length} advertencia(s) - revisar logs`)
    }

    // 2. Inicializar la base de datos
    logger.info('🔗 Inicializando conexión a base de datos...')
    const dbConnected = await initDB()

    if (!dbConnected) {
      throw new Error('No se pudo conectar a la base de datos')
    }

    logger.info('Base de datos inicializada correctamente')

    // Crear super administrador después de la sincronización
    try {
      await createSuperAdmin()
      logger.info('Super administrador verificado/creado correctamente')
    } catch (error) {
      logger.warn('Error al crear super administrador (puede que ya exista):', error.message)
    }

    // Iniciar el servidor
    app.listen(PORT, () => {
      logger.info(`Servidor corriendo en puerto ${PORT}`)
      logger.info(`Ambiente: ${process.env.NODE_ENV}`)
      logger.info(`Health check disponible en: http://localhost:${PORT}/health`)

      // Iniciar job scheduler para tareas en segundo plano
      if (process.env.NODE_ENV !== 'test') {
        jobScheduler.start()
        logger.info('Job scheduler iniciado')
      }

      // Inicializar proveedores de pago después de que todo esté listo
      paymentService.initialize()
        .then(async () => {
          logger.info('Payment providers initialization completed')

          // Inicializar suscripción de webhooks de Cobre después de los proveedores
          await initializeCobreWebhookSubscription()
        })
        .catch(error => {
          logger.error('Failed to initialize payment providers:', error.message)
        })
    })
  } catch (error) {
    console.error('Failed to initialize server:', error)
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
