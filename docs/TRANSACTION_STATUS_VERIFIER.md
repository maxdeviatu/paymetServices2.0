# 🔍 Servicio de Verificación de Estado de Transacciones

## 📋 Descripción

Este servicio permite verificar el estado real de transacciones en Cobre cuando los webhooks fallan o no llegan. Consulta directamente la API de Cobre usando **Money Movements** para obtener el estado actual del pago y procesa las órdenes si están pagadas.

## 🎯 Casos de Uso

- **Webhooks fallidos**: Cuando Cobre no puede enviar webhooks al sistema
- **Verificación manual**: Para confirmar el estado de transacciones específicas
- **Recuperación de órdenes**: Procesar órdenes que quedaron pendientes
- **Auditoría**: Verificar la sincronización entre el sistema interno y Cobre
- **Corrección de estados**: Actualizar transacciones con estados incorrectos

## 🏗️ Arquitectura

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
1. Recibir request con transactionId y moneyMovementId
2. Buscar transacción en base de datos
3. Consultar estado en Cobre API (Money Movement)
4. Validar datos (external ID, monto, moneda)
5. Mapear estado de Cobre a interno
6. Si hay cambio de estado:
   - Actualizar transacción
   - Procesar orden (liberar licencia, enviar email)
7. Retornar resultado
```

## 📡 Endpoints Disponibles

### 1. Verificar Transacción Específica

**POST** `/api/transaction-status/verify/:transactionId`

Verifica el estado de una transacción específica usando su money movement ID.

#### Parámetros

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `transactionId` | number | ✅ | ID de la transacción interna |
| `moneyMovementId` | string | ❌ | ID del money movement de Cobre (mm_xxx) |

#### Ejemplo con cURL

```bash
curl -X POST "http://localhost:3000/api/transaction-status/verify/19" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "moneyMovementId": "mm_zWd7AtPUPiQ2sK"
  }'
```

#### Ejemplo con Postman

```
Method: POST
URL: http://localhost:3000/api/transaction-status/verify/19
Headers:
  - Authorization: Bearer YOUR_JWT_TOKEN
  - Content-Type: application/json
Body (raw JSON):
{
  "moneyMovementId": "mm_zWd7AtPUPiQ2sK"
}
```

#### Respuesta Exitosa

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

#### Respuesta Sin Cambios

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

### 2. Verificar Múltiples Transacciones

**POST** `/api/transaction-status/verify-multiple`

Verifica múltiples transacciones pendientes automáticamente.

#### Parámetros

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `transactionIds` | array | ❌ | Array de IDs de transacciones |
| `status` | string | ❌ | Estado a buscar (default: PENDING) |
| `limit` | number | ❌ | Límite de transacciones (default: 10) |

#### Ejemplo con cURL

```bash
curl -X POST "http://localhost:3000/api/transaction-status/verify-multiple" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "PENDING",
    "limit": 5
  }'
```

#### Respuesta

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

### 3. Obtener Estadísticas

**GET** `/api/transaction-status/stats`

Obtiene estadísticas de transacciones por estado.

#### Ejemplo con cURL

```bash
curl -X GET "http://localhost:3000/api/transaction-status/stats" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Respuesta

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

### 4. Verificar y Reenviar Email de Licencia

**POST** `/api/transaction-status/verify-email/:orderId`

Verifica si se envió el email de licencia exitosamente y lo reenvía si es necesario.

#### Parámetros

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `orderId` | number | ✅ | ID de la orden a verificar |

#### Ejemplo con cURL

```bash
curl -X POST "http://localhost:3000/api/transaction-status/verify-email/19" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

#### Ejemplo con Postman

```
Method: POST
URL: http://localhost:3000/api/transaction-status/verify-email/19
Headers:
  - Authorization: Bearer YOUR_JWT_TOKEN
  - Content-Type: application/json
```

#### Respuesta - Email Ya Enviado

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
    "recipient": "valentina.castane@unisimon.edu.co",
    "resent": false
  },
  "message": "Email ya fue enviado exitosamente"
}
```

#### Respuesta - Email Reenviado

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
    "recipient": "valentina.castane@unisimon.edu.co",
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

#### Respuesta - Error (Orden no completada)

```json
{
  "success": false,
  "message": "La orden 19 no está completada (estado actual: PENDING)"
}
```

#### Respuesta - Error (Sin licencia)

```json
{
  "success": false,
  "message": "La orden 19 no tiene licencia asociada"
}
```

