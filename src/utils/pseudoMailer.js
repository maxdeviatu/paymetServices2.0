const logger = require('../config/logger')

/**
 * Servicio ficticio de envío de correos.
 * En producción se deberá conectar con Brevo, SendGrid o SMTP.
 */
const pseudoMailer = {
  /**
   * Envía un código OTP por correo electrónico
   * @param {string} email - Dirección de correo electrónico
   * @param {string} code - Código OTP de 6 dígitos
   * @returns {Promise<boolean>} - Indica si el envío fue exitoso
   */
  async sendOtp(email, code) {
    try {
      // Simulación: en ambiente real aquí se invocaría la API del proveedor de correos
      logger.info(`[PSEUDO-MAILER] Enviando OTP ${code} al correo ${email}`)
      
      // Simular tiempo de envío
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // En desarrollo, mostrar el código en los logs para testing
      if (process.env.NODE_ENV === 'development') {
        logger.warn(`[DESARROLLO] Código OTP para ${email}: ${code}`)
      }
      
      return true
    } catch (error) {
      logger.logError(error, { 
        operation: 'sendOtp',
        email,
        code: '***' // No loggear el código real en errores
      })
      return false
    }
  },

  /**
   * Envía un correo de bienvenida al usuario
   * @param {string} email - Dirección de correo electrónico
   * @param {string} firstName - Nombre del usuario
   * @returns {Promise<boolean>} - Indica si el envío fue exitoso
   */
  async sendWelcome(email, firstName) {
    try {
      logger.info(`[PSEUDO-MAILER] Enviando correo de bienvenida a ${email}`)
      
      // Simular tiempo de envío
      await new Promise(resolve => setTimeout(resolve, 100))
      
      if (process.env.NODE_ENV === 'development') {
        logger.info(`[DESARROLLO] Correo de bienvenida enviado a ${firstName} (${email})`)
      }
      
      return true
    } catch (error) {
      logger.logError(error, { 
        operation: 'sendWelcome',
        email,
        firstName
      })
      return false
    }
  }
}

module.exports = pseudoMailer 