const { OtpCode } = require('../models')
const { Op } = require('sequelize')
const logger = require('../config/logger')
const pseudoMailer = require('../utils/pseudoMailer')

/**
 * Servicio para la gestión de códigos OTP
 */
class OtpService {
  /**
   * Genera un código OTP de 6 dígitos
   * @returns {string} Código OTP de 6 dígitos
   */
  generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }

  /**
   * Calcula la fecha de expiración del OTP (10 minutos desde ahora)
   * @returns {Date} Fecha de expiración
   */
  getExpirationDate() {
    const now = new Date()
    return new Date(now.getTime() + 10 * 60 * 1000) // 10 minutos
  }

  /**
   * Solicita un código OTP para el email especificado
   * @param {string} email - Email del usuario
   * @returns {Promise<Object>} Resultado de la operación
   */
  async requestOtp(email) {
    try {
      logger.logBusiness('requestOtp', { email })

      // Invalidar códigos OTP anteriores no utilizados para este email
      await OtpCode.update(
        { used: true },
        {
          where: {
            email,
            used: false,
            expiresAt: { [Op.gt]: new Date() }
          }
        }
      )

      // Generar nuevo código OTP
      const code = this.generateCode()
      const expiresAt = this.getExpirationDate()

      // Guardar el código en la base de datos
      const otpRecord = await OtpCode.create({
        email,
        code,
        expiresAt,
        used: false
      })

      // Enviar el código por correo
      const emailSent = await pseudoMailer.sendOtp(email, code)

      if (!emailSent) {
        logger.warn('Error al enviar OTP por correo', { email })
        // Aunque falle el envío, mantenemos el código generado para testing
      }

      logger.logBusiness('requestOtp.success', { 
        email,
        otpId: otpRecord.id,
        expiresAt 
      })

      return {
        success: true,
        message: 'Código OTP enviado correctamente',
        expiresAt
      }
    } catch (error) {
      logger.logError(error, { 
        operation: 'requestOtp',
        email 
      })
      throw error
    }
  }

  /**
   * Verifica un código OTP
   * @param {string} email - Email del usuario
   * @param {string} code - Código OTP a verificar
   * @returns {Promise<Object>} Resultado de la verificación
   */
  async verifyOtp(email, code) {
    try {
      logger.logBusiness('verifyOtp', { email })

      // Buscar código OTP válido
      const otpRecord = await OtpCode.findOne({
        where: {
          email,
          code,
          used: false,
          expiresAt: { [Op.gt]: new Date() }
        }
      })

      if (!otpRecord) {
        logger.warn('Código OTP inválido o expirado', { email, code: '***' })
        return {
          success: false,
          message: 'Código OTP inválido o expirado'
        }
      }

      // Marcar el código como usado
      await otpRecord.update({ used: true })

      logger.logBusiness('verifyOtp.success', { 
        email,
        otpId: otpRecord.id 
      })

      return {
        success: true,
        message: 'Código OTP verificado correctamente'
      }
    } catch (error) {
      logger.logError(error, { 
        operation: 'verifyOtp',
        email 
      })
      throw error
    }
  }

  /**
   * Limpia códigos OTP expirados de la base de datos
   * @returns {Promise<number>} Número de códigos eliminados
   */
  async cleanupExpiredOtps() {
    try {
      const deletedCount = await OtpCode.destroy({
        where: {
          expiresAt: { [Op.lt]: new Date() }
        }
      })

      if (deletedCount > 0) {
        logger.info(`Limpieza de OTPs expirados: ${deletedCount} códigos eliminados`)
      }

      return deletedCount
    } catch (error) {
      logger.logError(error, { operation: 'cleanupExpiredOtps' })
      throw error
    }
  }
}

module.exports = new OtpService() 