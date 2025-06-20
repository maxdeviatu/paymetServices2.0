# Sistema de Webhooks - Documentación

## 📋 Descripción General

El sistema de webhooks implementa un "Webhook Hub" multi-proveedor que permite recibir y procesar notificaciones de diferentes proveedores de pago de forma unificada, segura e idempotente.

## 🏗️ Arquitectura

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Proveedor     │    │   Webhook Hub    │    │   Handlers      │
│   (Cobre, etc.) │───▶│   Service        │───▶│   (Transactions)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │   WebhookEvent   │
                       │   (Database)     │
                       └──────────────────┘
```

## 🔧 Componentes Principales

### 1. **WebhookService** (`src/services/webhook/index.js`)
- Orquestador principal del sistema
- Maneja múltiples proveedores
- Implementa idempotencia
- Registra eventos en base de datos

### 2. **Adaptadores de Proveedores** (`src/services/webhook/providers/`)
- **CobreAdapter**: Maneja webhooks de Cobre
- **MockAdapter**: Para testing y desarrollo
- Cada adaptador implementa la interfaz `IProviderAdapter`

### 3. **Handlers** (`src/services/webhook/handlers/`)
- **TransactionHandler**: Procesa eventos de transacciones
- Actualiza estados de órdenes y transacciones
- Maneja reserva de licencias
- Envía emails de confirmación

### 4. **Modelo WebhookEvent** (`src/models/webhookEvent.model.js`)
- Almacena todos los eventos de webhooks
- Implementa idempotencia con índices únicos
- Permite auditoría y debugging

## 🚀 Endpoints Disponibles

### Webhooks Públicos (sin autenticación)
```
POST /webhooks/:provider          # Endpoint principal
GET  /webhooks/:provider/health   # Health check
```

### Webhooks de Desarrollo
```
POST /webhooks/mock-payment/:gatewayRef/complete  # Mock payment (solo dev)
```

### Endpoints Administrativos (requieren autenticación)
```
GET /webhooks/admin/statistics    # Estadísticas de webhooks
GET /webhooks/admin/events        # Lista de eventos con paginación
```

## 🔐 Seguridad

### Verificación de Firmas
- **Cobre**: HMAC-SHA256 con `event_timestamp.body`
- **Mock**: Validación simple de header `x-mock-signature`

### Rate Limiting
- 50 requests/minuto por IP para webhooks
- Configurable en `src/middlewares/rateLimiter.js`

### Headers de Seguridad
- Helmet.js para headers de seguridad
- Sanitización de inputs
- Logging de requests públicos

## 📊 Proveedores Soportados

### Cobre
- **Eventos**: `accounts.balance.credit`
- **Firma**: HMAC-SHA256
- **Referencia**: `uniqueTransactionId` en metadata
- **Configuración**: Variables de entorno Cobre

### Mock (Desarrollo)
- **Eventos**: `payment`
- **Firma**: Header `x-mock-signature`
- **Referencia**: `reference` o `gatewayRef`
- **Uso**: Testing y desarrollo

## 🔄 Flujo de Procesamiento

### 1. Recepción del Webhook
```
Proveedor → POST /webhooks/:provider → WebhookController
```

### 2. Validación y Parseo
```
WebhookController → WebhookService → ProviderAdapter
```

### 3. Verificación de Idempotencia
```
WebhookService → checkIdempotency() → WebhookEvent table
```

### 4. Procesamiento del Evento
```
WebhookService → EventHandler → Business Logic
```

### 5. Actualización de Base de Datos
```
EventHandler → Transaction/Order updates → Email sending
```

## 🗄️ Base de Datos

### Tabla `webhook_events`
```sql
CREATE TABLE webhook_events (
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
```

### Índices de Idempotencia
```sql
-- Índice único para event_id y provider
CREATE UNIQUE INDEX idx_webhook_events_event_id_provider 
ON webhook_events(event_id, provider) 
WHERE event_id IS NOT NULL;

-- Índice único para provider y external_ref
CREATE UNIQUE INDEX idx_webhook_events_provider_external_ref 
ON webhook_events(provider, external_ref);
```

## ⚙️ Configuración

### Variables de Entorno Requeridas
```bash
# Cobre Configuration
COBRE_USER_ID=your_user_id
COBRE_SECRET=your_secret
COBRE_BASE_URL=https://api.cobre.co
COBRE_WEBHOOK_SECRET=your_webhook_secret
COBRE_WEBHOOK_URL=https://your-domain.com/webhooks/cobre

# General Configuration
NODE_ENV=production
PAYMENT_SUCCESS_URL=https://your-domain.com/payment/success
```

### Configuración de Cobre
```javascript
// src/config/index.js
const cobreConfig = {
  baseUrl: process.env.COBRE_BASE_URL,
  userId: process.env.COBRE_USER_ID,
  secret: process.env.COBRE_SECRET,
  webhookSecret: process.env.COBRE_WEBHOOK_SECRET
};
```

## 🛠️ Scripts de Setup

### 1. Crear Tabla de Webhooks
```bash
npm run webhook:setup
```

### 2. Suscribirse a Eventos de Cobre
```bash
npm run cobre:subscribe
```

### 3. Probar Webhook Mock
```bash
npm run webhook:test
```

## 📝 Logging y Monitoreo

### Logs Estructurados
```javascript
logger.info('WebhookService: Processing webhook', {
  provider: 'cobre',
  eventId: 'ev_xxx',
  externalRef: 'mm_xxx',
  processingTime: '150ms'
});
```

### Métricas Disponibles
- Total de webhooks procesados
- Tasa de éxito por proveedor
- Tiempo de procesamiento promedio
- Webhooks fallidos

### Endpoints de Monitoreo
```bash
# Estadísticas generales
GET /webhooks/admin/statistics

# Eventos con filtros
GET /webhooks/admin/events?provider=cobre&status=PROCESSED&page=1&limit=20
```

## 🔧 Agregar un Nuevo Proveedor

### 1. Crear Adaptador
```javascript
// src/services/webhook/providers/nuevoProveedor.js
class NuevoProveedorAdapter {
  verifySignature(req) { /* implementar */ }
  parseWebhook(req) { /* implementar */ }
  mapStatus(status) { /* implementar */ }
}
```

### 2. Registrar en WebhookService
```javascript
// src/services/webhook/index.js
this.providerRegistry = {
  cobre: new CobreAdapter(),
  mock: new MockAdapter(),
  nuevoProveedor: new NuevoProveedorAdapter() // ← Agregar aquí
};
```

### 3. Configurar Variables de Entorno
```bash
NUEVO_PROVEEDOR_WEBHOOK_SECRET=your_secret
NUEVO_PROVEEDOR_WEBHOOK_URL=https://your-domain.com/webhooks/nuevoProveedor
```

## 🧪 Testing

### Tests Unitarios
```bash
npm test src/tests/unit/services/webhook/
```

### Tests de Integración
```bash
# Probar webhook de Cobre
curl -X POST https://your-domain.com/webhooks/cobre \
  -H "Content-Type: application/json" \
  -H "event_timestamp: 2025-02-03T22:20:24Z" \
  -H "event_signature: calculated_signature" \
  -d '{"event_key":"accounts.balance.credit",...}'
```

### Tests de Mock
```bash
# Probar webhook mock
curl -X POST http://localhost:3000/webhooks/mock \
  -H "Content-Type: application/json" \
  -H "x-mock-signature: test-signature" \
  -d '{"reference":"test-ref","status":"PAID","amount":10000}'
```

## 🚨 Troubleshooting

### Problemas Comunes

#### 1. Webhook no se procesa
- Verificar firma del proveedor
- Revisar logs de error
- Verificar configuración de variables de entorno

#### 2. Evento duplicado
- Verificar índices de idempotencia
- Revisar `webhook_events` table
- Comprobar `event_id` y `external_ref`

#### 3. Transacción no encontrada
- Verificar `uniqueTransactionId` en metadata
- Revisar búsqueda en `TransactionHandler`
- Comprobar `gatewayRef` en transacción

### Debugging
```bash
# Ver logs en tiempo real
tail -f logs/app.log | grep webhook

# Consultar eventos recientes
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://your-domain.com/webhooks/admin/events?limit=10"
```

## 📚 Referencias

- [Documentación de Cobre Webhooks](https://docs.cobre.co)
- [Guía de Implementación Webhook Hub](./webhook-implementation-guide.md)
- [API de Webhooks](./api-webhooks.md)

## 🔄 Changelog

### v1.0.0 (2025-01-XX)
- ✅ Implementación inicial del Webhook Hub
- ✅ Soporte para Cobre y Mock providers
- ✅ Sistema de idempotencia
- ✅ Handlers de transacciones
- ✅ Endpoints administrativos
- ✅ Documentación completa 