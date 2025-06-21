# Sistema de Licencias - Guía Completa

## Resumen

El sistema de licencias maneja la reserva y asignación de licencias para productos digitales. Las licencias se reservan **solo cuando el pago es exitoso**, no al crear la orden.

## Estados de Licencias

```javascript
status: {
  type: DataTypes.ENUM('AVAILABLE', 'RESERVED', 'SOLD', 'ANNULLED', 'RETURNED'),
  defaultValue: 'AVAILABLE'
}
```

### Descripción de Estados

| Estado | Descripción | Cuándo se Asigna |
|--------|-------------|------------------|
| `AVAILABLE` | Licencia disponible para venta | Estado inicial, después de liberación |
| `SOLD` | Licencia vendida y asignada | Cuando el pago es exitoso |
| `ANNULLED` | Licencia anulada por admin | Cancelación manual |
| `RETURNED` | Licencia devuelta al stock | Devolución manual |
| `RESERVED` | **No se usa en el flujo actual** | - |

## Flujo de Reserva de Licencias

### 1. Creación de Orden
```javascript
// Cliente crea orden para producto digital
// Licencia: Sigue AVAILABLE (NO se reserva)
// Estado de orden: PENDING
```

### 2. Pago Exitoso (Webhook PAID)
```javascript
// Cliente paga exitosamente
// Sistema recibe webhook de confirmación
// Licencia: AVAILABLE → SOLD (se reserva AHORA)
// Estado de orden: COMPLETED
```

### 3. Timeout de Orden (30 minutos)
```javascript
// Cliente no paga en 30 minutos
// Sistema cancela orden
// Licencia: Sigue AVAILABLE (nunca se reservó)
// Estado de orden: CANCELED
```

## Cuándo se Liberan las Licencias SOLD

**Las licencias SOLD solo se liberan en casos excepcionales:**

### 1. Errores del Sistema
```javascript
// Secuencia de eventos:
// 1. Pago exitoso → Licencia SOLD
// 2. Error posterior en el sistema
// 3. Orden queda en estado inconsistente
// 4. Timeout después de 30 minutos → Libera licencia
```

### 2. Múltiples Transacciones
```javascript
// Secuencia de eventos:
// 1. Cliente intenta pagar varias veces
// 2. Una transacción falla, otra funciona
// 3. Sistema libera licencias de transacciones fallidas
```

### 3. Cancelación Manual
```javascript
// Secuencia de eventos:
// 1. Admin cancela orden manualmente
// 2. Sistema libera licencias SOLD asociadas
```

## Configuración del Sistema

### Variables de Entorno
```bash
# Tiempo antes de cancelar órdenes sin pago
ORDER_TIMEOUT_MINUTES=30

# Job se ejecuta cada 10 minutos
# Configurado en src/jobs/scheduler.js
```

### Job de Timeout
```javascript
// src/jobs/orderTimeout.js
class OrderTimeoutJob {
  constructor() {
    this.timeoutMinutes = process.env.ORDER_TIMEOUT_MINUTES || 30
  }
  
  // Se ejecuta cada 10 minutos
  getCronConfig() {
    return {
      cronTime: '*/10 * * * *'  // Every 10 minutes
    }
  }
}
```

## Ejemplos Prácticos

### Ejemplo 1: Venta Exitosa
```
Cliente: "Quiero el curso avanzado"
Sistema: Crea orden #8, licencia sigue AVAILABLE

Cliente: Paga exitosamente
Sistema: Recibe webhook PAID
Sistema: Licencia #19 → SOLD, asignada a orden #8
Sistema: Orden #8 → COMPLETED
Sistema: Envía email con licencia

Resultado: Licencia #19 nunca se libera (ya es del cliente)
```

### Ejemplo 2: Cliente No Paga
```
Cliente: "Quiero el curso avanzado"
Sistema: Crea orden #9, licencia sigue AVAILABLE

Cliente: No paga en 30 minutos
Sistema: Cancela orden #9
Sistema: Licencia sigue AVAILABLE (nunca se reservó)

Resultado: Licencia disponible para otros clientes
```

