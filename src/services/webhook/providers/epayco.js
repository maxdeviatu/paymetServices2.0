const logger = require('../../../config/logger')
const crypto = require('crypto')

/**
 * Adaptador de webhook para ePayco
 * Implementa la interfaz IProviderAdapter
 */
class EPaycoAdapter {
  constructor () {
    this.name = 'epayco'
    // Configuración de ePayco para verificación de firma
    this.pCustIdCliente = process.env.EPAYCO_P_CUST_ID_CLIENTE
    this.pKey = process.env.EPAYCO_P_KEY
  }

  /**
   * Parsea el webhook de ePayco (implementa interfaz IProviderAdapter)
   * @param {Object} req - Request de Express
   * @returns {Array} - Array de eventos normalizados
   */
  parseWebhook (req) {
    return this.normalize(req)
  }

  /**
   * Normaliza el webhook de ePayco al formato estándar
   * @param {Object} req - Request de Express
   * @returns {Array} - Array de eventos normalizados
   */
  normalize (req) {
    try {
      const body = req.body

      logger.info('EPaycoAdapter: Normalizing webhook', {
        invoice: body.x_id_factura,
        transactionId: body.x_transaction_id,
        amount: body.x_amount,
        status: body.x_cod_transaction_state
      })

      // ePayco siempre envía un solo evento por webhook
      const event = {
        eventId: (body.x_transaction_id && body.x_transaction_id !== '000000') ? body.x_transaction_id : null,
        externalRef: body.x_id_factura, // Invoice ID como referencia externa
        type: 'payment',
        status: this.mapStatus(body.x_cod_transaction_state),
        amount: this.parseAmount(body.x_amount),
        currency: body.x_currency_code || 'COP',
        provider: 'epayco',
        payload: body,
        timestamp: body.x_transaction_date ? new Date(body.x_transaction_date) : new Date()
      }

      logger.info('EPaycoAdapter: Event normalized', {
        eventId: event.eventId,
        externalRef: event.externalRef,
        status: event.status,
        amount: event.amount
      })

      return [event]
    } catch (error) {
      logger.error('EPaycoAdapter: Error normalizing webhook', {
        error: error.message,
        body: req.body
      })
      throw error
    }
  }

  /**
   * Mapea los estados de ePayco a estados internos
   * @param {string} epaycoState - Estado de ePayco
   * @returns {string} - Estado interno
   */
  mapStatus (epaycoState) {
    const statusMap = {
      1: 'PAID', // Aceptada
      2: 'FAILED', // Rechazada
      3: 'PENDING', // Pendiente
      4: 'FAILED', // Fallida
      6: 'PENDING', // Reversada
      7: 'PENDING', // Retenida
      8: 'FAILED', // Iniciada
      9: 'FAILED', // Fallida por validación
      10: 'FAILED', // Fallida por datos
      11: 'FAILED' // Fallida por fechas
    }

    return statusMap[epaycoState] || 'FAILED'
  }

  /**
   * Parsea el monto de ePayco (en pesos) a centavos
   * @param {string} amount - Monto en pesos
   * @returns {number} - Monto en centavos
   */
  parseAmount (amount) {
    try {
      // ePayco envía el monto en pesos, convertirlo a centavos
      const pesos = parseFloat(amount)
      return Math.round(pesos * 100)
    } catch (error) {
      logger.error('EPaycoAdapter: Error parsing amount', {
        amount,
        error: error.message
      })
      return 0
    }
  }

  /**
   * Verifica la autenticidad del webhook
   * @param {Object} req - Request de Express
   * @returns {boolean} - true si es válido
   */
  verifySignature (req) {
    try {
      const body = req.body

      // Verificar que tenga los campos requeridos
      if (!body.x_id_factura || !body.x_transaction_id || !body.x_amount || !body.x_signature) {
        logger.warn('EPaycoAdapter: Missing required fields', {
          hasInvoice: !!body.x_id_factura,
          hasTransactionId: !!body.x_transaction_id,
          hasAmount: !!body.x_amount,
          hasSignature: !!body.x_signature
        })
        return false
      }

      // Verificar firma SHA256 de ePayco
      const stringToSign = [
        this.pCustIdCliente,
        this.pKey,
        body.x_ref_payco,
        body.x_transaction_id,
        body.x_amount,
        body.x_currency_code
      ].join('^')

      const computed = crypto.createHash('sha256').update(stringToSign).digest('hex')
      const isValid = computed === body.x_signature

      logger.debug('EPaycoAdapter: Signature verification', {
        computed: computed.substring(0, 10) + '...',
        received: body.x_signature?.substring(0, 10) + '...',
        isValid
      })

      if (!isValid) {
        logger.error('EPaycoAdapter: Invalid signature', {
          computed: computed.substring(0, 10) + '...',
          received: body.x_signature?.substring(0, 10) + '...'
        })
      }

      return isValid
    } catch (error) {
      logger.error('EPaycoAdapter: Error verifying signature', {
        error: error.message
      })
      return false
    }
  }
}

module.exports = EPaycoAdapter
