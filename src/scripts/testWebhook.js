const crypto = require('crypto')
const axios = require('axios')

/**
 * Script para probar el webhook de Cobre con firma correcta
 */
class WebhookTester {
  constructor () {
    this.webhookSecret = process.env.COBRE_WEBHOOK_SECRET || 'c50f8d56adf7d044f9b5b1f57b0f2e12f134061a267397fe3554baf12b52e74c'
    this.webhookUrl = process.env.COBRE_WEBHOOK_URL || 'http://localhost:3000/api/webhooks/cobre'
    this.uniqueTransactionId = `mm_test_${Date.now()}` // Generar ID único para cada test
  }

  /**
   * Genera la firma HMAC-SHA256 correcta para Cobre
   * @param {string} timestamp - Timestamp del evento
   * @param {string} body - Body JSON del webhook
   * @returns {string} - Firma hexadecimal
   */
  generateSignature (timestamp, body) {
    const data = `${timestamp}.${body}`
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(data, 'utf8')
      .digest('hex')
  }

  /**
   * Crea un payload de webhook de Cobre realista
   * @returns {Object} - Payload del webhook
   */
  createWebhookPayload () {
    const now = new Date().toISOString()

    return {
      id: `ev_test_${Date.now()}`,
      event_key: 'accounts.balance.credit',
      created_at: now,
      content: {
        id: `trx_test_${Date.now()}`,
        type: 'internal_credit',
        amount: 150000, // $1,500.00 COP
        currency: 'COP',
        date: now,
        metadata: {
          uniqueTransactionId: this.uniqueTransactionId,
          sender_account_number: '@testuser',
          description: 'Pago Innovate Learning',
          sender_name: 'Test Payment',
          tracking_key: '',
          sender_id: '1234567890'
        },
        account_id: 'acc_CVUp78dsYf',
        previous_balance: 100000,
        current_balance: 250000,
        credit_debit_type: 'credit'
      }
    }
  }

  /**
   * Envía el webhook de prueba
   * @returns {Promise<void>}
   */
  async sendTestWebhook () {
    try {
      console.log('🧪 Testing webhook with correct signature...\n')

      // Crear payload
      const payload = this.createWebhookPayload()
      const bodyString = JSON.stringify(payload)
      const timestamp = new Date().toISOString()

      // Generar firma
      const signature = this.generateSignature(timestamp, bodyString)

      console.log('📋 Webhook details:')
      console.log(`   URL: ${this.webhookUrl}`)
      console.log(`   Event ID: ${payload.id}`)
      console.log(`   Unique Transaction ID: ${this.uniqueTransactionId}`)
      console.log(`   Amount: ${payload.content.amount} COP`)
      console.log(`   Timestamp: ${timestamp}`)
      console.log(`   Signature: ${signature.substring(0, 20)}...`)
      console.log('')

      // Enviar webhook
      console.log('📤 Sending webhook...')
      const response = await axios.post(this.webhookUrl, bodyString, {
        headers: {
          'Content-Type': 'application/json',
          event_timestamp: timestamp,
          event_signature: signature,
          'User-Agent': 'Cobre-Webhook/1.0'
        }
      })

      console.log('✅ Webhook sent successfully!')
      console.log(`   Status: ${response.status}`)
      console.log('   Response:', response.data)
    } catch (error) {
      console.error('❌ Webhook test failed:')
      if (error.response) {
        console.error(`   Status: ${error.response.status}`)
        console.error('   Response:', error.response.data)
      } else {
        console.error(`   Error: ${error.message}`)
      }
    }
  }

  /**
   * Prueba la validación de firma
   */
  testSignatureValidation () {
    console.log('🔍 Testing signature validation...\n')

    const timestamp = '2025-06-20T18:59:30Z'
    const body = '{"test":"data"}'
    const signature = this.generateSignature(timestamp, body)

    console.log('📋 Signature test:')
    console.log(`   Timestamp: ${timestamp}`)
    console.log(`   Body: ${body}`)
    console.log(`   Data: ${timestamp}.${body}`)
    console.log(`   Secret: ${this.webhookSecret.substring(0, 20)}...`)
    console.log(`   Signature: ${signature}`)
    console.log('')

    // Verificar que la generación es consistente
    const signature2 = this.generateSignature(timestamp, body)
    const isConsistent = signature === signature2

    console.log(`✅ Signature generation is consistent: ${isConsistent}`)
  }
}

/**
 * Función principal
 */
async function main () {
  // Cargar variables de entorno
  require('dotenv').config()

  const tester = new WebhookTester()

  // Verificar argumentos de línea de comandos
  const args = process.argv.slice(2)

  if (args.includes('--signature-test')) {
    tester.testSignatureValidation()
    return
  }

  if (args.includes('--help')) {
    console.log(`
🧪 Webhook Tester for Cobre

Usage:
  node testWebhook.js                # Send test webhook
  node testWebhook.js --signature-test # Test signature validation only
  node testWebhook.js --help          # Show this help

Environment variables:
  COBRE_WEBHOOK_SECRET  # Webhook secret for signature
  COBRE_WEBHOOK_URL     # Webhook URL to test

Examples:
  npm run webhook:test-cobre
  node src/scripts/testWebhook.js --signature-test
    `)
    return
  }

  // Enviar webhook de prueba
  await tester.sendTestWebhook()
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main().catch(console.error)
}

module.exports = WebhookTester