### Ejemplo 3: Error del Sistema
```
Cliente: "Quiero el curso avanzado"
Sistema: Crea orden #10, licencia sigue AVAILABLE

Cliente: Paga exitosamente
Sistema: Recibe webhook PAID
Sistema: Licencia #20 → SOLD, asignada a orden #10
Sistema: Error en el sistema
Sistema: Orden #10 queda en PENDING

30 minutos después:
Sistema: Timeout detecta orden #10 expirada
Sistema: Cancela orden #10
Sistema: Licencia #20 → AVAILABLE (liberada)

Resultado: Licencia #20 vuelve al stock
```

## Logs Importantes

### Reserva de Licencia
```javascript
[20:25:26.350] info: TransactionHandler: License reserved
{
  "licenseId": 19,
  "orderId": 8,
  "productRef": "CURSO-AVANZADO"
}
```

### Liberación de Licencia
```javascript
[20:55:26.350] info: order:timeout.processed
{
  "orderId": 8,
  "licensesReturned": 1
}
```

### Timeout de Orden
```javascript
[20:55:26.350] info: order:timeout
{
  "orderId": 8,
  "customerId": 5,
  "productRef": "CURSO-AVANZADO"
}
```

## Preguntas Frecuentes

### ¿Por qué no se reservan las licencias al crear la orden?
**Respuesta**: Para evitar bloquear licencias para clientes que no pagan. Si se reservaran al crear la orden, las licencias quedarían bloqueadas por 30 minutos sin garantía de pago.

### ¿Qué pasa si se agotan las licencias?
**Respuesta**: El sistema mostrará "No available licenses" y no permitirá crear más órdenes para ese producto.

### ¿Se pueden liberar licencias manualmente?
**Respuesta**: Sí, los administradores pueden:
- Cancelar órdenes manualmente
- Anular licencias específicas
- Devolver licencias al stock

### ¿Cuánto tiempo espera el sistema antes de liberar licencias?
**Respuesta**: 30 minutos por defecto, configurable con `ORDER_TIMEOUT_MINUTES`.

## Monitoreo y Debugging

### Verificar Estado de Licencias
```sql
-- Ver todas las licencias de un producto
SELECT id, status, orderId, soldAt 
FROM licenses 
WHERE productRef = 'CURSO-AVANZADO';

-- Ver licencias vendidas
SELECT id, orderId, soldAt 
FROM licenses 
WHERE status = 'SOLD';

-- Ver licencias disponibles
SELECT COUNT(*) as available 
FROM licenses 
WHERE status = 'AVAILABLE' AND productRef = 'CURSO-AVANZADO';
```

### Verificar Órdenes con Licencias
```sql
-- Ver órdenes que tienen licencias asignadas
SELECT o.id, o.status, l.id as licenseId, l.status as licenseStatus
FROM orders o
JOIN licenses l ON o.id = l.orderId
WHERE o.productRef = 'CURSO-AVANZADO';
```

### Logs de Debugging
```bash
# Buscar logs de reserva de licencias
grep "License reserved" logs/app.log

# Buscar logs de timeout
grep "order:timeout" logs/app.log

# Buscar logs de liberación
grep "licensesReturned" logs/app.log
```

## Configuración Avanzada

### Cambiar Tiempo de Timeout
```bash
# En .env
ORDER_TIMEOUT_MINUTES=15  # 15 minutos en lugar de 30
```

### Cambiar Frecuencia del Job
```javascript
// En src/jobs/scheduler.js
case 'orderTimeout':
  intervalMs = 5 * 60 * 1000  // 5 minutos en lugar de 10
  break
```

### Agregar Notificaciones
```javascript
// En src/jobs/orderTimeout.js
if (reservedLicenses.length > 0) {
  // Notificar a admin sobre licencias liberadas
  await notifyAdmin({
    type: 'LICENSES_LIBERATED',
    orderId: order.id,
    licensesCount: reservedLicenses.length
  })
}
```

---

**Versión**: 1.0  
**Última actualización**: Junio 2025  
**Mantenedores**: Equipo Innovate Learning