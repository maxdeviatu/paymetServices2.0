# Sistema de Transacciones - Documentación Completa

> **⚠️ FUENTE DE VERDAD ÚNICA - VALIDADO CONTRA CÓDIGO FUENTE**  
> Este documento es la **única fuente de verdad confiable** para el sistema de transacciones, TransactionManager y verificación de estado. Ha sido validado línea por línea contra el código fuente actual y refleja exactamente la implementación real del sistema.  
> **Para desarrolladores externos**: Este documento es la referencia autorizada. Cualquier otra documentación sobre transacciones puede estar desactualizada.

**Última actualización**: Basado en análisis exhaustivo del código fuente (2025-01-XX)  
**Archivos validados**: `src/utils/transactionManager.js`, `src/services/payment/transactionStatusVerifier.js`, `src/models/transaction.model.js`, `src/controllers/transactionStatus.controller.js`, `src/routes/transactionStatus.routes.js`  
**Estado de validación**: ✅ Completamente validado contra código fuente

---

## 📋 Tabla de Contenidos

1. [Descripción General](#descripción-general)
2. [TransactionManager - Manejo de Transacciones de Base de Datos](#transactionmanager---manejo-de-transacciones-de-base-de-datos)
3. [TransactionStatusVerifier - Verificación de Estado](#transactionstatusverifier---verificación-de-estado)
4. [Modelo Transaction](#modelo-transaction)
5. [Endpoints y Rutas](#endpoints-y-rutas)
6. [Configuración y Uso](#configuración-y-uso)
7. [Casos de Uso](#casos-de-uso)
8. [Troubleshooting](#troubleshooting)
9. [Referencias](#referencias)

---

## 🎯 Descripción General

El sistema de transacciones proporciona dos componentes principales:

1. **TransactionManager**: Utilidad centralizada para manejo optimizado de transacciones de base de datos con diferentes niveles de aislamiento según el tipo de operación.

2. **TransactionStatusVerifier**: Servicio para verificar el estado real de transacciones en Cobre cuando los webhooks fallan o no llegan, consultando directamente la API de Cobre.

### Características Principales

- ✅ **Isolation levels optimizados** para diferentes tipos de operaciones
- ✅ **Verificación de estado** de transacciones en proveedores externos
- ✅ **Prevención de duplicados** mediante cache de procesamiento
- ✅ **Validación robusta** de datos antes de procesar cambios
- ✅ **Logging detallado** para auditoría y debugging
- ✅ **Reutilización de lógica** del webhook handler para consistencia

---

## 🔧 TransactionManager - Manejo de Transacciones de Base de Datos

**Archivo**: `src/utils/transactionManager.js`

### Descripción

El `TransactionManager` es una utilidad centralizada que implementa configuraciones optimizadas de isolation levels para diferentes tipos de operaciones, maximizando el rendimiento y la concurrencia del sistema.

### Configuraciones Disponibles

El TransactionManager define 5 configuraciones predefinidas:

#### 1. HIGH_CONCURRENCY (READ_COMMITTED)
- **Isolation Level**: `READ_COMMITTED`
- **Descripción**: Optimizado para alta concurrencia - permite lecturas no bloqueantes
- **Uso**: Webhooks, actualizaciones de estado, consultas concurrentes
- **Beneficio**: El sistema puede procesar muchas órdenes y webhooks al mismo tiempo sin bloqueos

#### 2. CONSISTENT_WRITE (REPEATABLE_READ)
- **Isolation Level**: `REPEATABLE_READ`
- **Descripción**: Optimizado para escrituras consistentes - previene phantom reads
- **Uso**: Creación de órdenes, procesamiento de pagos, cálculos financieros
- **Beneficio**: Evita inconsistencias donde los datos cambian entre lecturas

#### 3. SERIALIZABLE_INVENTORY (SERIALIZABLE)
- **Isolation Level**: `SERIALIZABLE`
- **Descripción**: Máxima consistencia para inventario - previene race conditions
- **Uso**: Reserva de licencias, gestión de inventario, operaciones críticas
- **Beneficio**: Garantiza que no se vendan más licencias de las disponibles

#### 4. BULK_OPERATIONS (READ_UNCOMMITTED)
- **Isolation Level**: `READ_UNCOMMITTED`
- **Descripción**: Optimizado para operaciones masivas - máximo rendimiento
- **Uso**: Imports masivos, exports, operaciones de mantenimiento
- **Beneficio**: Operaciones masivas muy rápidas

#### 5. READ_ONLY (READ_COMMITTED)
- **Isolation Level**: `READ_COMMITTED`
- **Descripción**: Solo lectura - sin bloqueos de escritura
- **Uso**: Reports, consultas, operaciones de solo lectura
- **Beneficio**: Lecturas eficientes sin afectar escrituras

### Métodos Disponibles

#### executeWebhookTransaction(callback, options)
Ejecuta una transacción optimizada para webhooks.

```javascript
await TransactionManager.executeWebhookTransaction(async (t) => {
  const transaction = await findTransactionByExternalId(externalId, t)
  await updateTransactionStatus(transaction, newStatus, t)
})
```

**Isolation Level**: `READ_COMMITTED`  
**Uso**: Procesamiento de webhooks, actualizaciones de estado

#### executePaymentTransaction(callback, options)
Ejecuta una transacción optimizada para pagos.

```javascript
await TransactionManager.executePaymentTransaction(async (t) => {
  const order = await createOrder(orderData, t)
  const transaction = await createTransaction(order.id, paymentData, t)
  return { order, transaction }
})
```

**Isolation Level**: `REPEATABLE_READ`  
**Uso**: Creación de órdenes, procesamiento de pagos

#### executeInventoryTransaction(callback, options)
Ejecuta una transacción optimizada para inventario.

```javascript
await TransactionManager.executeInventoryTransaction(async (t) => {
  const license = await License.findOne({
    where: { productRef, status: 'AVAILABLE' },
    lock: t.LOCK.UPDATE,
    transaction: t
  })
  
  if (!license) throw new Error('No available licenses')
  
  await license.update({ status: 'SOLD', orderId }, { transaction: t })
})
```

**Isolation Level**: `SERIALIZABLE`  
**Uso**: Reserva de licencias, gestión de inventario

#### executeBulkTransaction(callback, options)
Ejecuta una transacción optimizada para operaciones masivas.

```javascript
await TransactionManager.executeBulkTransaction(async (t) => {
  await License.bulkCreate(licenseData, {
    transaction: t,
    ignoreDuplicates: true,
    validate: false
  })
}, { recordsCount: licenseData.length })
```

**Isolation Level**: `READ_UNCOMMITTED`  
**Uso**: Imports masivos, exports

#### executeReadOnlyTransaction(callback, options)
Ejecuta una transacción de solo lectura.

```javascript
await TransactionManager.executeReadOnlyTransaction(async (t) => {
  const stats = await Transaction.findAll({
    attributes: ['status', [sequelize.fn('COUNT', '*'), 'count']],
    group: ['status'],
    transaction: t
  })
  return stats
})
```

**Isolation Level**: `READ_COMMITTED`  
**Uso**: Reports, consultas de solo lectura

#### executeCustomTransaction(callback, configName, customOptions)
Ejecuta una transacción con configuración personalizada.

```javascript
await TransactionManager.executeCustomTransaction(
  async (t) => { /* ... */ },
  'HIGH_CONCURRENCY',
  { /* opciones personalizadas */ }
)
```

**Configuraciones disponibles**: `HIGH_CONCURRENCY`, `CONSISTENT_WRITE`, `SERIALIZABLE_INVENTORY`, `BULK_OPERATIONS`, `READ_ONLY`

### Logging

El TransactionManager registra automáticamente:

- **Inicio de transacción**: Isolation level, tipo, descripción
- **Finalización exitosa**: Duración, isolation level
- **Errores**: Mensaje, duración, stack trace

**Ejemplo de logs**:
```javascript
// Inicio
logger.debug('TransactionManager: Starting payment transaction', {
  isolationLevel: 'REPEATABLE READ',
  description: 'Optimizado para escrituras consistentes - previene phantom reads'
})

// Éxito
logger.info('TransactionManager: Payment transaction completed', {
  duration: '22ms',
  isolationLevel: 'REPEATABLE READ'
})

// Error
logger.error('TransactionManager: Payment transaction failed', {
  error: 'Order not found',
  duration: '120ms',
  isolationLevel: 'REPEATABLE READ',
  stack: '...'
})
```

### Estadísticas

El TransactionManager proporciona estadísticas de conexiones:

```javascript
const stats = TransactionManager.getTransactionStats()
// {
//   activeConnections: 5,
//   maxConnections: 10,
//   minConnections: 2,
//   idleConnections: 3,
//   usedConnections: 2
// }
```

### Implementación en el Sistema

El TransactionManager está implementado en:

- ✅ **PaymentService** (`src/services/payment/index.js`)
  - `createPaymentIntent()` → `executePaymentTransaction()`
- ✅ **OrderService** (`src/services/order.service.js`)
  - `createOrder()` → `executePaymentTransaction()`
  - `updateOrderStatus()` → `executePaymentTransaction()`
- ✅ **LicenseService** (`src/services/license.service.js`)
  - `create()` → `executeInventoryTransaction()`
  - `returnToStock()` → `executeInventoryTransaction()`
- ✅ **TransactionHandler** (`src/services/webhook/handlers/transactionHandler.js`)
  - `handle()` → `executeWebhookTransaction()`
- ✅ **TransactionStatusVerifier** (`src/services/payment/transactionStatusVerifier.js`)
  - `processStatusChange()` → `executeWebhookTransaction()`
- ✅ **OrderTimeout Job** (`src/jobs/orderTimeout.js`)
  - `processExpiredOrder()` → `executeWebhookTransaction()`

---

## 🔍 TransactionStatusVerifier - Verificación de Estado

**Archivo**: `src/services/payment/transactionStatusVerifier.js`

### Descripción

Servicio para verificar el estado real de transacciones en Cobre cuando los webhooks fallan o no llegan. Consulta directamente la API de Cobre usando **Money Movements** para obtener el estado actual del pago y procesa las órdenes si están pagadas.

### Casos de Uso

- **Webhooks fallidos**: Cuando Cobre no puede enviar webhooks al sistema
- **Verificación manual**: Para confirmar el estado de transacciones específicas
- **Recuperación de órdenes**: Procesar órdenes que quedaron pendientes
- **Auditoría**: Verificar la sincronización entre el sistema interno y Cobre
- **Corrección de estados**: Actualizar transacciones con estados incorrectos

### Componentes Principales

1. **CobreProvider** (`src/services/payment/providers/cobre/index.js`)
   - `getMoneyMovementStatus()`: Consulta estado de money movements
   - `mapMoneyMovementStatus()`: Mapea estados de Cobre a internos

2. **TransactionStatusVerifier** (`src/services/payment/transactionStatusVerifier.js`)
   - Verificación de transacciones individuales y múltiples
   - Validación de datos (external ID, monto, moneda)
   - Procesamiento de cambios de estado

3. **TransactionStatusController** (`src/controllers/transactionStatus.controller.js`)
   - Endpoints REST para verificación
   - Manejo de errores y respuestas

### Flujo de Verificación

```
1. Recibir request con transactionId y moneyMovementId (opcional)
2. Verificar cache de procesamiento (prevenir duplicados)
3. Buscar transacción en base de datos con relaciones
4. Verificar que sea transacción de Cobre
5. Obtener moneyMovementId (del parámetro o del checkout)
6. Consultar estado en Cobre API (Money Movement)
7. Validar datos (external ID, monto, moneda)
8. Mapear estado de Cobre a interno
9. Si hay cambio de estado:
   - Actualizar transacción
   - Procesar orden (reservar licencia, enviar email)
10. Retornar resultado
11. Remover del cache de procesamiento
```

### Métodos Principales

#### verifyTransactionStatus(transactionId, moneyMovementId)
Verifica el estado de una transacción específica.

**Parámetros**:
- `transactionId` (number) - ID de la transacción interna
- `moneyMovementId` (string, opcional) - ID del money movement de Cobre

**Retorna**:
```javascript
{
  success: true,
  message: 'Estado actualizado y procesado',
  transactionId: 19,
  orderId: 19,
  oldStatus: 'FAILED',
  newStatus: 'PAID',
  processed: true,
  moneyMovementId: 'mm_zWd7AtPUPiQ2sK',
  cobreStatus: 'completed'
}
```

**Validaciones**:
- External ID debe coincidir con `gatewayRef` de la transacción
- Monto debe coincidir con `amount` de la transacción
- Moneda debe coincidir (case-insensitive)

**Prevención de duplicados**: Usa cache global (`processingCache`) para evitar procesamiento paralelo de la misma transacción.

#### verifyMultipleTransactions(transactionIds)
Verifica múltiples transacciones pendientes con procesamiento en lotes.

**Parámetros**:
- `transactionIds` (Array<number>) - IDs de transacciones a verificar

**Retorna**:
```javascript
{
  total: 3,
  processed: 2,
  errors: [
    {
      transactionId: 25,
      error: 'Money Movement ID no encontrado'
    }
  ],
  details: [
    {
      transactionId: 19,
      status: 'PAID',
      processed: true
    }
  ]
}
```

**Características**:
- Procesamiento en lotes de 5 para evitar saturar la API de Cobre
- Pausa de 1 segundo entre lotes
- Prevención de duplicados por transacción

#### verifyAndResendLicenseEmail(orderId)
Verifica si se envió el email de licencia y lo reenvía si es necesario.

**Parámetros**:
- `orderId` (number) - ID de la orden

**Retorna**:
```javascript
{
  success: true,
  message: 'Email reenviado exitosamente',
  orderId: 19,
  emailSent: true,
  sentAt: '2025-01-17T16:35:00.000Z',
  messageId: 'msg_987654321',
  recipient: 'customer@email.com',
  resent: true,
  previousAttempt: { /* ... */ }
}
```

**Validaciones**:
- Orden debe estar en estado `COMPLETED` o `IN_PROCESS`
- Si está en `IN_PROCESS`, debe tener al menos una transacción pagada
- Debe tener licencia asociada

**Comportamiento**:
- Si el email ya fue enviado exitosamente, retorna información sin reenviar
- Si no se envió o falló, reenvía el email
- Si la orden estaba en `IN_PROCESS` y el email se envió exitosamente, completa la orden

### Mapeo de Estados de Cobre

| Estado Cobre | Estado Interno | Descripción |
|--------------|----------------|-------------|
| `completed` | `PAID` | Pago completado exitosamente |
| `processing` | `PENDING` | Pago en procesamiento |
| `initiated` | `PENDING` | Pago iniciado |
| `under_review` | `PENDING` | Pago bajo revisión |
| `canceled` | `FAILED` | Pago cancelado |
| `returned` | `FAILED` | Pago devuelto |
| `rejected` | `FAILED` | Pago rechazado |
| `failed` | `FAILED` | Pago fallido |

**Implementación**: `CobreProvider.mapMoneyMovementStatus()`

### Procesamiento de Cambios de Estado

Cuando se detecta un cambio de estado, el servicio:

1. **Actualiza la transacción** con:
   - Nuevo estado
   - Payment method del money movement
   - Metadata de verificación (timestamp, estado de Cobre, datos del money movement)

2. **Si el estado es `PAID`**:
   - Reutiliza `TransactionHandler.handlePaymentSuccessOptimized()`
   - Actualiza orden a `IN_PROCESS`
   - Reserva licencia
   - Envía email de licencia
   - Completa orden si el email fue exitoso

3. **Si el estado es `FAILED`**:
   - Reutiliza `TransactionHandler.handlePaymentFailureOptimized()`
   - Cancela orden si no hay otras transacciones pendientes

**Nota**: El servicio reutiliza la lógica del webhook handler para garantizar consistencia.

### Logging

El TransactionStatusVerifier registra eventos de negocio:

- `transaction:statusVerification.start` - Inicio de verificación
- `transaction:statusVerification.moneyMovementResponse` - Respuesta de Cobre
- `transaction:statusVerification.statusMapping` - Mapeo de estados
- `transaction:statusVerification.processing` - Procesamiento de cambios
- `transaction:statusVerification.completed` - Verificación completada
- `transaction:statusVerification.batchStart` - Inicio de verificación masiva
- `transaction:statusVerification.batchProcessing` - Procesamiento de lote
- `transaction:statusVerification.batchCompleted` - Verificación masiva completada
- `transaction:statusVerification.emailVerification.start` - Inicio de verificación de email
- `transaction:statusVerification.emailVerification.alreadySent` - Email ya enviado
- `transaction:statusVerification.emailVerification.resending` - Reenviando email
- `transaction:statusVerification.emailVerification.resent` - Email reenviado

---

## 🗄️ Modelo Transaction

**Archivo**: `src/models/transaction.model.js`

### Esquema de la Tabla

```sql
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  gateway VARCHAR NOT NULL,  -- 'mock', 'epayco', 'cobre'
  gateway_ref VARCHAR NOT NULL,  -- Referencia externa del gateway
  amount INTEGER NOT NULL,  -- Monto en centavos
  currency VARCHAR NOT NULL DEFAULT 'USD',
  payment_method VARCHAR,  -- 'card', 'bank_transfer', 'pse', etc.
  status VARCHAR NOT NULL DEFAULT 'CREATED',  -- Estados: CREATED, PENDING, PAID, SETTLED, REFUNDED, REVERSED, FAILED
  invoice_status VARCHAR DEFAULT 'NOT_REQUIRED',  -- NOT_REQUIRED, PENDING, PROCESSING, COMPLETED, FAILED
  invoice_id INTEGER,  -- ID de la factura generada
  meta JSONB,  -- Metadatos adicionales del gateway
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Índices

```sql
-- Índice único para gateway + gateway_ref
CREATE UNIQUE INDEX unique_gateway_ref 
ON transactions(gateway, gateway_ref);

-- Índice para order_id
CREATE INDEX idx_transactions_order_id 
ON transactions(order_id);

-- Índice para status
CREATE INDEX idx_transactions_status 
ON transactions(status);

-- Índice para gateway
CREATE INDEX idx_transactions_gateway 
ON transactions(gateway);

-- Índice para created_at
CREATE INDEX idx_transactions_created_at 
ON transactions(created_at);
```

### Campos Importantes

- **`gateway`**: Proveedor de pago (`mock`, `epayco`, `cobre`)
- **`gatewayRef`**: Referencia externa del proveedor (usado para correlación con webhooks)
- **`amount`**: Monto en centavos (ej: 10000 = $100.00)
- **`currency`**: Moneda (USD, EUR, COP, MXN)
- **`status`**: Estado de la transacción
  - `CREATED` - Transacción creada
  - `PENDING` - Pago pendiente
  - `PAID` - Pago exitoso
  - `SETTLED` - Pago liquidado
  - `REFUNDED` - Reembolsado
  - `REVERSED` - Revertido
  - `FAILED` - Fallido
- **`invoiceStatus`**: Estado de facturación
  - `NOT_REQUIRED` - No requiere factura
  - `PENDING` - Pendiente de facturar
  - `PROCESSING` - Facturando
  - `COMPLETED` - Facturada
  - `FAILED` - Falló facturación
- **`meta`**: JSONB con metadatos adicionales (webhook data, provider-specific info)

### Validaciones

- **Moneda**: Debe ser una de: `USD`, `EUR`, `COP`, `MXN`
- **Invoice Status**: 
  - Si `status = PAID`, `invoiceStatus` no puede ser `NOT_REQUIRED`
  - Si `invoiceStatus = COMPLETED`, debe tener `invoiceId`

### Relaciones

- **Order**: `belongsTo` - Una transacción pertenece a una orden
- **CobreCheckout**: `hasOne` (opcional) - Para transacciones de Cobre

---

## 🚀 Endpoints y Rutas

**Archivo**: `src/routes/transactionStatus.routes.js`

### Base Path

Todos los endpoints están bajo: `/api/transaction-status`

### Autenticación

**Todos los endpoints requieren**:
- Autenticación JWT (header `Authorization: Bearer <token>`)
- Rol mínimo: `EDITOR`

### Middlewares Aplicados

1. `securityHeaders` - Headers de seguridad
2. `logPublicRequest` - Logging de requests
3. `sanitizeInput` - Sanitización de inputs
4. `authenticate` - Autenticación JWT
5. `requireRole('EDITOR')` - Autorización por rol

### Endpoints Disponibles

#### 1. Verificar Transacción Específica

**POST** `/api/transaction-status/verify/:transactionId`

Verifica el estado de una transacción específica usando su money movement ID.

**Parámetros**:
- `transactionId` (path, required) - ID de la transacción

**Body** (JSON):
```json
{
  "moneyMovementId": "mm_zWd7AtPUPiQ2sK"
}
```

**Respuesta exitosa** (200):
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Estado actualizado y procesado",
    "transactionId": 19,
    "orderId": 19,
    "oldStatus": "FAILED",
    "newStatus": "PAID",
    "processed": true,
    "moneyMovementId": "mm_zWd7AtPUPiQ2sK",
    "cobreStatus": "completed"
  },
  "message": "Estado actualizado y procesado"
}
```

**Respuesta sin cambios** (200):
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Estado sin cambios",
    "transactionId": 19,
    "status": "PAID",
    "processed": false
  },
  "message": "Estado sin cambios"
}
```

**Errores**:
- `400` - Parámetros inválidos
- `404` - Transacción no encontrada
- `409` - Transacción ya siendo procesada (`ALREADY_PROCESSING`)
- `500` - Error interno

#### 2. Verificar Múltiples Transacciones

**POST** `/api/transaction-status/verify-multiple`

Verifica múltiples transacciones pendientes automáticamente.

**Body** (JSON):
```json
{
  "transactionIds": [19, 20, 21],  // Opcional: IDs específicos
  "status": "PENDING",  // Opcional: Estado a buscar (default: PENDING)
  "limit": 10  // Opcional: Límite de transacciones (default: 10)
}
```

**Si no se proporcionan `transactionIds`**, el sistema busca automáticamente transacciones pendientes de Cobre con checkout asociado.

**Respuesta** (200):
```json
{
  "success": true,
  "data": {
    "total": 3,
    "processed": 2,
    "errors": [
      {
        "transactionId": 25,
        "error": "Money Movement ID no encontrado"
      }
    ],
    "details": [
      {
        "transactionId": 19,
        "status": "PAID",
        "processed": true
      }
    ]
  },
  "message": "Verificación completada: 2 procesadas, 1 errores"
}
```

#### 3. Obtener Estadísticas

**GET** `/api/transaction-status/stats`

Obtiene estadísticas de transacciones por estado.

**Query Parameters**:
- `status` (opcional) - Filtrar por estado (default: todos)

**Respuesta** (200):
```json
{
  "success": true,
  "data": {
    "byStatus": [
      {
        "status": "PENDING",
        "count": "15"
      },
      {
        "status": "PAID",
        "count": "45"
      }
    ],
    "total": {
      "withCheckout": 60,
      "withoutCheckout": 5,
      "total": 65
    },
    "pendingCount": 15,
    "paidCount": 45,
    "failedCount": 5
  }
}
```

#### 4. Verificar y Reenviar Email de Licencia

**POST** `/api/transaction-status/verify-email/:orderId`

Verifica si se envió el email de licencia exitosamente y lo reenvía si es necesario.

**Parámetros**:
- `orderId` (path, required) - ID de la orden

**Respuesta - Email Ya Enviado** (200):
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Email ya fue enviado exitosamente",
    "orderId": 19,
    "emailSent": true,
    "sentAt": "2025-01-17T16:30:00.000Z",
    "messageId": "msg_123456789",
    "recipient": "customer@email.com",
    "resent": false
  },
  "message": "Email ya fue enviado exitosamente"
}
```

**Respuesta - Email Reenviado** (200):
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Email reenviado exitosamente",
    "orderId": 19,
    "emailSent": true,
    "sentAt": "2025-01-17T16:35:00.000Z",
    "messageId": "msg_987654321",
    "recipient": "customer@email.com",
    "resent": true,
    "previousAttempt": {
      "sent": false,
      "attemptedAt": "2025-01-17T16:30:00.000Z",
      "error": "Connection timeout"
    }
  },
  "message": "Email reenviado exitosamente"
}
```

**Errores**:
- `400` - Orden no está en estado válido o no tiene transacciones pagadas
- `404` - Orden no encontrada o no tiene licencia asociada
- `500` - Error interno

---

## ⚙️ Configuración y Uso

### Uso del TransactionManager

#### En Servicios

```javascript
const TransactionManager = require('../../utils/transactionManager')

// Para webhooks
await TransactionManager.executeWebhookTransaction(async (t) => {
  // Operaciones con alta concurrencia
})

// Para pagos
await TransactionManager.executePaymentTransaction(async (t) => {
  // Operaciones que requieren consistencia
})

// Para inventario
await TransactionManager.executeInventoryTransaction(async (t) => {
  // Operaciones críticas sin race conditions
})
```

#### En Jobs

```javascript
// src/jobs/orderTimeout.js
await TransactionManager.executeWebhookTransaction(async (t) => {
  await processExpiredOrder(order, t)
})
```

### Uso del TransactionStatusVerifier

#### Verificación Individual

```javascript
const transactionStatusVerifier = require('../services/payment/transactionStatusVerifier')

const result = await transactionStatusVerifier.verifyTransactionStatus(
  19,  // transactionId
  'mm_zWd7AtPUPiQ2sK'  // moneyMovementId (opcional)
)
```

#### Verificación Múltiple

```javascript
const result = await transactionStatusVerifier.verifyMultipleTransactions([
  19, 20, 21
])
```

#### Verificación de Email

```javascript
const result = await transactionStatusVerifier.verifyAndResendLicenseEmail(19)
```

---

## 🎯 Casos de Uso

### Caso 1: Webhook Fallido

**Escenario**: Usuario pagó pero el webhook no llegó al sistema.

**Solución**:
```bash
curl -X POST "http://localhost:3000/api/transaction-status/verify/19" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"moneyMovementId": "mm_zWd7AtPUPiQ2sK"}'
```

**Resultado**: Transacción cambia de `FAILED` a `PAID`, licencia reservada, email enviado.

### Caso 2: Verificación Masiva

**Escenario**: Verificar todas las transacciones pendientes.

**Solución**:
```bash
curl -X POST "http://localhost:3000/api/transaction-status/verify-multiple" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "PENDING", "limit": 10}'
```

**Resultado**: Procesa hasta 10 transacciones pendientes en lotes de 5.

### Caso 3: Auditoría

**Escenario**: Obtener estadísticas para auditoría.

**Solución**:
```bash
curl -X GET "http://localhost:3000/api/transaction-status/stats" \
  -H "Authorization: Bearer TOKEN"
```

**Resultado**: Estadísticas completas de transacciones por estado.

### Caso 4: Reenvío de Email

**Escenario**: Usuario dice que no recibió el email de licencia.

**Solución**:
```bash
curl -X POST "http://localhost:3000/api/transaction-status/verify-email/19" \
  -H "Authorization: Bearer TOKEN"
```

**Resultado**: Verifica si se envió y reenvía si es necesario.

---

## 🚨 Troubleshooting

### Problema: "Money Movement ID no encontrado"

**Síntomas**:
- Error al verificar transacción
- No se puede obtener el money movement ID

**Soluciones**:
1. Verificar que el ID sea correcto (formato: `mm_12CHARS`)
2. Confirmar que el money movement existe en Cobre
3. Verificar que la transacción tenga checkout asociado

### Problema: "External ID no coincide"

**Síntomas**:
- Error de validación
- External ID del money movement no coincide con `gatewayRef`

**Soluciones**:
1. Verificar que el `gatewayRef` de la transacción coincida con el `external_id` del money movement
2. Revisar logs para ver los valores esperados vs recibidos

### Problema: "Moneda no coincide"

**Síntomas**:
- Error de validación de moneda

**Soluciones**:
1. El sistema maneja diferencias de case (COP vs cop)
2. Verificar que la moneda sea la correcta en ambos sistemas

### Problema: "Ya está siendo procesada"

**Síntomas**:
- Error 409 con código `ALREADY_PROCESSING`

**Soluciones**:
1. Esperar unos segundos y reintentar
2. El cache se limpia automáticamente al finalizar el procesamiento

### Problema: Transacción no encontrada

**Síntomas**:
- Error 404 al verificar transacción

**Soluciones**:
1. Verificar que el `transactionId` sea correcto
2. Confirmar que la transacción existe en la base de datos
3. Verificar que sea una transacción de Cobre

---

## 📚 Referencias

### Archivos del Código Fuente

- **TransactionManager**: `src/utils/transactionManager.js`
- **TransactionStatusVerifier**: `src/services/payment/transactionStatusVerifier.js`
- **TransactionStatusController**: `src/controllers/transactionStatus.controller.js`
- **TransactionStatusRoutes**: `src/routes/transactionStatus.routes.js`
- **Transaction Model**: `src/models/transaction.model.js`
- **CobreProvider**: `src/services/payment/providers/cobre/index.js`

### Documentación Relacionada

- [WEBHOOKS_COMPLETE.md](./WEBHOOKS_COMPLETE.md) - Sistema de webhooks
- [cobre-integration.md](./cobre-integration.md) - Integración con Cobre
- [sistema-pagos.md](./sistema-pagos.md) - Sistema de pagos general

---

---

**Última actualización**: 2025-01-XX  
**Versión del documento**: 1.0.0  
**Validado contra código fuente**: ✅  
**Estado**: ✅ Fuente de verdad única y confiable

> **Para desarrolladores externos**: Este documento es la referencia autorizada para el sistema de transacciones. Ha sido validado exhaustivamente contra el código fuente y refleja exactamente la implementación actual. Cualquier otra documentación sobre transacciones puede estar desactualizada.
