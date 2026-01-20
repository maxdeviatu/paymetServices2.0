# Integración con Cobre - Documentación

> **⚠️ NOTA IMPORTANTE**: Este documento describe la integración con Cobre. Para información técnica detallada sobre webhooks y transacciones validada contra el código fuente, consulte:
> - **[WEBHOOKS_COMPLETE.md](./WEBHOOKS_COMPLETE.md)** - Sistema de webhooks (fuente de verdad) - Incluye detalles específicos de Cobre
> - **[TRANSACTIONS_COMPLETE.md](./TRANSACTIONS_COMPLETE.md)** - Sistema de transacciones (fuente de verdad)

## 📋 Descripción

Esta documentación describe la integración completa con el proveedor de pagos Cobre, incluyendo autenticación, creación de checkouts, webhooks y suscripciones automáticas.

## 🚀 Flujo de Inicialización

### 1. **Arranque del Servidor**
Cuando se ejecuta `npm start` o `npm run dev`, el sistema sigue este flujo:

```
1. Inicialización de Base de Datos
   ↓
2. Creación de Super Admin
   ↓
3. Inicio del Servidor HTTP
   ↓
4. Inicialización de Proveedores de Pago
   ↓
5. Autenticación con Cobre
   ↓
6. Validación de Token
   ↓
7. Configuración de Webhook Subscription
```

### 2. **Logs de Inicialización**
El sistema mostrará logs detallados durante la inicialización:

```bash
🔍 Validando proveedores de pago...
📦 Proveedores de pago encontrados:
   - Cobre

🔐 Cobre - Autenticación:
✅ cobre authentication successful on startup
✅ cobre token validation successful

📊 Inicialización de proveedores completada:
   ✅ Exitosos: 1

🔍 Estado final de proveedores:
   cobre: ✅ Ready

Payment providers initialization completed

Initializing Cobre webhook subscription...
📋 Configuration verified: {
  webhookUrl: 'https://your-domain.com/webhooks/cobre',
  webhookSecret: '***configured***',
  baseUrl: 'https://api.cobre.co'
}
🔐 Getting Cobre access token...
✅ Cobre access token obtained successfully
🔍 Checking existing subscriptions...
📊 Found 1 existing subscription(s)
✅ Found existing subscription for our webhook: {
  subscriptionId: 'sub_xxx',
  url: 'https://your-domain.com/webhooks/cobre',
  events: ['accounts.balance.credit'],
  createdAt: '2025-01-XX...'
}
✅ Subscription is up to date, no changes needed

✅ Cobre webhook subscription initialized successfully
```

## ⚙️ Configuración Requerida

### Variables de Entorno

```bash
# Configuración básica de Cobre
COBRE_USER_ID=your_user_id
COBRE_SECRET=your_secret
COBRE_BASE_URL=https://api.cobre.co

# Configuración de webhooks
COBRE_WEBHOOK_URL=https://your-domain.com/webhooks/cobre
COBRE_WEBHOOK_SECRET=your_webhook_secret

# Configuración general
NODE_ENV=production
PAYMENT_SUCCESS_URL=https://your-domain.com/payment/success
```

### Verificación de Configuración

```bash
# Probar conexión con Cobre
npm run cobre:test

# Crear tabla de webhooks
npm run webhook:setup

# Suscribirse manualmente a eventos
npm run cobre:subscribe
```

## 🔄 Flujo de Pago Completo

### 1. **Creación de Orden**
```
POST /api/orders
↓
Validación de datos
↓
Creación de orden en BD
↓
Creación de transacción
```

### 2. **Creación de Checkout**
```
POST /api/orders/:id/payment
↓
Autenticación con Cobre
↓
Generación de uniqueTransactionId
↓
Creación de checkout en Cobre
↓
Retorno de URL de pago
```

### 3. **Proceso de Pago**
```
Usuario → URL de Cobre
↓
Pago en Cobre
↓
Cobre procesa pago
↓
Cobre envía webhook
```

### 4. **Recepción de Webhook**
```
POST /webhooks/cobre
↓
Verificación de firma
↓
Parseo del evento
↓
Actualización de transacción
↓
Reserva de licencia (si aplica)
↓
Envío de emails
```

## 📊 Estructura de Datos

### Checkout de Cobre
```javascript
{
  alias: "Order-123-1703123456789",
  amount: 50000, // en centavos
  external_id: "CURSO-BASICO-cobre-123-2025-01-XX-XXXX",
  destination_id: "acc_xxx",
  checkout_rails: ["pse", "bancolombia", "nequi"],
  checkout_header: "Innovate Learning",
  checkout_item: "Licencia Curso Básico",
  description_to_payee: "Pago Innovate Learning",
  valid_until: "2025-01-XX...",
  money_movement_intent_limit: 1,
  redirect_url: "https://your-domain.com/payment/success",
  metadata: {
    uniqueTransactionId: "mm_xxxxxxxxxxxxxxxx",
    orderId: 123,
    productRef: "CURSO-BASICO",
    customerEmail: "user@example.com"
  }
}
```

