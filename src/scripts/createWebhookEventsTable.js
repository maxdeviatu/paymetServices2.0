const { sequelize } = require('../models');
const logger = require('../config/logger');

/**
 * Script para crear la tabla webhook_events
 * Se ejecuta durante el setup inicial de la base de datos
 */
async function createWebhookEventsTable() {
  try {
    logger.info('Creating webhook_events table...');

    const query = `
      CREATE TABLE IF NOT EXISTS webhook_events (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(255),
        provider VARCHAR(50) NOT NULL,
        external_ref VARCHAR(255) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        amount INTEGER NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'USD',
        processed_at TIMESTAMP,
        payload JSONB NOT NULL,
        raw_headers JSONB,
        raw_body TEXT,
        error_message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Índices para optimizar consultas
      CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_external_ref ON webhook_events(external_ref);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON webhook_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON webhook_events(processed_at);

      -- Índice único para event_id y provider (idempotencia)
      CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_event_id_provider 
      ON webhook_events(event_id, provider) 
      WHERE event_id IS NOT NULL;

      -- Índice único para provider y external_ref (idempotencia)
      CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_provider_external_ref 
      ON webhook_events(provider, external_ref);

      -- Índice compuesto para consultas de estadísticas
      CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_status_created 
      ON webhook_events(provider, status, created_at);

      -- Comentarios en la tabla
      COMMENT ON TABLE webhook_events IS 'Tabla para almacenar eventos de webhooks de múltiples proveedores';
      COMMENT ON COLUMN webhook_events.event_id IS 'ID global del proveedor (ev_xxx) - opcional';
      COMMENT ON COLUMN webhook_events.provider IS 'Proveedor de pago: cobre, mock, etc.';
      COMMENT ON COLUMN webhook_events.external_ref IS 'Referencia externa del proveedor (checkout_id, uniqueTransactionId, etc.)';
      COMMENT ON COLUMN webhook_events.event_type IS 'Tipo de evento: payment, balance_credit, refund, etc.';
      COMMENT ON COLUMN webhook_events.status IS 'Estado del evento: PENDING, PAID, FAILED';
      COMMENT ON COLUMN webhook_events.amount IS 'Monto en centavos';
      COMMENT ON COLUMN webhook_events.currency IS 'Moneda del evento';
      COMMENT ON COLUMN webhook_events.processed_at IS 'Fecha de procesamiento';
      COMMENT ON COLUMN webhook_events.payload IS 'Payload completo del webhook';
      COMMENT ON COLUMN webhook_events.raw_headers IS 'Headers originales del webhook';
      COMMENT ON COLUMN webhook_events.raw_body IS 'Body original del webhook (para logs/firma)';
      COMMENT ON COLUMN webhook_events.error_message IS 'Mensaje de error si falló el procesamiento';
    `;

    await sequelize.query(query);

    logger.info('✅ webhook_events table created successfully');

    // Verificar que la tabla se creó correctamente
    const [results] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'webhook_events'
    `);

    if (results.length > 0) {
      logger.info('✅ webhook_events table verification successful');
      
      // Mostrar estructura de la tabla
      const [columns] = await sequelize.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'webhook_events'
        ORDER BY ordinal_position
      `);

      logger.info('📋 Table structure:');
      columns.forEach(col => {
        logger.info(`   ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
      });

    } else {
      throw new Error('Table creation verification failed');
    }

  } catch (error) {
    logger.error('❌ Error creating webhook_events table:', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Función para ejecutar la migración desde la línea de comandos
 */
async function runMigration() {
  try {
    await createWebhookEventsTable();
    console.log('✅ Webhook events table migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Webhook events table migration failed:', error.message);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runMigration();
}

module.exports = { createWebhookEventsTable }; 