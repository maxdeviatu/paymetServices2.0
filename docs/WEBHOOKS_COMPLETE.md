# Sistema de Webhooks - Documentación Completa

> **⚠️ FUENTE DE VERDAD ÚNICA - VALIDADO CONTRA CÓDIGO FUENTE**  
> Este documento es la **única fuente de verdad confiable** para el sistema de webhooks. Ha sido validado línea por línea contra el código fuente actual y refleja exactamente la implementación real del sistema.  
> **Para desarrolladores externos**: Este documento es la referencia autorizada. Cualquier otra documentación sobre webhooks puede estar desactualizada.

**Última actualización**: Basado en análisis exhaustivo del código fuente (2025-01-XX)  
**Archivos validados**: `src/services/webhook/`, `src/controllers/webhook.controller.js`, `src/routes/webhook.routes.js`, `src/models/webhookEvent.model.js`  
**Estado de validación**: ✅ Completamente validado contra código fuente

---

## 📋 Tabla de Contenidos

1. [Descripción General](#descripción-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Endpoints y Rutas](#endpoints-y-rutas)
4. [Proveedores Soportados](#proveedores-soportados)
5. [Seguridad](#seguridad)
6. [Sistema de Idempotencia](#sistema-de-idempotencia)
7. [Procesamiento de Eventos](#procesamiento-de-eventos)
8. [Base de Datos](#base-de-datos)
9. [Configuración](#configuración)
10. [Testing y Desarrollo](#testing-y-desarrollo)
11. [Monitoreo y Logging](#monitoreo-y-logging)
12. [Troubleshooting](#troubleshooting)
13. [Extensión del Sistema](#extensión-del-sistema)

---

## 🎯 Descripción General

El sistema de webhooks implementa un **Webhook Hub multi-proveedor** que permite recibir y procesar notificaciones de diferentes proveedores de pago de forma unificada, segura e idempotente.

### Características Principales

- ✅ **Procesamiento en tiempo real** de notificaciones de pago
- ✅ **Idempotencia robusta** para evitar duplicados
- ✅ **Manejo inteligente** de cambios de estado
- ✅ **Compatibilidad multi-proveedor** (Cobre, ePayco, Mock)
- ✅ **Soporte para eventos múltiples** en un solo webhook
- ✅ **Logging detallado** para debugging y auditoría
- ✅ **Rate limiting** configurable
- ✅ **Verificación de firmas** por proveedor

### Arquitectura de Alto Nivel

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Proveedor     │    │  WebhookController│    │  WebhookService │
│ (Cobre/ePayco)  │───▶│                  │───▶│                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                        │
                              ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │  ProviderAdapter │    │  EventHandler   │
                       │  (Signature Verif)│    │  (Transaction)  │
                       └──────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │  WebhookEvent   │
                                              │   (Database)    │
                                              └─────────────────┘
```

---

## 🏗️ Arquitectura del Sistema

### Componentes Principales

#### 1. **WebhookService** (`src/services/webhook/index.js`)
Orquestador principal del sistema que:
- Maneja múltiples proveedores mediante adaptadores
- Implementa idempotencia basada en `provider + externalRef`
- Procesa eventos múltiples en un solo webhook
- Registra eventos en base de datos
- Gestiona handlers por tipo de evento

**Métodos principales**:
- `process(providerName, req)` - Procesa un webhook completo
- `checkIdempotency(webhookEvent)` - Verifica si el evento ya fue procesado
- `registerWebhookEvent(webhookEvent)` - Registra nuevo evento
- `updateWebhookEvent(eventId, updateData)` - Actualiza evento existente
- `getStatistics(filters)` - Obtiene estadísticas
- `getWebhookEvents(options)` - Lista eventos con paginación

#### 2. **WebhookController** (`src/controllers/webhook.controller.js`)
Controlador HTTP que:
- Recibe webhooks de todos los proveedores
- Valida parámetros básicos
- Delega procesamiento al servicio
- Responde siempre con 200 (excepto errores de validación)

**Métodos principales**:
- `handleWebhook(req, res)` - Endpoint principal
- `healthCheck(req, res)` - Health check
- `mockPaymentComplete(req, res)` - Mock para desarrollo
- `getStatistics(req, res)` - Estadísticas (admin)
- `getWebhookEvents(req, res)` - Lista eventos (admin)

#### 3. **Provider Adapters** (`src/services/webhook/providers/`)
Adaptadores específicos por proveedor que implementan:
- `verifySignature(req)` - Verificación de firma
- `parseWebhook(req)` - Parseo y normalización
- `mapStatus(status)` - Mapeo de estados

**Adaptadores disponibles**:
- `CobreAdapter` - Para webhooks de Cobre
- `EPaycoAdapter` - Para webhooks de ePayco
- `MockAdapter` - Para testing y desarrollo

#### 4. **TransactionHandler** (`src/services/webhook/handlers/transactionHandler.js`)
Handler que procesa eventos de transacciones:
- Busca transacciones por referencia externa
- Actualiza estados de transacciones y órdenes
- Reserva licencias para productos digitales
- Envía emails de confirmación
- Maneja lista de espera cuando no hay licencias

#### 5. **WebhookEvent Model** (`src/models/webhookEvent.model.js`)
Modelo Sequelize que almacena:
- Todos los eventos de webhooks procesados
- Payload completo para auditoría
- Headers y body raw para debugging
- Estado de procesamiento

---

## 🚀 Endpoints y Rutas

### Rutas Base

El sistema monta las rutas en dos paths (ambos apuntan a las mismas rutas):
- `/api/webhooks` - Ruta principal de API
- `/webhooks` - Ruta alternativa para proveedores que requieren URLs específicas

**Archivo**: `src/routes/webhook.routes.js`  
**Montaje**: `src/app.js` (líneas 39 y 42)

### Endpoints Públicos (Sin Autenticación)

#### POST `/webhooks/:provider` o `/api/webhooks/:provider`
Endpoint principal para recibir webhooks.

**Parámetros**:
- `provider` (path) - Nombre del proveedor: `cobre`, `epayco`, `mock`

**Middlewares aplicados**:
1. `securityHeaders` - Headers de seguridad
2. `logPublicRequest` - Logging de requests públicos
3. `webhookLimiter` - Rate limiting (1000 req/min por IP)
4. `captureRawBody` - Captura raw body para verificación de firma
5. `webhookMiddleware` - Validación básica

**Respuesta exitosa** (200):
```json
{
  "success": true,
  "data": {
    "status": "processed",
    "summary": {
      "totalEvents": 1,
      "processedEvents": 1,
      "failedEvents": 0,
      "duplicateEvents": 0,
      "processingTime": "42ms"
    },
    "results": [...],
    "processingTime": 42
  },
  "message": "Webhook processed successfully: 1 events processed, 0 failed, 0 duplicates"
}
```

**Respuesta de error** (400):
```json
{
  "success": false,
  "message": "Invalid signature for provider: cobre",
  "error": "..." // Solo en desarrollo
}
```

#### GET `/webhooks/:provider/health` o `/api/webhooks/:provider/health`
Health check para endpoints de webhook.

**Respuesta** (200):
```json
{
  "success": true,
  "message": "Webhook endpoint is healthy",
  "timestamp": "2025-01-XXT...",
  "provider": "cobre",
  "environment": "production"
}
```

### Endpoints de Desarrollo

#### POST `/webhooks/mock-payment/:gatewayRef/complete` o `/api/webhooks/mock-payment/:gatewayRef/complete`
Endpoint para simular completación de pago (solo en `NODE_ENV=development`).

**Parámetros**:
- `gatewayRef` (path) - Referencia de la transacción

**Body** (opcional):
```json
{
  "status": "PAID",
  "amount": 10000,
  "currency": "USD"
}
```

### Endpoints Administrativos (Requieren Autenticación)

#### GET `/webhooks/admin/statistics` o `/api/webhooks/admin/statistics`
Obtiene estadísticas de webhooks.

**Autenticación**: Requerida (JWT Bearer token)  
**Rol mínimo**: `READ_ONLY`

**Query parameters**:
- `provider` (opcional) - Filtrar por proveedor
- `status` (opcional) - Filtrar por estado
- `startDate` (opcional) - Fecha inicio (ISO 8601)
- `endDate` (opcional) - Fecha fin (ISO 8601)

**Respuesta** (200):
```json
{
  "success": true,
  "data": {
    "total": 1500,
    "processed": 1450,
    "failed": 30,
    "pending": 20,
    "successRate": 96.67
  }
}
```

#### GET `/webhooks/admin/events` o `/api/webhooks/admin/events`
Lista eventos de webhooks con paginación.

**Autenticación**: Requerida (JWT Bearer token)  
**Rol mínimo**: `READ_ONLY`

**Query parameters**:
- `page` (opcional, default: 1) - Número de página
- `limit` (opcional, default: 20) - Elementos por página
- `provider` (opcional) - Filtrar por proveedor
- `status` (opcional) - Filtrar por estado
- `eventType` (opcional) - Filtrar por tipo de evento
- `startDate` (opcional) - Fecha inicio (ISO 8601)
- `endDate` (opcional) - Fecha fin (ISO 8601)

**Respuesta** (200):
```json
{
  "success": true,
  "data": {
    "events": [...],
    "pagination": {
      "total": 1500,
      "page": 1,
      "limit": 20,
      "pages": 75
    }
  }
}
```

---

## 🔌 Proveedores Soportados

### 1. Cobre

**País**: Colombia  
**Moneda**: COP (Pesos Colombianos)  
**Métodos de Pago**: Bancolombia, Nequi, PSE

#### Eventos Soportados

El adaptador de Cobre soporta los siguientes tipos de eventos:

| Event Key | Tipo Normalizado | Estado | Descripción |
|-----------|------------------|--------|-------------|
| `accounts.balance.credit` | `balance_credit` | `PAID` | Crédito a cuenta (notificación interna) |
| `money_movements.status.completed` | `payment` | `PAID` | Movimiento completado exitosamente |
| `money_movements.status.failed` | `payment` | `FAILED` | Movimiento fallido |
| `money_movements.status.rejected` | `payment` | `FAILED` | Movimiento rechazado |
| `money_movements.status.canceled` | `payment` | `FAILED` | Movimiento cancelado |
| `money_movements.status.pending` | `payment` | `PENDING` | Movimiento pendiente |

**Archivo**: `src/services/webhook/providers/cobre.js`

#### Verificación de Firma

**Algoritmo**: HMAC-SHA256  
**Formato**: `timestamp.body`

```javascript
// Cálculo de firma esperada
const data = `${timestamp}.${bodyString}`
const expectedSignature = crypto
  .createHmac('sha256', COBRE_WEBHOOK_SECRET)
  .update(data, 'utf8')
  .digest('hex')
```

**Headers requeridos**:
- `event-timestamp` - Timestamp del evento (ISO 8601)
- `event-signature` - Firma HMAC-SHA256

**Validación**: Usa `crypto.timingSafeEqual()` para comparación segura.

#### Formato del Webhook

**Content-Type**: `application/json`

**Estructura del body**:
```json
{
  "id": "ev_xxx",
  "event_key": "accounts.balance.credit",
  "content": {
    "type": "money_movement",
    "external_id": "checkout_xxx",
    "unique_transaction_id": "unique_xxx",
    "amount": 1000000,
    "currency": "COP",
    "metadata": {
      "uniqueTransactionId": "unique_xxx"
    }
  }
}
```

**Soporte para eventos múltiples**: El adaptador detecta arrays en:
- Body directo (array)
- `body.events` (array)
- `body.data` (array)
- `body.webhooks` (array)
- Body único (default)

#### Referencia Externa (externalRef)

El adaptador determina `externalRef` con la siguiente prioridad:

1. **`body.content.external_id`** - ID externo del money movement (coincide con `gatewayRef`)
2. **`body.content.unique_transaction_id`** - ID único de transacción (fallback)
3. **`body.external_id` o `body.content.metadata.external_id`** - Ubicaciones alternativas
4. **`body.id`** - ID del evento (último recurso)

**Nota**: Los eventos `balance_credit` son notificaciones internas de Cobre y no requieren procesamiento de transacciones.

#### Configuración

**Variables de entorno requeridas**:
```bash
COBRE_WEBHOOK_SECRET=your_webhook_secret  # Secreto para verificación de firma
COBRE_WEBHOOK_URL=https://your-domain.com/webhooks/cobre  # URL del webhook
```

**Archivo de configuración**: `src/config/index.js` (líneas 34-36)

### 2. ePayco

**País**: Colombia  
**Moneda**: COP (Pesos Colombianos)  
**Métodos de Pago**: Tarjetas, PSE, Bancolombia, Nequi

#### Eventos Soportados

ePayco envía un solo evento por webhook:

| Campo | Descripción |
|-------|-------------|
| Tipo normalizado | `payment` |
| Estados posibles | `PAID`, `PENDING`, `FAILED` |

**Característica importante**: ePayco puede enviar **múltiples webhooks** para la misma transacción con diferentes `x_transaction_id` pero el mismo `x_id_factura`.

**Archivo**: `src/services/webhook/providers/epayco.js`

#### Verificación de Firma

**Algoritmo**: SHA256  
**Formato**: String concatenado con `^`

```javascript
// Cálculo de firma esperada
const stringToSign = [
  EPAYCO_P_CUST_ID_CLIENTE,
  EPAYCO_P_KEY,
  body.x_ref_payco,
  body.x_transaction_id,
  body.x_amount,
  body.x_currency_code
].join('^')

const computed = crypto.createHash('sha256')
  .update(stringToSign)
  .digest('hex')
```

**Validación**: Comparación directa `computed === body.x_signature`

#### Formato del Webhook

**Content-Type**: `application/x-www-form-urlencoded` ⚠️

**Nota crítica**: ePayco envía datos en formato form-urlencoded, no JSON. El middleware `captureRawBody` en `src/routes/webhook.routes.js` (líneas 40-61) parsea este formato específicamente.

**Estructura del body** (parseado):
```javascript
{
  "x_id_factura": "9789702651161-epayco-1183-1755286691440",  // externalRef
  "x_transaction_id": "3018020471755280488",  // eventId (cambia en cada webhook)
  "x_ref_payco": "ref_xxx",
  "x_amount": "82000.00",  // En pesos, se convierte a centavos
  "x_currency_code": "COP",
  "x_cod_transaction_state": "1",  // Estado numérico
  "x_signature": "hash_xxx",
  "x_transaction_date": "2025-01-XX..."
}
```

**Mapeo de estados**:
- `1` → `PAID` (Aceptada)
- `2` → `FAILED` (Rechazada)
- `3` → `PENDING` (Pendiente)
- `4` → `FAILED` (Fallida)
- `6` → `PENDING` (Reversada)
- `7` → `PENDING` (Retenida)
- `8` → `FAILED` (Iniciada)
- `9` → `FAILED` (Fallida por validación)
- `10` → `FAILED` (Fallida por datos)
- `11` → `FAILED` (Fallida por fechas)

**Conversión de monto**: ePayco envía el monto en pesos. El adaptador lo convierte a centavos multiplicando por 100.

#### Referencia Externa

- **`externalRef`**: `x_id_factura` (constante para la misma transacción)
- **`eventId`**: `x_transaction_id` (diferente en cada webhook)

**Comportamiento de idempotencia**: Debido a que ePayco envía múltiples webhooks con diferentes `eventId` pero el mismo `externalRef`, la idempotencia se basa en `provider + externalRef`, no en `eventId`.

#### Configuración

**Variables de entorno requeridas**:
```bash
EPAYCO_P_CUST_ID_CLIENTE=your_cust_id
EPAYCO_P_KEY=your_key
```

**Archivo**: `src/services/webhook/providers/epayco.js` (líneas 12-14)

### 3. Mock (Desarrollo)

**Uso**: Testing y desarrollo local

#### Eventos Soportados

| Tipo | Descripción |
|------|-------------|
| `payment` | Evento de pago simulado |

**Archivo**: `src/services/webhook/providers/mock.js`

#### Verificación de Firma

**Validación simple**: Verifica que exista el header `x-mock-signature` y tenga contenido.

```javascript
const signature = req.headers['x-mock-signature']
return signature && signature.length > 0
```

#### Formato del Webhook

**Content-Type**: `application/json`

**Estructura del body**:
```json
{
  "reference": "test-ref-123",
  "gatewayRef": "test-ref-123",
  "status": "PAID",
  "amount": 10000,
  "currency": "USD",
  "eventId": "mock_1234567890",
  "eventType": "payment"
}
```

**Soporte para eventos múltiples**: Similar a Cobre, detecta arrays en:
- Body directo (array)
- `body.events` (array)
- `body.data` (array)
- `body.webhooks` (array)
- Body único (default)

#### Referencia Externa

- **`externalRef`**: `reference` o `gatewayRef` (prioridad en ese orden)

---

## 🔐 Seguridad

### Verificación de Firmas

Cada proveedor implementa su propio método de verificación de firma:

#### Cobre
- **Algoritmo**: HMAC-SHA256
- **Formato**: `timestamp.body`
- **Headers**: `event-timestamp`, `event-signature`
- **Implementación**: `src/services/webhook/providers/cobre.js` (líneas 33-122)

#### ePayco
- **Algoritmo**: SHA256
- **Formato**: String concatenado con `^`
- **Campo**: `x_signature` en el body
- **Implementación**: `src/services/webhook/providers/epayco.js` (líneas 117-165)

#### Mock
- **Validación**: Header `x-mock-signature` debe existir
- **Implementación**: `src/services/webhook/providers/mock.js` (líneas 17-42)

### Rate Limiting

**Configuración**: `src/middlewares/rateLimiter.js` (líneas 156-192)

- **Límite**: 1000 requests por minuto por IP (configurable via `WEBHOOK_RATE_LIMIT_MAX`)
- **Ventana**: 1 minuto
- **Excepciones**: IPs de proveedores conocidos (configurable via `PAYMENT_PROVIDER_IPS`)
- **IP por defecto exenta**: `54.173.144.191` (Cobre)

**Respuesta cuando se excede** (429):
```json
{
  "success": false,
  "message": "Webhook rate limit exceeded",
  "code": "WEBHOOK_RATE_LIMIT_EXCEEDED",
  "limit": 1000,
  "remaining": 0
}
```

### Headers de Seguridad

**Middleware**: `src/middlewares/security.js` (función `securityHeaders`)

Headers aplicados:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Access-Control-Allow-Origin` (configurable via `CORS_ORIGIN`)
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

### Raw Body Capture

**Middleware crítico**: `src/routes/webhook.routes.js` (función `captureRawBody`, líneas 16-73)

**Propósito**: Preservar el body raw (como Buffer) para verificación de firmas, ya que los proveedores requieren el body exacto sin parsing.

**Características**:
- Límite de tamaño: 10MB
- Preserva `req.rawBody` como Buffer
- Parseo especial para ePayco (form-urlencoded)
- Otros proveedores mantienen el body como Buffer

**Importante**: Este middleware debe ejecutarse ANTES de cualquier parsing de body de Express.

### Sanitización de Inputs

**Implementación**: `src/services/webhook/index.js` (método `sanitizeWebhookEvent`, líneas 364-381)

Sanitización aplicada:
- **Strings**: Trim y límite de 1000 caracteres
- **Números**: Validación y redondeo
- **Objetos**: JSON stringify/parse (elimina funciones y referencias circulares)
- **Raw body**: Límite de 10000 caracteres

### Logging de Requests Públicos

**Middleware**: `src/middlewares/security.js` (función `logPublicRequest`)

Registra:
- Método HTTP
- URL
- IP del cliente
- User-Agent
- Content-Length
- Tiempo de respuesta

---

## 🚫 Sistema de Idempotencia

### Implementación

**Archivo**: `src/services/webhook/index.js` (método `checkIdempotency`, líneas 296-328)

### Estrategia de Idempotencia

La idempotencia se basa en **`provider + externalRef`**, NO en `eventId`.

**Razón**: ePayco envía múltiples webhooks con diferentes `eventId` pero el mismo `externalRef` para la misma transacción.

### Flujo de Verificación

```javascript
// 1. Buscar evento existente
const existingEvent = await WebhookEvent.findOne({
  where: {
    provider: webhookEvent.provider,
    externalRef: webhookEvent.externalRef
  },
  order: [['createdAt', 'DESC']]
})

// 2. Si existe, verificar estado
if (existingEvent) {
  if (existingEvent.status !== webhookEvent.status) {
    // Estado diferente → Procesar y actualizar
    // Actualiza el evento existente y ejecuta handler
  } else {
    // Estado igual → Marcar como duplicado y saltar
    // No ejecuta handler, solo registra en results
  }
} else {
  // Evento nuevo → Registrar y procesar normalmente
}
```

### Casos de Uso

#### Caso 1: Evento Nuevo
```
Webhook 1: provider="cobre", externalRef="checkout_123", status="PAID"
→ ✅ No existe → Registrar y procesar
```

#### Caso 2: Duplicado con Mismo Estado
```
Webhook 1: provider="epayco", externalRef="invoice_456", status="PAID" → ✅ Procesado
Webhook 2: provider="epayco", externalRef="invoice_456", status="PAID" → ⏭️ Duplicado (salta)
```

#### Caso 3: Duplicado con Cambio de Estado
```
Webhook 1: provider="epayco", externalRef="invoice_456", status="PENDING" → ✅ Procesado
Webhook 2: provider="epayco", externalRef="invoice_456", status="PAID" → ✅ Procesado (actualiza)
```

### Índices de Base de Datos

**Archivo**: `src/models/webhookEvent.model.js` (líneas 82-101)

```javascript
// Índice único para eventId + provider (cuando eventId no es null)
{
  unique: true,
  fields: ['event_id', 'provider'],
  where: { event_id: { [Op.ne]: null } }
}

// Índice único para provider + externalRef (PRINCIPAL para idempotencia)
{
  unique: true,
  fields: ['provider', 'external_ref']
}
```

**Nota**: El segundo índice es el que garantiza la idempotencia basada en `provider + externalRef`.

---

## 🔄 Procesamiento de Eventos

### Flujo Completo

```
1. Recepción del Webhook
   ↓
2. Verificación de Firma (ProviderAdapter)
   ↓
3. Parseo y Normalización (ProviderAdapter)
   ↓
4. Para cada evento en el webhook:
   ↓
   4.1. Verificación de Idempotencia (WebhookService)
   ↓
   4.2. Si es nuevo o estado diferente:
       ↓
       4.2.1. Registrar en WebhookEvent
       ↓
       4.2.2. Obtener Handler por tipo de evento
       ↓
       4.2.3. Ejecutar Handler.handle(webhookEvent)
       ↓
       4.2.4. Actualizar WebhookEvent con resultado
   ↓
5. Generar resumen y responder
```

### Handlers Disponibles

**Registro**: `src/services/webhook/index.js` (líneas 26-30)

```javascript
this.eventHandlers = {
  payment: transactionHandler,
  balance_credit: transactionHandler
  // Futuros handlers: refund, subscription, etc.
}
```

### TransactionHandler

**Archivo**: `src/services/webhook/handlers/transactionHandler.js`

#### Método Principal: `handle(webhookEvent)`

**Flujo**:
1. Buscar transacción por `externalRef` (método `findTransaction`)
2. Si no se encuentra:
   - Si es `balance_credit` → Retornar success (ignorar, es notificación interna)
   - Otros tipos → Retornar error `transaction_not_found`
3. Verificar si ya fue procesado (método `isAlreadyProcessed`)
4. Actualizar transacción con nuevo estado
5. Si estado es `PAID` y antes no lo era:
   - Actualizar orden a `IN_PROCESS`
   - Reservar licencia (si aplica)
   - Enviar email de licencia
   - Completar orden a `COMPLETED` (solo si email exitoso)
6. Si estado es `FAILED`:
   - Cancelar orden (si no hay otras transacciones pendientes)

#### Búsqueda de Transacciones

**Método**: `findTransaction(webhookEvent, transaction)`

**Estrategias por proveedor**:

##### Cobre
1. Buscar por `gatewayRef = externalRef` (directo)
2. Si es evento fallido, buscar por correlación de monto (último recurso, solo si hay 1 coincidencia exacta)

**Nota**: Los eventos `balance_credit` se ignoran (no buscan transacción).

##### ePayco / Otros
- Buscar por `gateway = provider` y `gatewayRef = externalRef`

#### Reserva de Licencias

**Método**: `reserveLicenseForOrder(order, dbTransaction)`

**Flujo**:
1. Buscar licencia disponible con lock pesimista (`SELECT FOR UPDATE`)
2. Si hay licencia:
   - Actualizar a `SOLD`
   - Asociar a orden
   - Retornar licencia
3. Si no hay licencia:
   - Crear entrada en `WaitlistEntry`
   - Retornar `waitlisted: true`

#### Envío de Emails

**Métodos**:
- `sendLicenseEmail(order, transaction, license, dbTransaction)` - Email con licencia
- `sendWaitlistNotification(order, transaction, waitlistEntry)` - Notificación de lista de espera
- `sendOrderConfirmation(order, transaction)` - Confirmación de orden (asíncrono)

**Nota**: El email de licencia debe enviarse exitosamente antes de completar la orden. Si falla, la orden se mantiene en `IN_PROCESS` para reintento posterior.

### Manejo de Errores

**Estrategia**: El sistema siempre responde con 200 al proveedor (excepto errores de validación) para evitar reintentos.

**Errores registrados**:
- Firma inválida → Error 400
- Proveedor no soportado → Error 400
- Evento no procesado → Se registra en `failedEvents` pero se responde 200
- Error en handler → Se registra en `failedEvents` y se loguea

---

## 🗄️ Base de Datos

### Modelo WebhookEvent

**Archivo**: `src/models/webhookEvent.model.js`

### Esquema de la Tabla

```sql
CREATE TABLE webhook_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255),  -- ID global del proveedor (ev_xxx) - opcional
  provider VARCHAR(50) NOT NULL,  -- Proveedor: cobre, epayco, mock
  external_ref VARCHAR(255) NOT NULL,  -- Referencia externa (checkout_id, invoice_id, etc.)
  event_type VARCHAR(50) NOT NULL,  -- Tipo: payment, balance_credit, refund, etc.
  status VARCHAR(20) NOT NULL,  -- Estado: PENDING, PAID, FAILED, PROCESSED
  amount INTEGER NOT NULL,  -- Monto en centavos
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  processed_at TIMESTAMP,  -- Fecha de procesamiento
  payload JSONB NOT NULL,  -- Payload completo del webhook
  raw_headers JSONB,  -- Headers originales
  raw_body TEXT,  -- Body original (para logs/firma)
  error_message TEXT,  -- Mensaje de error si falló
  event_index INTEGER,  -- Índice del evento en webhooks múltiples (0-based)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Índices

```sql
-- Índice único para eventId + provider (cuando eventId no es null)
CREATE UNIQUE INDEX idx_webhook_events_event_id_provider 
ON webhook_events(event_id, provider) 
WHERE event_id IS NOT NULL;

-- Índice único para provider + externalRef (PRINCIPAL para idempotencia)
CREATE UNIQUE INDEX idx_webhook_events_provider_external_ref 
ON webhook_events(provider, external_ref);

-- Índice para búsquedas por provider y fecha de procesamiento
CREATE INDEX idx_webhook_events_provider_processed_at 
ON webhook_events(provider, processed_at);

-- Índice para eventos múltiples
CREATE INDEX idx_webhook_events_event_index 
ON webhook_events(event_index);
```

### Campos Importantes

- **`eventId`**: ID único del evento del proveedor. Puede ser `null` para algunos eventos.
- **`externalRef`**: Referencia externa que identifica la transacción. Usado para idempotencia.
- **`status`**: Estado del evento. Valores: `PENDING`, `PAID`, `FAILED`, `PROCESSED`.
- **`processedAt`**: Timestamp cuando el handler completó el procesamiento.
- **`payload`**: Payload completo del webhook (JSONB para consultas eficientes).
- **`rawBody`**: Body original como string (útil para debugging y re-verificación de firmas).

### Script de Creación

**Archivo**: `src/scripts/createWebhookEventsTable.js`

**Comando**: `npm run webhook:setup`

---

## ⚙️ Configuración

### Variables de Entorno Requeridas

#### Cobre
```bash
COBRE_WEBHOOK_SECRET=your_webhook_secret  # Secreto para verificación HMAC-SHA256
COBRE_WEBHOOK_URL=https://your-domain.com/webhooks/cobre  # URL del webhook
COBRE_BASE_URL=https://api.cobre.co  # URL base de la API
COBRE_USER_ID=your_user_id
COBRE_SECRET=your_secret
COBRE_BALANCE_ID=your_balance_id
```

#### ePayco
```bash
EPAYCO_P_CUST_ID_CLIENTE=your_cust_id  # Para verificación de firma
EPAYCO_P_KEY=your_key  # Para verificación de firma
EPAYCO_PUBLIC_KEY=your_public_key  # Para creación de transacciones
```

#### General
```bash
NODE_ENV=production  # development | production
WEBHOOK_RATE_LIMIT_MAX=1000  # Límite de webhooks por minuto (opcional)
PAYMENT_PROVIDER_IPS=54.173.144.191,other_ip  # IPs exentas de rate limiting (opcional)
CORS_ORIGIN=https://your-domain.com  # Origen permitido para CORS (opcional)
```

### Configuración en Código

**Archivo**: `src/config/index.js`

```javascript
cobre: {
  baseUrl: process.env.COBRE_BASE_URL,
  userId: process.env.COBRE_USER_ID,
  secret: process.env.COBRE_SECRET,
  balanceId: process.env.COBRE_BALANCE_ID,
  webhook: {
    secret: process.env.COBRE_WEBHOOK_SECRET,
    url: process.env.COBRE_WEBHOOK_URL
  }
}
```

### Scripts de Setup

#### Crear Tabla de Webhooks
```bash
npm run webhook:setup
```
**Archivo**: `src/scripts/createWebhookEventsTable.js`

#### Suscribirse a Eventos de Cobre
```bash
npm run cobre:subscribe
```
**Archivo**: `src/scripts/bootstrapCobreSubscription.js`

#### Probar Webhook Mock
```bash
npm run webhook:test
```
**Archivo**: `src/scripts/testWebhook.js`

---

## 🧪 Testing y Desarrollo

### Endpoint de Mock

**Endpoint**: `POST /webhooks/mock-payment/:gatewayRef/complete`  
**Disponible solo en**: `NODE_ENV=development`

**Uso**:
```bash
curl -X POST http://localhost:3000/webhooks/mock-payment/test-ref-123/complete \
  -H "Content-Type: application/json" \
  -d '{
    "status": "PAID",
    "amount": 10000,
    "currency": "USD"
  }'
```

### Testing Local con Mock Adapter

**Endpoint**: `POST /webhooks/mock`

**Ejemplo**:
```bash
curl -X POST http://localhost:3000/webhooks/mock \
  -H "Content-Type: application/json" \
  -H "x-mock-signature: test-signature" \
  -d '{
    "reference": "test-ref-123",
    "status": "PAID",
    "amount": 10000,
    "currency": "USD"
  }'
```

### Testing con Múltiples Eventos

El sistema soporta webhooks con múltiples eventos:

```bash
curl -X POST http://localhost:3000/webhooks/mock \
  -H "Content-Type: application/json" \
  -H "x-mock-signature: test-signature" \
  -d '[
    {
      "reference": "test-ref-1",
      "status": "PAID",
      "amount": 10000
    },
    {
      "reference": "test-ref-2",
      "status": "PAID",
      "amount": 20000
    }
  ]'
```

### Debugging

#### Ver Logs en Tiempo Real
```bash
tail -f logs/combined.log | grep webhook
```

#### Consultar Eventos Recientes
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/webhooks/admin/events?limit=10"
```

#### Ver Estadísticas
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/webhooks/admin/statistics"
```

---

## 📊 Monitoreo y Logging

### Logs Estructurados

El sistema usa Winston para logging estructurado.

#### Niveles de Log

- **INFO**: Operaciones exitosas y flujo normal
- **WARN**: Situaciones inesperadas pero manejables
- **ERROR**: Errores que requieren atención
- **DEBUG**: Información detallada para debugging

#### Ejemplos de Logs

**Webhook recibido**:
```javascript
logger.info('WebhookController: Received webhook', {
  provider: 'cobre',
  ip: '192.168.1.1',
  userAgent: 'Cobre-Webhook/1.0',
  contentType: 'application/json',
  bodySize: 1024
})
```

**Evento procesado**:
```javascript
logger.info('WebhookService: Successfully processed event', {
  eventIndex: 0,
  eventId: 'ev_xxx',
  externalRef: 'checkout_xxx',
  type: 'payment',
  status: 'PAID',
  result: true
})
```

**Evento duplicado**:
```javascript
logger.info('WebhookService: Skipping duplicate event with same status', {
  eventIndex: 1,
  eventId: 'ev_yyy',
  externalRef: 'checkout_xxx',
  status: 'PAID',
  existingEventId: 123
})
```

### Métricas Disponibles

**Endpoint**: `GET /webhooks/admin/statistics`

Métricas retornadas:
- `total` - Total de eventos procesados
- `processed` - Eventos procesados exitosamente
- `failed` - Eventos que fallaron
- `pending` - Eventos pendientes
- `successRate` - Tasa de éxito (porcentaje)

### Endpoints de Monitoreo

#### Estadísticas Generales
```bash
GET /webhooks/admin/statistics?provider=cobre&status=PROCESSED
```

#### Eventos con Filtros
```bash
GET /webhooks/admin/events?provider=epayco&status=FAILED&page=1&limit=20
```

---

## 🚨 Troubleshooting

### Problema: Webhook no se procesa

**Síntomas**:
- Error en logs: `Invalid signature for provider: cobre`
- Respuesta HTTP 400 del endpoint

**Soluciones**:
1. Verificar que `COBRE_WEBHOOK_SECRET` esté configurado correctamente
2. Verificar que el header `event-timestamp` coincida con el body usado para la firma
3. Verificar que el body raw no haya sido modificado (el middleware `captureRawBody` debe preservarlo)
4. Revisar logs para ver la firma esperada vs recibida

**Debug**:
```bash
# Ver logs de verificación de firma
tail -f logs/combined.log | grep "Cobre webhook: Signature"
```

### Problema: Evento duplicado no detectado

**Síntomas**:
- Múltiples eventos procesados para la misma transacción
- Error: `SequelizeUniqueConstraintError`

**Soluciones**:
1. Verificar que los índices únicos estén creados en la base de datos
2. Verificar que `externalRef` sea consistente entre webhooks del mismo proveedor
3. Revisar logs de idempotencia:
```bash
tail -f logs/combined.log | grep "Idempotency check"
```

### Problema: Transacción no encontrada

**Síntomas**:
- Webhook procesado pero transacción no actualizada
- Log: `Transaction not found`

**Soluciones**:
1. Verificar que `externalRef` del webhook coincida con `gatewayRef` de la transacción
2. Para Cobre, verificar que `external_id` esté presente en el webhook
3. Para ePayco, verificar que `x_id_factura` coincida con el `gatewayRef` usado al crear la transacción
4. Revisar logs de búsqueda:
```bash
tail -f logs/combined.log | grep "TransactionHandler: Searching"
```

### Problema: ePayco webhook no se parsea

**Síntomas**:
- Error: `Invalid Content-Type, expected application/json`
- Body vacío o malformado

**Soluciones**:
1. Verificar que ePayco esté enviando `application/x-www-form-urlencoded`
2. El middleware `captureRawBody` debe parsear form-urlencoded específicamente para ePayco
3. Verificar que el body no haya sido parseado por Express antes del middleware

**Nota**: El middleware `captureRawBody` en `src/routes/webhook.routes.js` maneja el parsing de form-urlencoded para ePayco.

### Problema: Rate limit excedido

**Síntomas**:
- Respuesta HTTP 429
- Log: `Webhook rate limit exceeded`

**Soluciones**:
1. Verificar IP del proveedor y agregarla a `PAYMENT_PROVIDER_IPS`
2. Aumentar `WEBHOOK_RATE_LIMIT_MAX` si es necesario
3. Verificar que no haya un ataque o spam de webhooks

### Problema: Email no se envía pero orden se completa

**Síntomas**:
- Orden en estado `COMPLETED` pero sin email enviado
- Log: `Email failed, order kept in IN_PROCESS`

**Soluciones**:
1. Verificar configuración del servicio de email
2. Verificar que el email del cliente sea válido
3. Revisar logs del email service:
```bash
tail -f logs/combined.log | grep "sendLicenseEmail"
```

**Nota**: El sistema está diseñado para NO completar la orden si el email falla. Si la orden está en `COMPLETED` sin email, puede ser un bug o el email se envió en un reintento posterior.

---

## 🔧 Extensión del Sistema

### Agregar un Nuevo Proveedor

#### 1. Crear Adaptador

Crear archivo: `src/services/webhook/providers/nuevoProveedor.js`

```javascript
const logger = require('../../../config/logger')

class NuevoProveedorAdapter {
  constructor() {
    this.provider = 'nuevoProveedor'
    this.secret = process.env.NUEVO_PROVEEDOR_WEBHOOK_SECRET
  }

  verifySignature(req) {
    // Implementar verificación de firma
    // Retornar true si es válida, false si no
  }

  parseWebhook(req) {
    // Parsear y normalizar el webhook
    // Retornar array de eventos normalizados
    return [{
      provider: this.provider,
      type: 'payment', // o el tipo correspondiente
      externalRef: '...', // Referencia externa
      eventId: '...', // ID del evento
      status: 'PAID', // Estado normalizado
      amount: 10000, // En centavos
      currency: 'USD',
      rawHeaders: req.headers,
      rawBody: req.rawBody?.toString(),
      payload: req.body
    }]
  }

  mapStatus(status) {
    // Mapear estados del proveedor a estados internos
    const statusMap = {
      'success': 'PAID',
      'pending': 'PENDING',
      'failed': 'FAILED'
    }
    return statusMap[status] || 'FAILED'
  }
}

module.exports = NuevoProveedorAdapter
```

#### 2. Registrar en WebhookService

Editar: `src/services/webhook/index.js`

```javascript
const NuevoProveedorAdapter = require('./providers/nuevoProveedor')

class WebhookService {
  constructor() {
    this.providerRegistry = {
      cobre: new CobreAdapter(),
      mock: new MockAdapter(),
      epayco: new EPaycoAdapter(),
      nuevoProveedor: new NuevoProveedorAdapter() // ← Agregar aquí
    }
  }
}
```

#### 3. Configurar Variables de Entorno

```bash
NUEVO_PROVEEDOR_WEBHOOK_SECRET=your_secret
NUEVO_PROVEEDOR_WEBHOOK_URL=https://your-domain.com/webhooks/nuevoProveedor
```

#### 4. Probar

```bash
curl -X POST http://localhost:3000/webhooks/nuevoProveedor \
  -H "Content-Type: application/json" \
  -d '{...}'
```

### Agregar un Nuevo Handler

#### 1. Crear Handler

Crear archivo: `src/services/webhook/handlers/nuevoHandler.js`

```javascript
const logger = require('../../../config/logger')

class NuevoHandler {
  async handle(webhookEvent) {
    try {
      logger.info('NuevoHandler: Processing event', {
        provider: webhookEvent.provider,
        type: webhookEvent.type,
        externalRef: webhookEvent.externalRef
      })

      // Lógica de procesamiento
      // ...

      return {
        success: true,
        // ... datos adicionales
      }
    } catch (error) {
      logger.error('NuevoHandler: Error processing event', {
        error: error.message,
        webhookEvent
      })
      throw error
    }
  }
}

module.exports = new NuevoHandler()
```

#### 2. Registrar en WebhookService

Editar: `src/services/webhook/index.js`

```javascript
const nuevoHandler = require('./handlers/nuevoHandler')

class WebhookService {
  constructor() {
    this.eventHandlers = {
      payment: transactionHandler,
      balance_credit: transactionHandler,
      nuevoTipo: nuevoHandler // ← Agregar aquí
    }
  }
}
```

### Mejores Prácticas

1. **Siempre verificar firma**: Nunca procesar webhooks sin verificar la firma
2. **Usar transacciones de BD**: Para operaciones críticas, usar transacciones de base de datos
3. **Logging detallado**: Registrar información suficiente para debugging
4. **Manejo de errores**: Siempre responder 200 al proveedor (excepto errores de validación)
5. **Idempotencia**: Basar idempotencia en `provider + externalRef`, no en `eventId`
6. **Sanitización**: Sanitizar todos los datos antes de guardar en BD
7. **Rate limiting**: Configurar rate limiting apropiado para cada proveedor

---

## 📚 Referencias

### Archivos del Código Fuente

- **Servicio principal**: `src/services/webhook/index.js`
- **Controlador**: `src/controllers/webhook.controller.js`
- **Rutas**: `src/routes/webhook.routes.js`
- **Modelo**: `src/models/webhookEvent.model.js`
- **Adaptadores**: `src/services/webhook/providers/`
  - `cobre.js`
  - `epayco.js`
  - `mock.js`
- **Handlers**: `src/services/webhook/handlers/`
  - `transactionHandler.js`
- **Middlewares**: 
  - `src/middlewares/rateLimiter.js`
  - `src/middlewares/security.js`
- **Configuración**: `src/config/index.js`

### Scripts Relacionados

- `src/scripts/createWebhookEventsTable.js` - Crear tabla de webhooks
- `src/scripts/bootstrapCobreSubscription.js` - Suscribirse a eventos de Cobre
- `src/scripts/testWebhook.js` - Probar webhooks

### Documentación Externa

- [Documentación de Cobre Webhooks](https://docs.cobre.co)
- [Documentación de ePayco Webhooks](https://docs.epayco.co)

---

---

**Última actualización**: 2025-01-XX  
**Versión del documento**: 1.0.0  
**Validado contra código fuente**: ✅  
**Estado**: ✅ Fuente de verdad única y confiable

> **Para desarrolladores externos**: Este documento es la referencia autorizada para el sistema de webhooks. Ha sido validado exhaustivamente contra el código fuente y refleja exactamente la implementación actual. Cualquier otra documentación sobre webhooks puede estar desactualizada.
