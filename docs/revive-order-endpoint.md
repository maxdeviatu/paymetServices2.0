# Endpoint: Revivir Órdenes Canceladas

## Descripción

El endpoint `POST /orders/{orderId}/revive` permite revivir una orden que ha sido cancelada o está pendiente, asignando una licencia disponible, enviando el email correspondiente y marcando la orden como completada.

## URL

```
POST /orders/{orderId}/revive
```

## Autenticación

Requiere autenticación con token Bearer y rol `EDITOR` o superior.

## Headers

```
Authorization: Bearer <token>
Content-Type: application/json
```

## Parámetros de URL

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `orderId` | number | ID de la orden a revivir |

## Body

```json
{
  "reason": "CUSTOMER_REQUEST"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `reason` | string | No | Razón de la revivificación (default: "MANUAL") |

## Flujo del Proceso

1. **Validación de la orden**
   - Verifica que la orden existe
   - Valida que esté en estado `CANCELED` o `PENDING`
   - Confirma que tenga transacciones asignadas

2. **Validación de transacciones**
   - Busca una transacción válida (CREATED, PENDING, PAID)
   - Verifica que la transacción esté asociada a la orden

3. **Asignación de licencia**
   - Identifica el producto de la orden
   - Busca una licencia disponible para el producto
   - Asigna la licencia a la orden (status: SOLD)

4. **Envío de email**
   - Envía email con la licencia al cliente
   - Registra el envío en los logs

5. **Actualización de estados**
   - Cambia el estado de la orden a `COMPLETED`
   - Actualiza la transacción a `PAID` si no lo está
   - Agrega metadata de revivificación

## Respuesta Exitosa

**Status:** `200 OK`

```json
{
  "success": true,
  "data": {
    "orderId": 123,
    "transactionId": 456,
    "status": "COMPLETED",
    "licenseAssigned": true,
    "emailSent": true,
    "revivedAt": "2025-07-30T04:45:00.000Z",
    "reason": "CUSTOMER_REQUEST",
    "adminId": 1
  },
  "message": "Order revived successfully"
}
```

## Posibles Errores

### 404 - Orden no encontrada
```json
{
  "success": false,
  "message": "Order not found"
}
```

### 409 - Orden no está cancelada o pendiente
```json
{
  "success": false,
  "message": "Cannot revive order with status COMPLETED. Order must be CANCELED or PENDING"
}
```

### 409 - No hay licencias disponibles
```json
{
  "success": false,
  "message": "No available licenses for product PROD-001"
}
```

### 400 - No hay transacciones válidas
```json
{
  "success": false,
  "message": "No valid transaction found for this order"
}
```

### 500 - Error interno
```json
{
  "success": false,
  "message": "Internal server error"
}
```

## Ejemplos de Uso

### cURL
```bash
curl -X POST \
  http://localhost:3000/orders/123/revive \
  -H 'Authorization: Bearer your-token-here' \
  -H 'Content-Type: application/json' \
  -d '{
    "reason": "CUSTOMER_REQUEST"
  }'
```

### JavaScript (Axios)
```javascript
const axios = require('axios');

const response = await axios.post(
  'http://localhost:3000/orders/123/revive',
  {
    reason: 'CUSTOMER_REQUEST'
  },
  {
    headers: {
      'Authorization': 'Bearer your-token-here',
      'Content-Type': 'application/json'
    }
  }
);

console.log(response.data);
```

### Node.js Test Script
```bash
# Usar el script de prueba incluido
node test-revive-order.js 123 "CUSTOMER_REQUEST"
```

## Logs y Auditoría

El endpoint registra todos los eventos importantes:

- `order:revive` - Inicio del proceso
- `order:revive.licenseAssigned` - Licencia asignada
- `order:revive.emailSent` - Email enviado
- `order:revive.success` - Proceso completado exitosamente

## Metadata Agregada

### En la Orden
```json
{
  "meta": {
    "revived": {
      "revivedAt": "2025-07-30T04:45:00.000Z",
      "reason": "CUSTOMER_REQUEST",
      "adminId": 1,
      "emailSent": true,
      "licenseAssigned": true
    }
  }
}
```

### En la Transacción
```json
{
  "meta": {
    "revived": {
      "revivedAt": "2025-07-30T04:45:00.000Z",
      "reason": "CUSTOMER_REQUEST",
      "adminId": 1
    }
  }
}
```

## Consideraciones de Seguridad

- Solo usuarios con rol `EDITOR` o superior pueden usar este endpoint
- Se registra el ID del administrador que realiza la acción
- Se valida que la orden esté realmente cancelada antes de revivirla
- Se verifica la disponibilidad de licencias antes de asignarlas

## Casos de Uso Comunes

1. **Solicitud del cliente**: El cliente contacta para reactivar una orden cancelada
2. **Error en el sistema**: Una orden se canceló incorrectamente por un error
3. **Pago manual**: El cliente realizó el pago por otro medio
4. **Corrección administrativa**: Necesidad de corregir un estado incorrecto
5. **Órdenes pendientes**: Órdenes que se quedaron en estado PENDING por problemas técnicos
6. **Timeout manual**: Órdenes que necesitan ser completadas manualmente después de un timeout

## Dependencias

- Servicio de licencias para asignación
- Servicio de email para envío de licencias
- TransactionManager para transacciones de base de datos
- Sistema de logging para auditoría 