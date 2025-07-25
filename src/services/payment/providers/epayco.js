const crypto = require('crypto')
const logger = require('../../../config/logger')
const config = require('../../../config')

/**
 * ePayco payment provider
 * Integrates with ePayco checkout system
 */
class EPaycoProvider {
  constructor () {
    this.name = 'epayco'
    this.publicKey = process.env.EPAYCO_PUBLIC_KEY
    this.privateKey = process.env.EPAYCO_PRIVATE_KEY
    this.pKey = process.env.EPAYCO_P_KEY
    this.pCustIdCliente = process.env.EPAYCO_P_CUST_ID_CLIENTE
    this.test = process.env.EPAYCO_TEST === 'true'
    this.responseUrl = process.env.EPAYCO_RESPONSE_URL
    this.confirmationUrl = process.env.EPAYCO_CONFIRMATION_URL
  }

  /**
   * Validate configuration on startup
   */
  validateConfig () {
    const requiredVars = [
      'EPAYCO_PUBLIC_KEY',
      'EPAYCO_PRIVATE_KEY',
      'EPAYCO_P_KEY',
      'EPAYCO_P_CUST_ID_CLIENTE',
      'EPAYCO_RESPONSE_URL',
      'EPAYCO_CONFIRMATION_URL'
    ]

    const missing = requiredVars.filter(varName => !process.env[varName])
    
    if (missing.length > 0) {
      throw new Error(`Missing ePayco configuration: ${missing.join(', ')}`)
    }

    logger.info('✅ ePayco configuration validated')
  }

  /**
   * Generate unique invoice ID for ePayco
   * Format: {productRef}-epayco-{orderId}-{timestamp}
   */
  generateInvoiceId (productRef, orderId) {
    const timestamp = Date.now()
    return `${productRef}-epayco-${orderId}-${timestamp}`
  }

  /**
   * Convert amount from cents to pesos for ePayco
   * Cobre uses cents (100000 = $1,000.00 COP)
   * ePayco uses pesos (1000 = $1,000.00 COP)
   */
  convertCentsToPesos (amountInCents) {
    // Convert cents to pesos by dividing by 100
    const amountInPesos = Math.round(amountInCents / 100)
    
    logger.logBusiness('epayco:amount.conversion', {
      originalCents: amountInCents,
      convertedPesos: amountInPesos,
      formatted: `$${amountInPesos.toLocaleString('es-CO')} COP`
    })
    
    return amountInPesos
  }

  /**
   * Clean and sanitize payment data
   */
  cleanPaymentData ({ order, transaction, product, customer }) {
    // Use customer data if available, otherwise fallback to order.customer or defaults
    const customerData = customer || order.customer || {}
    
    // Debug customer data
    logger.logBusiness('epayco:customer.debug', {
      orderId: order.id,
      hasCustomer: !!customer,
      hasOrderCustomer: !!order.customer,
      customerKeys: customer ? Object.keys(customer) : [],
      customerData: customer,
      orderCustomerKeys: order.customer ? Object.keys(order.customer) : [],
      finalCustomerData: customerData
    })
    
    // Convert amount from cents to pesos for ePayco
    const amountInPesos = this.convertCentsToPesos(order.grandTotal)
    
    // Build customer name
    const fullName = `${customerData.firstName || customerData.first_name || ''} ${customerData.lastName || customerData.last_name || ''}`.trim()
    
    return {
      // Product info
      name: (product?.name || 'Producto Innovate Learning').substring(0, 100),
      description: (product?.description || `Licencia ${product?.name || 'Digital'}`).substring(0, 255),
      
      // Transaction info
      amount: amountInPesos.toString(), // ✅ Now in pesos, not cents
      currency: 'cop', // Always COP for Colombia
      tax_base: '0',
      tax: '0',
      tax_ico: '0',
      country: 'co',
      lang: 'es',
      
      // Billing info - Use real customer data
      name_billing: fullName || 'Cliente',
      email_billing: customerData.email || 'cliente@innovatelearning.com.co',
      type_doc_billing: this.mapDocumentType(customerData.documentType || customerData.document_type),
      number_doc_billing: customerData.documentNumber || customerData.document_number || '',
      mobilephone_billing: customerData.phone?.replace(/\D/g, '').replace(/^\+57/, '') || '', // Remove +57 prefix
      address_billing: 'Colombia', // Default address
      
      // Control flags
      external: 'true', // Use external checkout
      test: this.test,
      
      // URLs
      response: this.responseUrl,
      confirmation: this.confirmationUrl,
      
      // Disable unwanted payment methods (keep only credit cards and PSE)
      methodsDisable: ['PSE', 'SP', 'CASH', 'DP', 'ATH']
    }
  }

  /**
   * Map document types to ePayco format
   */
  mapDocumentType (documentType) {
    const typeMap = {
      'CC': 'cc', // Cédula de ciudadanía
      'CE': 'ce', // Cédula de extranjería
      'NIT': 'nit', // NIT
      'PASSPORT': 'passport',
      'TI': 'ti' // Tarjeta de identidad
    }
    
    return typeMap[documentType] || 'cc'
  }

