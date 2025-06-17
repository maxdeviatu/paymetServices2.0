const cobreProvider = require('./services/payment/providers/cobre');

async function startServer() {
  try {
    // Autenticar Cobre al arrancar
    await cobreProvider.authenticate();
    console.log('Cobre authentication successful on startup');

    // ... resto del código de inicio del servidor
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer(); 