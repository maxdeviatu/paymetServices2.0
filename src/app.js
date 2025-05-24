const express = require('express')
const morgan = require('morgan')
const { PORT } = require('./config')
const logger = require('./config/logger')

const app = express()

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(morgan('dev'))

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() })
})

// Mount routes (to be implemented later)
// app.use('/api', require('./routes'))

// Error handling middleware
app.use((req, res, next) => {
  res.status(404).json({ error: 'Route not found' })
})

app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`)
  res.status(err.status || 500).json({
    error: {
      message: err.message,
      status: err.status || 500
    }
  })
})

// Start server
app.listen(PORT, () => {
  logger.info(`Servidor escuchando en puerto ${PORT}...`)
})

module.exports = app
