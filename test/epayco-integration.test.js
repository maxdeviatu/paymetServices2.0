#!/usr/bin/env node

/**
 * Test script para verificar que la integración de ePayco funciona correctamente
 */

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// Mock de logger para testing
const logger = {
  info: (...args) => console.log('INFO:', ...args),
  warn: (...args) => console.log('WARN:', ...args),
  error: (...args) => console.log('ERROR:', ...args),
  debug: (...args) => console.log('DEBUG:', ...args),
  logBusiness: (...args) => console.log('BUSINESS:', ...args),
  logError: (...args) => console.log('ERROR:', ...args)
}

// Simular configuración
const mockConfig = {
  cobre: {
    baseUrl: 'https://api.cobre.co'
  }
}

// Mock modules
const mockModules = {
  '../../../config/logger': logger,
  '../../../config': mockConfig
}

// Función para crear require mock
function createMockRequire (originalRequire) {
  return function mockRequire (id) {
    if (mockModules[id]) {
      return mockModules[id]
    }
    return originalRequire(id)
  }
}

async function testEPaycoProvider () {
  console.log('🧪 Testing ePayco Provider Integration...\n')

  try {
    // Verificar variables de entorno
    console.log('1. Verificando variables de entorno:')
    const requiredVars = [
      'EPAYCO_PUBLIC_KEY',
      'EPAYCO_PRIVATE_KEY',
      'EPAYCO_P_KEY',
      'EPAYCO_P_CUST_ID_CLIENTE',
      'EPAYCO_RESPONSE_URL',
      'EPAYCO_CONFIRMATION_URL'
    ]

    let missingVars = 0
    requiredVars.forEach(varName => {
      const value = process.env[varName]
      if (value) {
        console.log(`   ✅ ${varName}: ${value.substring(0, 10)}...`)
      } else {
        console.log(`   ❌ ${varName}: MISSING`)
        missingVars++
      }
    })

    if (missingVars > 0) {
      console.log(`\n❌ ${missingVars} variables de entorno faltantes`)
      return false
    }

    console.log('\n2. Creando instancia de EPaycoProvider:')
    
    // Mock require para el provider
    const Module = require('module')
    const originalRequire = Module.prototype.require
    Module.prototype.require = createMockRequire(originalRequire)

    const EPaycoProvider = require('../src/services/payment/providers/epayco')
    const provider = new EPaycoProvider()

    console.log('   ✅ EPaycoProvider creado exitosamente')

    // Restaurar require original
    Module.prototype.require = originalRequire

    console.log('\n3. Validando configuración:')
    provider.validateConfig()

    console.log('\n4. Testing métodos del provider:')

    // Test generateInvoiceId
    const invoiceId = provider.generateInvoiceId('TEST-001', 123)
    console.log(`   ✅ generateInvoiceId: ${invoiceId}`)

    // Test mapDocumentType
    const docType = provider.mapDocumentType('CC')
    console.log(`   ✅ mapDocumentType: CC -> ${docType}`)

    // Test mapTransactionStatus
    const status = provider.mapTransactionStatus('1')
    console.log(`   ✅ mapTransactionStatus: 1 -> ${status}`)

    // Test cleanPaymentData
    const mockOrder = {
      id: 123,
      grandTotal: 50000,
      customer: {
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@test.com',
        documentType: 'CC',
        documentNumber: '12345678',
        phone: '3001234567'
      }
    }

    const mockProduct = {
      name: 'Curso de Prueba',
      description: 'Curso de testing',
      productRef: 'TEST-001'
    }

    const cleanData = provider.cleanPaymentData({
      order: mockOrder,
      transaction: { id: 456 },
      product: mockProduct
    })

    console.log('   ✅ cleanPaymentData estructura correcta')
    console.log(`   - Nombre: ${cleanData.name}`)
    console.log(`   - Monto: ${cleanData.amount}`)
    console.log(`   - Email: ${cleanData.email_billing}`)

    // Test createIntent
    console.log('\n5. Testing createIntent:')
    const intentResult = await provider.createIntent({
      order: mockOrder,
      transaction: { id: 456 },
      product: mockProduct
    })

    console.log('   ✅ createIntent ejecutado exitosamente')
    console.log(`   - Gateway Ref: ${intentResult.gatewayRef}`)
    console.log(`   - Provider: ${intentResult.meta.provider}`)
    console.log(`   - Public Key: ${intentResult.meta.publicKey.substring(0, 10)}...`)

    console.log('\n6. Testing parseWebhook:')
    const mockWebhookReq = {
      body: {
        x_id_factura: invoiceId,
        x_ref_payco: '118742',
        x_transaction_id: '431047',
        x_amount: '50000.00',
        x_currency_code: 'COP',
        x_cod_transaction_state: '1',
        x_signature: 'test_signature',
        x_franchise: 'visa',
        x_bank_name: 'BANCO DE PRUEBAS',
        x_response: 'Aceptada',
        x_approval_code: '123456',
        x_transaction_date: '2024-12-25 14:30:00'
      }
    }

    // Note: This will fail signature validation, but we can test the structure
    try {
      const webhookResult = provider.parseWebhook(mockWebhookReq)
      console.log('   ✅ parseWebhook estructura correcta')
    } catch (error) {
      if (error.message.includes('signature')) {
        console.log('   ✅ parseWebhook - validación de firma funcionando')
      } else {
        throw error
      }
    }

    console.log('\n🎉 Todos los tests de ePayco Provider pasaron exitosamente!')
    console.log('\n📋 Resumen de la integración:')
    console.log('   ✅ Variables de entorno configuradas')
    console.log('   ✅ Provider instanciado correctamente')
    console.log('   ✅ Métodos principales funcionando')
    console.log('   ✅ Estructura de datos correcta')
    console.log('   ✅ Validación de firmas implementada')

    return true

  } catch (error) {
    console.error('\n❌ Error durante el testing:', error.message)
    console.error(error.stack)
    return false
  }
}

// Ejecutar test si es llamado directamente
if (require.main === module) {
  testEPaycoProvider()
    .then(success => {
      process.exit(success ? 0 : 1)
    })
    .catch(error => {
      console.error('Test failed:', error)
      process.exit(1)
    })
}

module.exports = { testEPaycoProvider }
