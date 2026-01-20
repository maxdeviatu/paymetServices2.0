# ePayco Integration Guide

> **⚠️ NOTA IMPORTANTE**: Este documento describe la integración con ePayco. Para información técnica detallada sobre webhooks y transacciones validada contra el código fuente, consulte:
> - **[WEBHOOKS_COMPLETE.md](./WEBHOOKS_COMPLETE.md)** - Sistema de webhooks (fuente de verdad) - Incluye detalles específicos de ePayco
> - **[TRANSACTIONS_COMPLETE.md](./TRANSACTIONS_COMPLETE.md)** - Sistema de transacciones (fuente de verdad)

## Descripción General

Este documento describe la implementación e integración del proveedor de pagos ePayco en el sistema de Innovate Learning.

## Configuración

### Variables de Entorno

```bash
# ePayco credentials
EPAYCO_PUBLIC_KEY=tu_public_key
EPAYCO_PRIVATE_KEY=tu_private_key
EPAYCO_P_CUST_ID_CLIENTE=tu_customer_id
EPAYCO_P_KEY=tu_p_key
EPAYCO_TEST=false
EPAYCO_RESPONSE_URL=https://innovatelearning.com.co/tienda/pago-finalizado
EPAYCO_CONFIRMATION_URL=https://payment.services.socketidea.com/api/webhooks/epayco
```

## Flujo de Integración

### 1. Creación de Orden con ePayco

**Request:**
```http
POST /api/orders
Content-Type: application/json

{
  "productRef": "TEST-001",
  "qty": 1,
  "provider": "epayco",
  "customer": {
    "firstName": "Armando",
    "lastName": "Avendano",
    "email": "mardoqueo951@gmail.com",
    "documentType": "CC",
    "documentNumber": "147941413",
    "phone": "573186605961",
    "birthDate": "1990-01-15"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "order": {
      "id": 123,
      "productRef": "TEST-001",
      "qty": 1,
      "status": "PENDING",
      "grandTotal": 50000,
      "currency": "COP"
    },
    "transaction": {
      "id": 456,
      "gateway": "epayco",
      "gatewayRef": "TEST-001-epayco-123-1735123456789",
      "status": "PENDING",
      "amount": 50000,
      "currency": "COP"
    },
    "epayco": {
      "publicKey": "0f4c9b5805272d273aff6a0cb7329955",
      "test": false,
      "checkoutData": {
        "name": "Curso de Prueba",
        "description": "Licencia Curso de Prueba",
        "invoice": "TEST-001-epayco-123-1735123456789",
        "currency": "cop",
        "amount": "50000",
        "tax_base": "0",
        "tax": "0",
        "tax_ico": "0",
        "country": "co",
        "lang": "es",
        "external": "false",
        "confirmation": "https://payment.services.socketidea.com/api/webhooks/epayco",
        "response": "https://innovatelearning.com.co/tienda/pago-finalizado",
        "methodsDisable": ['PSE', 'SP', 'CASH', 'DP', 'ATH'],
        "name_billing": "Armando Avendano",
        "email_billing": "mardoqueo951@gmail.com",
        "type_doc_billing": "cc",
        "number_doc_billing": "147941413",
        "mobilephone_billing": "573186605961",
        "address_billing": "Colombia"
      }
    }
  },
  "message": "Order created successfully"
}
```

### 2. Implementación en Frontend

#### HTML
```html
<script src="https://checkout.epayco.co/checkout.js"></script>
```

#### JavaScript
```javascript
// Configurar handler con la clave pública recibida
const handler = ePayco.checkout.configure({
  key: responseData.epayco.publicKey,
  test: responseData.epayco.test
});

// Abrir checkout con los datos preparados
handler.open(responseData.epayco.checkoutData);
```

### 3. Webhook de Confirmación

ePayco enviará automáticamente webhooks a la URL configurada:

**URL:** `https://payment.services.socketidea.com/api/webhooks/epayco`

**Payload de ejemplo:**
```json
{
  "x_id_factura": "TEST-001-epayco-123-1735123456789",
  "x_ref_payco": "118742",
  "x_transaction_id": "431047",
  "x_amount": "50000.00",
  "x_currency_code": "COP",
  "x_cod_transaction_state": "1",
  "x_signature": "a9b2c3d4e5f6...",
  "x_franchise": "visa",
  "x_bank_name": "BANCO DE PRUEBAS",
  "x_response": "Aceptada",
  "x_approval_code": "123456",
  "x_transaction_date": "2024-12-25 14:30:00"
}
```

