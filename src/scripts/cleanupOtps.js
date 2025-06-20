const { initDB } = require('../models/db')
const otpService = require('../services/otp.service')
const logger = require('../config/logger')

/**
 * Script para limpiar códigos OTP expirados
 * Se puede ejecutar como tarea programada (cron job)
 */
async function cleanupExpiredOtps () {
  try {
    logger.info('Iniciando limpieza de códigos OTP expirados...')

    // Inicializar la base de datos
    await initDB()

    // Ejecutar limpieza
    const deletedCount = await otpService.cleanupExpiredOtps()

    logger.info(`Limpieza completada. ${deletedCount} códigos OTP expirados eliminados.`)

    process.exit(0)
  } catch (error) {
    logger.logError(error, { operation: 'cleanupExpiredOtps' })
    process.exit(1)
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  cleanupExpiredOtps()
}

module.exports = cleanupExpiredOtps
