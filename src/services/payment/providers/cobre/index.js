const auth = require('./auth');
const accountsService = require('./accounts');
const axios = require('axios');
const config = require('../../../../config');
const logger = require('../../../../config/logger');

class CobreProvider {
  /**
   * Sanitize text for Cobre API - remove special characters that cause CHK004 error
   */
  sanitizeForCobre(text) {
    if (!text) return '';
    // Remove special characters, keep only letters, numbers, spaces, and basic punctuation
    return text
      .replace(/[^\w\s\-\.]/g, '') // Remove special chars except word chars, spaces, hyphens, periods
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .trim();
  }

  /**
   * Generate standardized external ID for better traceability
   * Format: {referenciaProducto}-{procesadorPago}-{orderIdInterno}-{fechaHoraLocal}
   * Example: CURSO-BASICO-cobre-6-2025-06-17-1946
   */
  generateExternalId(productRef, orderId) {
    // Get Colombia time (UTC-5)
    const colombiaTime = new Date(Date.now() - (5 * 60 * 60 * 1000));
    const year = colombiaTime.getUTCFullYear();
    const month = String(colombiaTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(colombiaTime.getUTCDate()).padStart(2, '0');
    const hour = String(colombiaTime.getUTCHours()).padStart(2, '0');
    const minute = String(colombiaTime.getUTCMinutes()).padStart(2, '0');
    
    const dateTimeLocal = `${year}-${month}-${day}-${hour}${minute}`;
    
    return `${productRef}-cobre-${orderId}-${dateTimeLocal}`;
  }

  /**
   * Generate unique transaction ID for webhook tracking
   * Format: mm_{randomString}
   */
  generateUniqueTransactionId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'mm_';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  async authenticate() {
    return auth.authenticate();
  }

  getAuthHeaders() {
    return auth.getAuthHeaders();
  }

  /**
   * Check if provider is ready (has valid token)
   */
  isTokenValid() {
    return auth.isTokenValid();
  }

  /**
   * Create payment intent (checkout) for order
   */
  async createIntent({ order, transaction, product }) {
    try {
      logger.info(' Creando checkout en Cobre...');
      
      // Get account data
      let account = accountsService.getCurrentAccount();
      if (!account || !account.id) {
        // If account is not available, try to initialize it
        logger.info(' Cuenta no disponible, intentando inicializar...');
        const token = await auth.getAccessToken();
        accountsService.setAccessToken(token);
        account = await accountsService.initializeAccount();
        
        if (!account || !account.id) {
          throw new Error('No se pudo obtener/inicializar la cuenta de Cobre');
        }
      }

      // Get access token
      const token = await auth.getAccessToken();
      
      // Calculate expiration (24 horas desde ahora)
      const validUntil = new Date(Date.now() + (24 * 60 * 60 * 1000));
      
      // Generate standardized external ID for better traceability
      const productRef = product?.productRef || order.productRef;
      const externalId = this.generateExternalId(productRef, order.id);
      
      // Generate unique transaction ID for webhook tracking
      const uniqueTransactionId = this.generateUniqueTransactionId();
      
      // Prepare checkout data
      const checkoutData = {
        alias: `Order-${order.id}-${Date.now()}`,
        amount: Math.round(order.grandTotal), // Convert to minor units if needed
        external_id: externalId, // Standardized format: {productRef}-cobre-{orderId}-{dateTime}
        destination_id: account.id,
        checkout_rails: ['pse', 'bancolombia', 'nequi'], // All available methods for Colombia
        checkout_header: this.sanitizeForCobre(product?.name || 'Innovate Learning').substring(0, 30), // Max 30 characters, sanitized
        checkout_item: this.sanitizeForCobre(`Licencia ${(product?.name || 'Producto')}`).substring(0, 40), // License description, max 40 chars, sanitized
        description_to_payee: this.sanitizeForCobre('Pago Innovate Learning').substring(0, 40), // Standardized description for better visibility
        valid_until: validUntil.toISOString(),
        money_movement_intent_limit: 1, // Single use link
        redirect_url: process.env.PAYMENT_SUCCESS_URL || 'https://innovatelearning.com.co/payment/success',
        metadata: {
          uniqueTransactionId: uniqueTransactionId,
          orderId: order.id,
          productRef: productRef,
          customerEmail: order.customer?.email
        }
      };

      logger.info(' Datos del checkout:', {
        orderId: order.id,
        amount: checkoutData.amount,
        currency: product?.currency || 'USD',
        destinationId: account.id,
        externalId: checkoutData.external_id,
        uniqueTransactionId: uniqueTransactionId,
        checkoutHeader: checkoutData.checkout_header,
        checkoutItem: checkoutData.checkout_item,
        descriptionToPayee: checkoutData.description_to_payee,
        externalIdLength: checkoutData.external_id.length,
        headerLength: checkoutData.checkout_header.length,
        itemLength: checkoutData.checkout_item.length,
        descriptionLength: checkoutData.description_to_payee.length
      });

      // Create checkout
      const response = await axios.post(`${config.cobre.baseUrl}/v1/checkouts`, checkoutData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const checkout = response.data;
      
      logger.info(' Checkout creado exitosamente:', {
        checkoutId: checkout.id,
        checkoutUrl: checkout.checkout_url,
        amount: checkout.amount,
        validUntil: checkout.valid_until
      });

      return {
        gatewayRef: externalId, // Use our standardized external ID for better traceability
        redirectUrl: checkout.checkout_url,
        meta: {
          checkoutId: checkout.id,
          checkoutUrl: checkout.checkout_url,
          validUntil: checkout.valid_until,
          destinationId: checkout.destination_id,
          externalId: externalId,
          uniqueTransactionId: uniqueTransactionId, // Important for webhook tracking
          orderId: order.id,
          productRef: productRef
        }
      };
      
    } catch (error) {
      logger.error(' Error creando checkout en Cobre:', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        orderId: order.id
      });
      throw error;
    }
  }

  /**
   * Parse webhook from Cobre
   */
  parseWebhook(req) {
    // TODO: Implement webhook parsing for Cobre
    // This will be used when Cobre sends payment status updates
    const body = req.body;
    
    return {
      gatewayRef: body.checkout_id || body.id,
      status: this.mapCobreStatus(body.status),
      paymentMethod: body.payment_method || 'unknown',
      amount: body.amount,
      currency: body.currency || 'USD',
      rawData: body
    };
  }

  /**
   * Map Cobre status to internal status
   */
  mapCobreStatus(cobreStatus) {
    const statusMap = {
      'paid': 'PAID',
      'completed': 'PAID',
      'successful': 'PAID',
      'pending': 'PENDING',
      'processing': 'PENDING',
      'failed': 'FAILED',
      'cancelled': 'FAILED',
      'expired': 'FAILED'
    };
    
    return statusMap[cobreStatus?.toLowerCase()] || 'FAILED';
  }
}

module.exports = new CobreProvider(); 