### Webhook de Cobre
```javascript
{
  "id": "ev_xxxxxxxxxxxxxxxxxxxx",
  "event_key": "accounts.balance.credit",
  "created_at": "2025-01-XX...",
  "content": {
    "id": "trx_xxxxxxxxxxxxxxxxxxxx",
    "type": "internal_credit",
    "amount": 50000,
    "currency": "COP",
    "date": "2025-01-XX...",
    "metadata": {
      "uniqueTransactionId": "mm_xxxxxxxxxxxxxxxx",
      "sender_account_number": "@xxxxx",
      "description": "Pago Innovate Learning",
      "sender_name": "Product Alpha",
      "tracking_key": "",
      "sender_id": "xxxxxxxxxx"
    },
    "account_id": "acc_xxx",
    "previous_balance": 100000,
    "current_balance": 150000,
    "credit_debit_type": "credit"
  }
}
```

## 🔐 Seguridad

### Verificación de Firma
```javascript
// Cálculo de firma esperada
const data = `${timestamp}.${body}`;
const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(data, 'utf8')
  .digest('hex');

// Comparación segura
const isValid = crypto.timingSafeEqual(
  Buffer.from(expectedSignature, 'hex'),
  Buffer.from(receivedSignature, 'hex')
);
```

### Headers de Webhook
```
event_timestamp: 2025-01-XX...
event_signature: 1ff93b74902d1f94c38d0cf384a6b44d...
content-type: application/json
```

## 🛠️ Scripts de Mantenimiento

### Verificar Conexión
```bash
npm run cobre:test
```

### Actualizar Suscripción
```bash
npm run cobre:subscribe
```

### Probar Webhook
```bash
# Mock webhook
npm run webhook:test

# Webhook real de Cobre (requiere configuración)
curl -X POST https://your-domain.com/webhooks/cobre \
  -H "Content-Type: application/json" \
  -H "event_timestamp: 2025-01-XX..." \
  -H "event_signature: calculated_signature" \
  -d '{"event_key":"accounts.balance.credit",...}'
```

## 🚨 Troubleshooting

### Problemas Comunes

#### 1. **Error de Autenticación**
```bash
❌ Error inicializando cobre: Invalid credentials
```
**Solución**: Verificar `COBRE_USER_ID` y `COBRE_SECRET`

#### 2. **Token Expirado**
```bash
⚠️ cobre token validation failed
🔄 Attempting to refresh token...
✅ Token refreshed successfully
```
**Solución**: El sistema renueva automáticamente el token

#### 3. **Webhook no configurado**
```bash
⚠️ Cobre webhook configuration missing, skipping subscription setup
```
**Solución**: Configurar `COBRE_WEBHOOK_URL` y `COBRE_WEBHOOK_SECRET`

#### 4. **Suscripción ya existe**
```bash
✅ Found existing subscription for our webhook
✅ Subscription is up to date, no changes needed
```
**Estado**: Normal, no requiere acción

### Debugging

#### Verificar Estado de Proveedores
```bash
curl http://localhost:3000/health
```

#### Ver Logs en Tiempo Real
```bash
tail -f logs/app.log | grep -i cobre
```

#### Consultar Eventos de Webhook
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/api/webhooks/admin/events?provider=cobre&limit=10"
```

## 📈 Monitoreo

### Métricas Importantes
- Tasa de éxito de autenticación
- Tiempo de respuesta de Cobre API
- Webhooks procesados vs fallidos
- Transacciones completadas

### Alertas Recomendadas
- Fallos de autenticación consecutivos
- Webhooks no procesados por más de 5 minutos
- Tasa de error de webhooks > 1%

## 🔄 Actualizaciones

### Agregar Nuevos Eventos
1. Actualizar `needsEventUpdate()` en `bootstrapCobreSubscription.js`
2. Agregar eventos al array `requiredEvents`
3. Reiniciar el servidor

### Cambiar URL de Webhook
1. Actualizar `COBRE_WEBHOOK_URL`
2. Ejecutar `npm run cobre:subscribe`
3. Verificar logs de suscripción

## 📚 Referencias

- [Documentación de Cobre API](https://docs.cobre.co)
- [Guía Completa de Webhooks](./WEBHOOKS_COMPLETE.md)
- [Configuración de Seguridad](./security.md) 