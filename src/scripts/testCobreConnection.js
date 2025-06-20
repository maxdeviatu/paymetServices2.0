const auth = require('../services/payment/providers/cobre/auth');
const accountsService = require('../services/payment/providers/cobre/accounts');
const config = require('../config');
const logger = require('../config/logger');

/**
 * Script para probar la conexión con Cobre
 * Verifica autenticación, token y cuenta
 */
class CobreConnectionTest {
  constructor() {
    this.baseURL = config.cobre.baseUrl;
  }

  /**
   * Ejecuta todas las pruebas de conexión
   */
  async runTests() {
    try {
      console.log('🧪 Starting Cobre connection tests...\n');

      // Test 1: Verificar configuración
      await this.testConfiguration();

      // Test 2: Verificar autenticación
      await this.testAuthentication();

      // Test 3: Verificar token
      await this.testTokenValidation();

      // Test 4: Verificar cuenta
      await this.testAccountAccess();

      console.log('\n✅ All Cobre connection tests passed!');
      return true;

    } catch (error) {
      console.error('\n❌ Cobre connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Test 1: Verificar configuración básica
   */
  async testConfiguration() {
    console.log('📋 Test 1: Configuration Check');
    
    const requiredVars = [
      'COBRE_USER_ID',
      'COBRE_SECRET',
      'COBRE_BASE_URL'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    console.log('   ✅ All required environment variables are set');
    console.log(`   📍 Base URL: ${this.baseURL}`);
    console.log(`   🔑 User ID: ${process.env.COBRE_USER_ID.substring(0, 8)}...`);
    console.log(`   🔐 Secret: ${process.env.COBRE_SECRET ? '***configured***' : 'NOT SET'}`);
  }

  /**
   * Test 2: Verificar autenticación
   */
  async testAuthentication() {
    console.log('\n🔐 Test 2: Authentication Test');
    
    try {
      const token = await auth.getAccessToken();
      
      if (!token) {
        throw new Error('No access token received');
      }

      console.log('   ✅ Authentication successful');
      console.log(`   🎫 Token: ${token.substring(0, 20)}...`);
      
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Test 3: Verificar validación de token
   */
  async testTokenValidation() {
    console.log('\n✅ Test 3: Token Validation Test');
    
    try {
      const isValid = auth.isTokenValid();
      
      if (isValid) {
        console.log('   ✅ Token is valid');
      } else {
        console.log('   ⚠️ Token is invalid or expired');
        // Intentar renovar el token
        console.log('   🔄 Attempting to refresh token...');
        await auth.getAccessToken();
        const newIsValid = auth.isTokenValid();
        if (newIsValid) {
          console.log('   ✅ Token refreshed successfully');
        } else {
          throw new Error('Token refresh failed');
        }
      }
      
    } catch (error) {
      throw new Error(`Token validation failed: ${error.message}`);
    }
  }

  /**
   * Test 4: Verificar acceso a cuenta
   */
  async testAccountAccess() {
    console.log('\n🏦 Test 4: Account Access Test');
    
    try {
      // Obtener token
      const token = await auth.getAccessToken();
      accountsService.setAccessToken(token);
      
      // Intentar obtener cuenta
      const account = await accountsService.getCurrentAccount();
      
      if (!account || !account.id) {
        // Intentar inicializar cuenta
        console.log('   🔄 No account found, attempting to initialize...');
        const newAccount = await accountsService.initializeAccount();
        
        if (!newAccount || !newAccount.id) {
          throw new Error('Failed to initialize account');
        }
        
        console.log('   ✅ Account initialized successfully');
        console.log(`   🆔 Account ID: ${newAccount.id}`);
        console.log(`   💰 Balance: ${newAccount.balance || 'N/A'}`);
        console.log(`   💱 Currency: ${newAccount.currency || 'N/A'}`);
      } else {
        console.log('   ✅ Account access successful');
        console.log(`   🆔 Account ID: ${account.id}`);
        console.log(`   💰 Balance: ${account.balance || 'N/A'}`);
        console.log(`   💱 Currency: ${account.currency || 'N/A'}`);
      }
      
    } catch (error) {
      throw new Error(`Account access failed: ${error.message}`);
    }
  }

  /**
   * Test 5: Verificar configuración de webhooks (opcional)
   */
  async testWebhookConfiguration() {
    console.log('\n🔗 Test 5: Webhook Configuration Test');
    
    const webhookVars = [
      'COBRE_WEBHOOK_URL',
      'COBRE_WEBHOOK_SECRET'
    ];

    const missingWebhookVars = webhookVars.filter(varName => !process.env[varName]);
    
    if (missingWebhookVars.length > 0) {
      console.log('   ⚠️ Webhook configuration incomplete');
      console.log(`   ❌ Missing: ${missingWebhookVars.join(', ')}`);
      console.log('   ℹ️ Webhooks will not work without these variables');
      return;
    }

    console.log('   ✅ Webhook configuration is complete');
    console.log(`   🌐 Webhook URL: ${process.env.COBRE_WEBHOOK_URL}`);
    console.log(`   🔐 Webhook Secret: ${process.env.COBRE_WEBHOOK_SECRET ? '***configured***' : 'NOT SET'}`);
    
    // Verificar que la URL sea HTTPS
    if (!process.env.COBRE_WEBHOOK_URL.startsWith('https://')) {
      console.log('   ⚠️ Warning: Webhook URL should use HTTPS');
    } else {
      console.log('   ✅ Webhook URL uses HTTPS');
    }
  }
}

/**
 * Función para ejecutar las pruebas desde la línea de comandos
 */
async function runTests() {
  try {
    const tester = new CobreConnectionTest();
    const success = await tester.runTests();
    
    if (success) {
      // Ejecutar test de webhooks opcional
      await tester.testWebhookConfiguration();
      
      console.log('\n🎉 All tests completed successfully!');
      console.log('🚀 Cobre is ready to use');
      process.exit(0);
    } else {
      console.log('\n💥 Tests failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Test execution failed:', error.message);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runTests();
}

module.exports = CobreConnectionTest; 