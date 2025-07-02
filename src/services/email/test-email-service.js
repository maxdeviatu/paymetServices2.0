// Test file para probar el nuevo sistema de emails
require('dotenv').config(); // Cargar variables de entorno desde .env
const EmailService = require('./index');

async function testEmailService() {
  try {
    console.log('🧪 Testing Email Service with Handlebars and Brevo...\n');

    // Datos de prueba
    const customer = {
      id: 1,
      email: 'mardoqueo951@gmail.com', // Cambiado para prueba
      firstName: 'Juan',
      lastName: 'Pérez'
    };

    const product = {
      name: 'Microsoft Office 365',
      productRef: 'MS-OFFICE-365'
    };

    const license = {
      id: 1,
      licenseKey: 'ABCD-EFGH-IJKL-MNOP',
      instructions: 'Descarga el software desde office.com e ingresa la clave de licencia durante la instalación.'
    };

    const order = {
      id: 12345,
      qty: 1,
      subtotal: 29900, // en centavos
      discountTotal: 2990, // en centavos
      grandTotal: 26910, // en centavos
      createdAt: new Date()
    };

    const transaction = {
      currency: 'COP',
      paymentMethod: 'Tarjeta de crédito'
    };

    const waitlistEntry = {
      id: 1
    };

    // Test 1: License delivery email
    console.log('📧 Testing license delivery email...');
    const licenseResult = await EmailService.sendLicenseEmail({
      customer,
      product,
      license,
      order
    });
    console.log('✅ License email result:', licenseResult);

    // Test 2: Waitlist notification email
    console.log('\n📧 Testing waitlist notification email...');
    const waitlistResult = await EmailService.sendWaitlistNotification({
      customer,
      product,
      order,
      waitlistEntry
    });
    console.log('✅ Waitlist notification result:', waitlistResult);

    console.log('\n🎉 All email tests completed successfully!');

  } catch (error) {
    console.error('❌ Error testing email service:', error);
  }
}

// Solo ejecutar si es llamado directamente
if (require.main === module) {
  testEmailService();
}

module.exports = { testEmailService };
