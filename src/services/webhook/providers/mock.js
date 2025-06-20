const logger = require('../../../config/logger');

/**
 * Adaptador Mock para webhooks de testing
 * Implementa la misma interfaz que CobreAdapter
 */
class MockAdapter {
  constructor() {
    this.provider = 'mock';
  }

  /**
   * Verifica la firma del webhook (mock implementation)
   * @param {express.Request} req - Request de Express
   * @returns {boolean} - true si la firma es válida
   */
  verifySignature(req) {
    try {
      const signature = req.headers['x-mock-signature'];
      
      if (!signature) {
        logger.warn('Mock webhook: Missing signature header');
        return false;
      }

      // Mock validation: solo verificar que existe y tiene longitud
      const isValid = signature && signature.length > 0;
      
      if (!isValid) {
        logger.warn('Mock webhook: Invalid signature', {
          signature: signature
        });
      }

      return isValid;
    } catch (error) {
      logger.error('Mock webhook: Error verifying signature', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Parsea el webhook mock y lo normaliza
   * @param {express.Request} req - Request de Express
   * @returns {WebhookEvent} - Evento normalizado
   */
  parseWebhook(req) {
    try {
      const body = JSON.parse(req.body.toString());
      
      logger.info('Mock webhook: Parsing event', {
        reference: body.reference,
        status: body.status,
        amount: body.amount
      });

      // Extraer datos del webhook mock
      const externalRef = body.reference || body.gatewayRef;
      const status = body.status || 'PAID'; // Default a success para testing
      const amount = body.amount || 10000; // Default amount para testing
      const currency = body.currency || 'USD';
      const eventType = body.eventType || 'payment';

      if (!externalRef) {
        throw new Error('Missing external reference in mock webhook');
      }

      if (!amount || amount <= 0) {
        throw new Error('Invalid or missing amount in mock webhook');
      }

      const webhookEvent = {
        provider: this.provider,
        type: eventType,
        externalRef,
        eventId: body.eventId || `mock_${Date.now()}`,
        status: this.mapStatus(status),
        amount: Math.round(amount),
        currency: currency.toUpperCase(),
        rawHeaders: req.headers,
        rawBody: req.body,
        payload: body
      };

      logger.info('Mock webhook: Successfully parsed', {
        eventId: webhookEvent.eventId,
        externalRef: webhookEvent.externalRef,
        type: webhookEvent.type,
        status: webhookEvent.status,
        amount: webhookEvent.amount,
        currency: webhookEvent.currency
      });

      return webhookEvent;
    } catch (error) {
      logger.error('Mock webhook: Error parsing webhook', {
        error: error.message,
        body: req.body.toString().substring(0, 200) + '...'
      });
      throw new Error(`Failed to parse Mock webhook: ${error.message}`);
    }
  }

  /**
   * Mapea estados mock a estados internos
   * @param {string} mockStatus - Estado del mock
   * @returns {string} - Estado interno
   */
  mapStatus(mockStatus) {
    const statusMap = {
      'PAID': 'PAID',
      'SUCCESS': 'PAID',
      'COMPLETED': 'PAID',
      'PENDING': 'PENDING',
      'PROCESSING': 'PENDING',
      'FAILED': 'FAILED',
      'CANCELLED': 'FAILED',
      'EXPIRED': 'FAILED'
    };

    const mappedStatus = statusMap[mockStatus?.toUpperCase()];
    if (!mappedStatus) {
      logger.warn('Mock webhook: Unknown status mapping', {
        originalStatus: mockStatus,
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
    return {
      eventType: payload.eventType,
      paymentMethod: payload.paymentMethod,
      timestamp: payload.timestamp,
      testMode: true
    };
  }
}

module.exports = MockAdapter; 