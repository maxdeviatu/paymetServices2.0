const crypto = require('crypto');
const config = require('../../../config');
const logger = require('../../../config/logger');

/**
 * Adaptador para webhooks de Cobre
 * Implementa la interfaz IProviderAdapter
 */
class CobreAdapter {
  constructor() {
    this.secret = config.cobre.webhook.secret;
    this.provider = 'cobre';
  }

  /**
   * Verifica la firma del webhook usando HMAC-SHA256
   * @param {express.Request} req - Request de Express
   * @returns {boolean} - true si la firma es válida
   */
  verifySignature(req) {
    try {
      const timestamp = req.headers['event_timestamp'];
      const signature = req.headers['event_signature'];
      
      if (!timestamp || !signature) {
        logger.warn('Cobre webhook: Missing timestamp or signature headers', {
          timestamp: !!timestamp,
          signature: !!signature,
          headers: Object.keys(req.headers)
        });
        return false;
      }

      // Concatenar timestamp + "." + body (sin espacios ni saltos de línea)
      let bodyString;
      if (Buffer.isBuffer(req.body)) {
        bodyString = req.body.toString('utf8');
      } else if (typeof req.body === 'string') {
        bodyString = req.body;
      } else if (typeof req.body === 'object') {
        bodyString = JSON.stringify(req.body);
      } else {
        logger.error('Cobre webhook: Unexpected body type', {
          bodyType: typeof req.body,
          body: req.body
        });
        return false;
      }
      
      const data = `${timestamp}.${bodyString}`;
      
      // Calcular HMAC-SHA256
      const expectedSignature = crypto
        .createHmac('sha256', this.secret)
        .update(data, 'utf8')
        .digest('hex');

      // Comparación segura contra timing attacks
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(signature, 'hex')
      );

      if (!isValid) {
        logger.warn('Cobre webhook: Invalid signature', {
          expected: expectedSignature,
          received: signature,
          data: data.substring(0, 100) + '...'
        });
      }

      return isValid;
    } catch (error) {
      logger.error('Cobre webhook: Error verifying signature', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Parsea el webhook de Cobre y lo normaliza
   * @param {express.Request} req - Request de Express
   * @returns {WebhookEvent} - Evento normalizado
   */
  parseWebhook(req) {
    try {
      let body;
      let rawBodyString;
      
      if (Buffer.isBuffer(req.body)) {
        rawBodyString = req.body.toString('utf8');
        body = JSON.parse(rawBodyString);
      } else if (typeof req.body === 'string') {
        rawBodyString = req.body;
        body = JSON.parse(req.body);
      } else if (typeof req.body === 'object') {
        body = req.body; // Ya es un objeto parseado
        rawBodyString = JSON.stringify(req.body);
      } else {
        throw new Error(`Unexpected body type: ${typeof req.body}`);
      }
      
      logger.info('Cobre webhook: Parsing event', {
        eventId: body.id,
        eventKey: body.event_key,
        contentType: body.content?.type
      });

      // Determinar tipo de evento y manejar diferentes casos
      const eventKey = body.event_key;
      let eventType = 'payment';
      let externalRef = body.id;
      let status = 'PENDING';

      if (eventKey === 'accounts.balance.credit') {
        eventType = 'balance_credit';
        // Para créditos de balance, intentar usar uniqueTransactionId si está disponible
        const uniqueTransactionId = body.content?.metadata?.uniqueTransactionId;
        if (uniqueTransactionId) {
          externalRef = uniqueTransactionId;
        } else {
          // Si no hay uniqueTransactionId, usar el ID del evento
          externalRef = body.id;
          logger.info('Cobre webhook: Balance credit event without uniqueTransactionId, using event ID', {
            eventId: body.id,
            eventKey: body.event_key
          });
        }
        status = 'PAID'; // Los créditos de balance son siempre pagos exitosos
      } else if (eventKey === 'money_movements.status.completed') {
        eventType = 'payment';
        externalRef = body.id;
        status = 'PAID'; // Completado significa pagado
      } else if (eventKey === 'money_movements.status.failed') {
        eventType = 'payment';
        externalRef = body.id;
        status = 'FAILED';
      } else if (eventKey === 'money_movements.status.pending') {
        eventType = 'payment';
        externalRef = body.id;
        status = 'PENDING';
      } else {
        // Para otros eventos, usar mapeo genérico
        externalRef = body.id || body.checkout_id;
        if (!externalRef) {
          throw new Error('Missing external reference in event');
        }
        status = this.mapStatus(body.status);
      }

      // Extraer monto y moneda
      const amount = body.content?.amount || body.amount;
      const currency = body.content?.currency || body.currency || 'USD';

      if (!amount || amount <= 0) {
        throw new Error('Invalid or missing amount in webhook');
      }

      const webhookEvent = {
        provider: this.provider,
        type: eventType,
        externalRef,
        eventId: body.id,
        status,
        amount: Math.round(amount), // Asegurar que sea entero
        currency: currency.toUpperCase(),
        rawHeaders: req.headers,
        rawBody: rawBodyString, // Asegurar que rawBody sea string
        payload: body
      };

      logger.info('Cobre webhook: Successfully parsed', {
        eventId: webhookEvent.eventId,
        externalRef: webhookEvent.externalRef,
        type: webhookEvent.type,
        status: webhookEvent.status,
        amount: webhookEvent.amount,
        currency: webhookEvent.currency
      });

      return webhookEvent;
    } catch (error) {
      logger.error('Cobre webhook: Error parsing webhook', {
        error: error.message,
        body: (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)).substring(0, 200) + '...',
        stack: error.stack
      });
      throw new Error(`Failed to parse Cobre webhook: ${error.message}`);
    }
  }

  /**
   * Mapea estados de Cobre a estados internos
   * @param {string} cobreStatus - Estado de Cobre
   * @returns {string} - Estado interno
   */
  mapStatus(cobreStatus) {
    const statusMap = {
      'PAID': 'PAID',
      'COMPLETED': 'PAID',
      'SUCCESSFUL': 'PAID',
      'SUCCESS': 'PAID',
      'PENDING': 'PENDING',
      'PROCESSING': 'PENDING',
      'FAILED': 'FAILED',
      'CANCELLED': 'FAILED',
      'CANCELED': 'FAILED',
      'EXPIRED': 'FAILED',
      'REJECTED': 'FAILED'
    };

    const mappedStatus = statusMap[cobreStatus?.toUpperCase()];
    if (!mappedStatus) {
      logger.warn('Cobre webhook: Unknown status mapping', {
        originalStatus: cobreStatus,
        defaultingTo: 'FAILED'
      });
      return 'FAILED';
    }

    return mappedStatus;
  }

  /**
   * Obtiene información adicional del evento para logging
   * @param {Object} payload - Payload del webhook
   * @returns {Object} - Información adicional
   */
  getEventInfo(payload) {
    const isCredit = payload.event_key === 'accounts.balance.credit';
    
    return {
      eventKey: payload.event_key,
      isCredit,
      transactionType: payload.content?.type,
      accountId: payload.content?.account_id,
      previousBalance: payload.content?.previous_balance,
      currentBalance: payload.content?.current_balance,
      creditDebitType: payload.content?.credit_debit_type,
      metadata: payload.content?.metadata
    };
  }
}

module.exports = CobreAdapter; 