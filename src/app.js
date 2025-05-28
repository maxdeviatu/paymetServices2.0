const express = require('express')
const cors = require('cors')
const morgan = require('morgan')
const { initDB } = require('./models/db')
const { createSuperAdmin } = require('./scripts/createSuperAdmin')
const logger = require('./config/logger')
const { PORT } = require('./config')

const app = express()

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(morgan('dev'))

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

// Función para iniciar el servidor
async function startServer() {
  try {
    // Inicializar la base de datos
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
    })
  } catch (error) {
    logger.error('Error fatal al iniciar el servidor:', error)
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

// Iniciar servidor
if (require.main === module) {
  startServer()
}

module.exports = app