  /**
   * Create payment intent (returns data for frontend)
   */
  async createIntent ({ order, transaction, product, customer }) {
    try {
      logger.logBusiness('epayco:createIntent', {
        orderId: order.id,
        transactionId: transaction.id,
        amount: order.grandTotal
      })

      // Validate configuration
      this.validateConfig()

      // Generate unique invoice
      const invoice = this.generateInvoiceId(product?.productRef || order.productRef, order.id)

      // Clean and prepare payment data
      const paymentData = this.cleanPaymentData({ order, transaction, product, customer })
      paymentData.invoice = invoice

      logger.info('📱 ePayco: Payment data prepared', {
        orderId: order.id,
        invoice,
        originalAmountCents: order.grandTotal,
        convertedAmountPesos: paymentData.amount,
        amountFormatted: `$${parseInt(paymentData.amount).toLocaleString('es-CO')} COP`,
        currency: paymentData.currency,
        customerEmail: paymentData.email_billing,
        customerDoc: paymentData.number_doc_billing
      })

      // Return data needed by frontend
      return {
        gatewayRef: invoice, // Use invoice as gateway reference
        redirectUrl: null, // ePayco uses modal, no redirect
        meta: {
          provider: 'epayco',
          publicKey: this.publicKey,
          test: this.test,
          epaycoData: paymentData,
          invoice
        }
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'epayco:createIntent',
        orderId: order.id,
        transactionId: transaction.id
      })
      throw error
    }
  }

  /**
   * Parse webhook from ePayco
   */
  parseWebhook (req) {
    try {
      const { body } = req

      logger.info('📥 ePayco: Webhook received', {
        invoice: body.x_id_factura,
        transactionId: body.x_transaction_id,
        amount: body.x_amount,
        status: body.x_cod_transaction_state,
        signature: body.x_signature
      })

      // Validate signature
      if (!this.verifySignature(body)) {
        throw new Error('Invalid ePayco webhook signature')
      }

      // Map ePayco status to internal status
      const status = this.mapTransactionStatus(body.x_cod_transaction_state)

      const webhook = {
        gatewayRef: body.x_id_factura, // Invoice ID
        transactionId: body.x_transaction_id,
        status,
        amount: parseFloat(body.x_amount),
        currency: body.x_currency_code || 'COP',
        paymentMethod: this.mapPaymentMethod(body.x_franchise),
        timestamp: new Date().toISOString(),
        rawData: body,
        epaycoData: {
          refPayco: body.x_ref_payco,
          transactionState: body.x_cod_transaction_state,
          franchise: body.x_franchise,
          bankName: body.x_bank_name,
          responseCode: body.x_response,
          approvalCode: body.x_approval_code,
          transactionDate: body.x_transaction_date
        }
      }

      logger.logBusiness('epayco:webhook.parsed', {
        invoice: webhook.gatewayRef,
        status: webhook.status,
        amount: webhook.amount,
        transactionId: webhook.transactionId
      })

      return webhook
    } catch (error) {
      logger.logError(error, {
        operation: 'epayco:parseWebhook',
        body: req.body
      })
      throw error
    }
  }

  /**
   * Verify ePayco webhook signature
   */
  verifySignature (data) {
    try {
      const stringToSign = [
        this.pCustIdCliente,
        this.pKey,
        data.x_ref_payco,
        data.x_transaction_id,
        data.x_amount,
        data.x_currency_code
      ].join('^')

      const computed = crypto.createHash('sha256').update(stringToSign).digest('hex')
      const isValid = computed === data.x_signature

      logger.debug('🔐 ePayco: Signature verification', {
        computed: computed.substring(0, 10) + '...',
        received: data.x_signature?.substring(0, 10) + '...',
        isValid
      })

      return isValid
    } catch (error) {
      logger.logError(error, {
        operation: 'epayco:verifySignature'
      })
      return false
    }
  }

  /**
   * Map ePayco transaction states to internal status
   */
  mapTransactionStatus (epaycoState) {
    const statusMap = {
      '1': 'PAID',      // Aceptada
      '2': 'FAILED',    // Rechazada
      '3': 'PENDING',   // Pendiente
      '4': 'FAILED',    // Fallida
      '6': 'PENDING',   // Reversada
      '7': 'PENDING',   // Retenida
      '8': 'FAILED',    // Iniciada
      '9': 'FAILED',    // Fallida por validación
      '10': 'FAILED',   // Fallida por datos
      '11': 'FAILED'    // Fallida por fechas
    }

    return statusMap[epaycoState] || 'FAILED'
  }

  /**
   * Map payment methods
   */
  mapPaymentMethod (franchise) {
    const methodMap = {
      'visa': 'Visa',
      'mastercard': 'Mastercard',
      'amex': 'American Express',
      'diners': 'Diners Club',
      'pse': 'PSE',
      'efecty': 'Efecty',
      'baloto': 'Baloto'
    }

    return methodMap[franchise?.toLowerCase()] || franchise || 'unknown'
  }

  /**
   * Get transaction status from ePayco (for verification)
   */
  async getTransactionStatus (gatewayRef) {
    try {
      // For now, return basic info
      // Could implement ePayco API call here if needed
      return {
        gatewayRef,
        status: 'UNKNOWN',
        provider: 'epayco'
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'epayco:getTransactionStatus',
        gatewayRef
      })
      throw error
    }
  }

  /**
   * Refund transaction (placeholder for future implementation)
   */
  async refund ({ transaction, amount, reason }) {
    try {
      logger.logBusiness('epayco:refund.requested', {
        transactionId: transaction.id,
        gatewayRef: transaction.gatewayRef,
        amount,
        reason
      })

      // ePayco refunds typically need to be done through their admin panel
      // This is a placeholder for future API integration
      throw new Error('ePayco refunds must be processed manually through ePayco admin panel')
    } catch (error) {
      logger.logError(error, {
        operation: 'epayco:refund',
        transactionId: transaction.id
      })
      throw error
    }
  }
}

module.exports = EPaycoProvider