## Estados de Transacción

### Mapeo de Estados ePayco

| Código ePayco | Estado Interno | Descripción |
|---------------|----------------|-------------|
| 1 | PAID | Transacción aceptada |
| 2 | FAILED | Transacción rechazada |
| 3 | PENDING | Transacción pendiente |
| 4 | FAILED | Transacción fallida |
| 6 | PENDING | Transacción reversada |
| 7 | PENDING | Transacción retenida |
| 8 | FAILED | Transacción iniciada |
| 9 | FAILED | Transacción fallida por validación |
| 10 | FAILED | Transacción fallida por datos |
| 11 | FAILED | Transacción fallida por fechas |

### Tipos de Documento Soportados

| Tipo Sistema | Tipo ePayco | Descripción |
|-------------|-------------|-------------|
| CC | cc | Cédula de ciudadanía |
| CE | ce | Cédula de extranjería |
| NIT | nit | NIT |
| PASSPORT | passport | Pasaporte |
| TI | ti | Tarjeta de identidad |

### Métodos de Pago Habilitados

- Tarjetas de crédito (Visa, Mastercard, American Express, Diners)
- PSE (Pagos Seguros en Línea)

### Métodos de Pago Deshabilitados

- SafetyPay (SP)
- Efectivo (CASH)
- Daviplata (DP)
- ATH

## Verificación de Firmas

El sistema verifica automáticamente las firmas de los webhooks utilizando:

```javascript
// Cadena de verificación
const stringToSign = [
  P_CUST_ID_CLIENTE,
  P_KEY,
  x_ref_payco,
  x_transaction_id,
  x_amount,
  x_currency_code
].join('^');

// Hash SHA256
const computed = crypto.createHash('sha256').update(stringToSign).digest('hex');
```

## Configuración de Producción vs. Desarrollo

### Desarrollo
```bash
EPAYCO_TEST=true
```

### Producción
```bash
EPAYCO_TEST=false
```

## Manejo de Errores

### Errores Comunes

1. **Configuración faltante**: Verificar que todas las variables de entorno estén configuradas
2. **Firma inválida**: Verificar P_KEY y P_CUST_ID_CLIENTE
3. **Monto inválido**: Asegurar que el monto sea un número positivo
4. **Documento inválido**: Verificar formato de documento del cliente

### Logs de Debugging

El sistema registra información detallada en los logs:

```javascript
// Business logs
logger.logBusiness('epayco:createIntent', { orderId, amount });
logger.logBusiness('epayco:webhook.received', { invoice, status });

// Error logs
logger.logError(error, { operation: 'epayco:createIntent' });
```

## Testing

### Datos de Prueba ePayco

- **Tarjeta de crédito:** 4575623182290326
- **CVV:** 123
- **Fecha:** 12/25
- **Documento:** 123456789

### Endpoint de Testing

En desarrollo, puedes usar el webhook mock:
```http
POST /api/webhooks/mock-payment/{gatewayRef}/complete
```

## Integraciones Adicionales

### Con Sistema de Facturación

Cuando un pago ePayco es exitoso:
1. Se actualiza la transacción a estado `PAID`
2. Se reserva la licencia correspondiente
3. Se genera automáticamente la factura (Siigo)
4. Se envían los emails de confirmación y licencia

### Con Lista de Espera

Si no hay licencias disponibles:
1. El cliente es agregado automáticamente a la lista de espera
2. Se envía email de notificación
3. Cuando hay licencias disponibles, se procesa automáticamente

## Monitoreo y Alertas

### Métricas Importantes

- Tasa de éxito de pagos ePayco
- Tiempo de respuesta de webhooks
- Errores de verificación de firma
- Transacciones pendientes

### Alertas Configuradas

- Webhooks fallidos consecutivos
- Firmas inválidas frecuentes
- Timeouts de respuesta ePayco

## Soporte y Troubleshooting

### Verificar Estado de Transacción

```http
GET /api/transaction-status/{transactionId}
```

### Logs de Webhook

```http
GET /api/webhooks/admin/events?provider=epayco
```

### Estadísticas de Webhooks

```http
GET /api/webhooks/admin/statistics
```