## 🔧 Estados de Cobre

### Mapeo de Estados

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

## 🛡️ Validaciones

### Validaciones Automáticas

1. **External ID**: Debe coincidir con `gatewayRef` de la transacción
2. **Monto**: Debe coincidir con `amount` de la transacción
3. **Moneda**: Debe coincidir con `currency` (case-insensitive)

### Ejemplo de Error de Validación

```json
{
  "success": false,
  "message": "External ID no coincide: esperado 9789702651208-cobre-19-2025-07-17-1127, recibido 9789702651208-cobre-19-2025-07-17-1128",
  "code": null
}
```

## 🚨 Códigos de Error

| Código HTTP | Código Error | Descripción |
|-------------|--------------|-------------|
| 400 | - | Parámetros inválidos |
| 404 | - | Transacción no encontrada |
| 409 | `ALREADY_PROCESSING` | Transacción ya siendo procesada |
| 429 | `RATE_LIMIT_EXCEEDED` | Límite de rate excedido |
| 500 | - | Error interno del servidor |

## 🔐 Seguridad

### Autenticación
- **JWT Token** requerido en header `Authorization: Bearer <token>`

### Autorización
- Solo usuarios con rol **EDITOR** o superior pueden acceder

### Rate Limiting
- Máximo **10 llamadas por minuto** por money movement
- Cache de **1 minuto** para estados de money movements

## 📊 Logging

### Eventos Registrados

- `transaction:statusVerification.start`: Inicio de verificación
- `transaction:statusVerification.moneyMovementResponse`: Respuesta de Cobre
- `transaction:statusVerification.statusMapping`: Mapeo de estados
- `transaction:statusVerification.processing`: Procesamiento de cambios
- `transaction:statusVerification.completed`: Verificación completada

### Ejemplo de Log

```json
{
  "level": "info",
  "message": "transaction:statusVerification.completed",
  "transactionId": 19,
  "orderId": 19,
  "oldStatus": "FAILED",
  "newStatus": "PAID",
  "processed": true
}
```

## 🚀 Casos de Uso Prácticos

### Caso 1: Webhook Fallido
```bash
# Usuario pagó pero webhook no llegó
curl -X POST "http://localhost:3000/api/transaction-status/verify/19" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"moneyMovementId": "mm_zWd7AtPUPiQ2sK"}'
# Resultado: Transacción cambia de FAILED a PAID, licencia liberada
```

### Caso 2: Verificación Masiva
```bash
# Verificar todas las transacciones pendientes
curl -X POST "http://localhost:3000/api/transaction-status/verify-multiple" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"status": "PENDING", "limit": 10}'
```

### Caso 3: Auditoría
```bash
# Obtener estadísticas para auditoría
curl -X GET "http://localhost:3000/api/transaction-status/stats" \
  -H "Authorization: Bearer TOKEN"
```

### Caso 4: Verificar y Reenviar Email
```bash
# Usuario dice que no recibió el email de licencia
curl -X POST "http://localhost:3000/api/transaction-status/verify-email/19" \
  -H "Authorization: Bearer TOKEN"
# Resultado: Verifica si se envió y reenvía si es necesario
```

## 🔄 Procesamiento Automático

Cuando una transacción cambia a estado `PAID`:

1. **Actualiza transacción** con nuevo estado
2. **Actualiza orden** a estado `COMPLETED`
3. **Reserva licencia** para el usuario
4. **Envía email** con credenciales de acceso
5. **Registra logs** de auditoría

## 📝 Notas Importantes

- El servicio es **idempotente**: múltiples llamadas con los mismos datos no causan efectos secundarios
- **Prevención de duplicados**: Cache global evita procesamiento paralelo
- **Validación robusta**: Verifica external ID, monto y moneda antes de procesar
- **Logging completo**: Todos los eventos se registran para auditoría
- **Rate limiting**: Protección contra abuso de la API de Cobre

## 🛠️ Troubleshooting

### Error: "Money Movement ID no encontrado"
- Verificar que el ID sea correcto (formato: `mm_12CHARS`)
- Confirmar que el money movement existe en Cobre

### Error: "External ID no coincide"
- Verificar que el `gatewayRef` de la transacción coincida con el `external_id` del money movement

### Error: "Moneda no coincide"
- El sistema maneja diferencias de case (COP vs cop)
- Verificar que la moneda sea la correcta

### Error: "Ya está siendo procesada"
- Esperar unos segundos y reintentar
- El cache se limpia automáticamente 