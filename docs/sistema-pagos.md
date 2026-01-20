# Sistema de Pagos y Licencias

> **⚠️ NOTA IMPORTANTE**: Este documento proporciona una **visión general** del sistema de pagos. Para información técnica detallada y validada, consulte los documentos consolidados:
> - **[WEBHOOKS_COMPLETE.md](./WEBHOOKS_COMPLETE.md)** - Sistema de webhooks (fuente de verdad)
> - **[TRANSACTIONS_COMPLETE.md](./TRANSACTIONS_COMPLETE.md)** - Sistema de transacciones (fuente de verdad)
> 
> Este documento puede contener información general o desactualizada. Para implementación y detalles técnicos exactos, siempre consulte los documentos consolidados validados contra el código fuente.

## Descripción General

Este documento describe la implementación completa del sistema de pagos y gestión de licencias digitales de Innovate Learning. El sistema permite el procesamiento de órdenes, pagos y la entrega automática de licencias digitales a los clientes.

## Arquitectura del Sistema

### Componentes Principales

1. **Gestión de Órdenes**: Creación y seguimiento de pedidos
2. **Procesamiento de Pagos**: Integración con proveedores de pago
3. **Gestión de Licencias**: Inventario y entrega de licencias digitales
4. **Sistema de Notificaciones**: Emails de confirmación y entrega
5. **Jobs en Segundo Plano**: Cancelación automática de órdenes expiradas

### Flujo Principal de Negocio

```mermaid
graph TD
    A[Cliente inicia compra] --> B[Crear/Validar Cliente]
    B --> C[Crear Orden]
    C --> D[Crear Intención de Pago]
    D --> E[Redirigir a Gateway]
    E --> F[Cliente completa pago]
    F --> G[Webhook de confirmación]
    G --> H[Procesar pago exitoso]
    H --> I[Reservar licencia]
    I --> J[Enviar confirmación]
    J --> K[Entregar licencia por email]
```

## Modelos de Datos

### Order (Órdenes)
```javascript
{
  id: Integer (PK),
  customerId: Integer (FK -> users),
  productRef: String (FK -> products.product_ref),
  qty: Integer,
  subtotal: Integer, // en centavos
  discountTotal: Integer, // en centavos
  grandTotal: Integer, // en centavos
  status: ENUM('PENDING', 'IN_PROCESS', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELED')
}
```

### Transaction (Transacciones)
```javascript
{
  id: Integer (PK),
  orderId: Integer (FK -> orders),
  gateway: String, // 'mock', 'epayco', 'cobre'
  gatewayRef: String, // referencia externa del gateway
  amount: Integer, // en centavos
  currency: String,
  paymentMethod: String,
  status: ENUM('CREATED', 'PENDING', 'PAID', 'SETTLED', 'REFUNDED', 'REVERSED', 'FAILED'),
  meta: JSONB // metadatos adicionales del gateway
}
```

### License (Licencias)
```javascript
{
  id: Integer (PK),
  productRef: String (FK -> products.product_ref),
  licenseKey: String (UNIQUE),
  instructions: Text,
  status: ENUM('AVAILABLE', 'RESERVED', 'SOLD'),
  orderId: Integer (FK -> orders),
  reservedAt: DateTime,
  soldAt: DateTime
}
```

## API Endpoints

### Órdenes

#### Crear Orden
```http
POST /api/orders
Content-Type: application/json

{
  "productRef": "OFFICE-2024-HOME",
  "qty": 1,
  "customer": {
    "firstName": "Juan",
    "lastName": "Pérez",
    "email": "juan@email.com",
    "documentType": "CC",
    "documentNumber": "12345678",
    "phone": "+57 300 123 4567",
    "birthDate": "1990-01-01"
  }
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "order": {
      "id": 1,
      "customerId": 5,
      "productRef": "OFFICE-2024-HOME",
      "qty": 1,
      "subtotal": 29900,
      "discountTotal": 0,
      "grandTotal": 29900,
      "status": "PENDING"
    },
    "customer": {
      "id": 5,
      "firstName": "Juan",
      "lastName": "Pérez",
      "email": "juan@email.com"
    }
  }
}
```

#### Crear Intención de Pago
```http
POST /api/orders/1/payment
Content-Type: application/json

{
  "provider": "mock"
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "transactionId": 1,
    "gatewayRef": "mock-1-1735123456789",
    "redirectUrl": "https://mock-payment.example.com/pay/mock-1-1735123456789",
    "provider": "mock",
    "amount": 29900,
    "currency": "USD"
  }
}
```

### Webhooks

#### Webhook de Confirmación de Pago
```http
POST /api/webhook/mock
Content-Type: application/json

{
  "gatewayRef": "mock-1-1735123456789",
  "status": "PAID",
  "amount": 29900,
  "currency": "USD",
  "paymentMethod": "credit_card"
}
```

#### Webhook Mock para Testing
```http
POST /api/webhook/mock/complete/mock-1-1735123456789
```

## Servicios

### PaymentService

Servicio principal que orquesta todo el flujo de pagos.

#### Métodos Principales:

- `createPaymentIntent(orderId, options)`: Crea intención de pago
- `processWebhook(providerName, req)`: Procesa webhooks de confirmación
- `handlePaymentSuccess(transaction, dbTransaction)`: Maneja pagos exitosos
- `handlePaymentFailure(transaction, dbTransaction)`: Maneja fallos de pago
- `reserveLicenseForOrder(order, dbTransaction)`: Reserva licencia para orden

### OrderService

Gestiona la creación y manejo de órdenes.

#### Métodos Principales:

- `createOrder(orderData)`: Crea nueva orden con auto-creación de cliente
- `getOrCreateCustomer(customerData, transaction)`: Obtiene o crea cliente
- `calculatePricing(product, qty, discountId)`: Calcula precios con descuentos

### EmailService

Sistema de notificaciones por email.

#### Métodos Principales:

- `sendOrderConfirmation(data)`: Envía confirmación de orden
- `sendLicenseEmail(data)`: Envía licencia por email
- `renderTemplate(templateName, data)`: Renderiza plantillas de email

## Proveedores de Pago

### Arquitectura de Proveedores

El sistema utiliza un patrón de factory para soportar múltiples proveedores de pago:

```javascript
class PaymentService {
  constructor() {
    this.providers = {
      mock: new MockProvider(),
      // epayco: new EPaycoProvider(),
      // cobre: new CobreProvider()
    }
  }
}
```

### MockProvider (Desarrollo y Testing)

Proveedor simulado para desarrollo y pruebas:

```javascript
class MockProvider {
  async createIntent({ order, transaction }) {
    return {
      gatewayRef: `mock-${order.id}-${Date.now()}`,
      redirectUrl: `https://mock-payment.example.com/pay/${gatewayRef}`,
      meta: { mockProvider: true }
    }
  }

  parseWebhook(req) {
    return {
      gatewayRef: req.body.gatewayRef,
      status: req.body.status,
      amount: req.body.amount,
      currency: req.body.currency,
      paymentMethod: req.body.paymentMethod
    }
  }
}
```

### Implementación de Nuevos Proveedores

Para agregar un nuevo proveedor:

1. Crear archivo en `src/services/payment/providers/`
2. Implementar métodos requeridos:
   - `createIntent(data)`: Crear intención de pago
   - `parseWebhook(req)`: Parsear webhook
   - `refund(data)`: Procesar reembolsos
3. Registrar en PaymentService

## Jobs en Segundo Plano

### OrderTimeoutJob

Job que cancela órdenes pendientes que han expirado y retorna licencias al inventario.

#### Configuración:
- **Intervalo**: Cada 5 minutos
- **Timeout**: 30 minutos (configurable via `ORDER_TIMEOUT_MINUTES`)

#### Funcionalidad:
1. Busca órdenes con status `PENDING` creadas hace más de 30 minutos
2. Cambia status de orden a `CANCELED`
3. Cambia status de transacciones relacionadas a `FAILED`
4. Retorna licencias reservadas al inventario (status `AVAILABLE`)

### JobScheduler

Sistema simple de scheduling que maneja jobs en segundo plano:

```javascript
const jobScheduler = require('./jobs/scheduler')

// Iniciar scheduler
jobScheduler.start()

// Ejecutar job manualmente
await jobScheduler.runJob('orderTimeout')

// Obtener status
const status = jobScheduler.getStatus()
```

## Flujos de Negocio

### Flujo Completo de Compra

1. **Inicio de Compra**:
   - Cliente selecciona producto
   - Sistema valida disponibilidad de licencias

2. **Creación de Orden**:
   - Validar/crear cliente automáticamente
   - Calcular precios con descuentos aplicables
   - Crear orden con status `PENDING`

3. **Procesamiento de Pago**:
   - Crear transacción con status `CREATED`
   - Generar intención de pago con proveedor
   - Actualizar transacción a `PENDING`
   - Redirigir cliente a gateway de pago

4. **Confirmación de Pago**:
   - Recibir webhook de confirmación
   - Validar transacción y actualizar status
   - Procesar pago exitoso o fallido

5. **Entrega de Licencia**:
   - Reservar licencia disponible
   - Actualizar orden a `COMPLETED`
   - Enviar emails de confirmación y licencia

### Manejo de Errores

#### Fallos de Pago:
- Transacción marcada como `FAILED`
- Si no hay otras transacciones pendientes, orden se cancela
- Licencias reservadas retornan al inventario

#### Órdenes Expiradas:
- Job automático cancela órdenes después de 30 minutos
- Retorna licencias al inventario
- Notifica en logs de negocio

#### Errores de Email:
- No fallan el proceso de pago
- Se registran en logs para seguimiento

## Configuración

### Variables de Entorno

```bash
# Base de datos
DATABASE_URL=postgresql://user:pass@localhost:5432/payment_services

# Servidor
PORT=3000
NODE_ENV=development

# Jobs
ORDER_TIMEOUT_MINUTES=30

# Email
EMAIL_PROVIDER=log
EMAIL_FROM=noreply@innovatelearning.com.co
```

### Comandos de Desarrollo

```bash
# Iniciar servidor
npm start

# Modo desarrollo con recarga automática
npm run dev

# Ejecutar tests
npm test

# Cobertura de tests
npm run test:coverage

# Linting
npm run lint
```

## Logging y Monitoreo

### Tipos de Logs

1. **Business Logs**: Eventos de negocio importantes
   ```javascript
   logger.logBusiness('payment:success', {
     orderId: 1,
     transactionId: 1,
     customerId: 5
   })
   ```

2. **Error Logs**: Errores del sistema
   ```javascript
   logger.logError(error, {
     operation: 'createOrder',
     orderId: 1
   })
   ```

3. **System Logs**: Información del sistema
   ```javascript
   logger.info('Servidor iniciado en puerto 3000')
   ```

### Eventos de Negocio Importantes

- `order:created` - Nueva orden creada
- `payment:createIntent` - Intención de pago creada
- `payment:webhook.received` - Webhook recibido
- `payment:success` - Pago exitoso procesado
- `license:reserve` - Licencia reservada
- `order:timeout` - Orden cancelada por timeout
- `email:license` - Email de licencia enviado

## Testing

### Estructura de Tests

```
src/tests/
├── unit/
│   ├── controllers/
│   ├── services/
│   └── models/
├── integration/
└── e2e/
```

### Tests de Flujo Completo

```javascript
// Ejemplo de test del flujo completo
describe('Complete Order Flow', () => {
  it('should process order from creation to license delivery', async () => {
    // 1. Crear orden
    const order = await createTestOrder()
    
    // 2. Crear intención de pago
    const payment = await paymentService.createPaymentIntent(order.id)
    
    // 3. Simular webhook exitoso
    const webhook = await paymentService.processWebhook('mock', mockWebhookData)
    
    // 4. Verificar orden completada y licencia asignada
    expect(webhook.status).toBe('processed')
    
    const updatedOrder = await Order.findByPk(order.id)
    expect(updatedOrder.status).toBe('COMPLETED')
  })
})
```

## Despliegue

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3000
CMD ["node", "src/app.js"]
```

### Docker Compose

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/payment_services
    depends_on:
      - db
  
  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=payment_services
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

## Próximos Pasos

### Mejoras Planificadas

1. **Proveedores Reales**:
   - Implementar EPayco provider
   - Implementar Cobre provider
   - Agregar soporte para PSE

2. **Funcionalidades Avanzadas**:
   - Reembolsos automáticos
   - Pagos en cuotas
   - Múltiples métodos de pago por orden

3. **Monitoreo**:
   - Dashboard de métricas
   - Alertas por fallos de pago
   - Reportes de ventas

4. **Seguridad**:
   - Rate limiting en APIs
   - Validación de webhooks con firmas
   - Encriptación de datos sensibles

---

**Versión**: 1.0  
**Última actualización**: Junio 2025  
**Mantenedores**: Equipo Innovate Learning

## Flujo de Pago y Licencias

### Procesamiento de Pagos Exitosos

Cuando un pago es exitoso (webhook `PAID`):

1. **Actualización de Transacción**
   - Status: `PAID`
   - Metadata: Información del webhook

2. **Actualización de Orden**
   - Status: `IN_PROCESS` → `COMPLETED`

3. **Reserva de Licencia** (solo para productos digitales)
   - Busca licencia `AVAILABLE` para el producto
   - Cambia status a `SOLD`
   - Asigna `orderId` y `soldAt`

4. **Envío de Emails**
   - Email de confirmación de orden
   - Email con licencia (para productos digitales)

### Manejo de Pagos Fallidos

Cuando un pago falla (webhook `FAILED`, `REJECTED`, `CANCELLED`):

1. **Actualización de Transacción**
   - Status: `FAILED`
   - Metadata: Información del webhook

2. **Verificación de Otras Transacciones**
   - Si no hay otras transacciones pendientes: orden se cancela
   - Si hay otras transacciones pendientes: orden sigue `PENDING`

3. **Liberación de Licencias**
   - Solo si la orden se cancela
   - Licencias `SOLD` vuelven a `AVAILABLE`

### Timeout de Órdenes

#### Configuración
```bash
ORDER_TIMEOUT_MINUTES=30  # 30 minutos por defecto
```

#### Proceso Automático
- **Frecuencia**: Cada 10 minutos
- **Búsqueda**: Órdenes `PENDING` creadas hace más de 30 minutos
- **Acción**: Cancelación automática

#### Liberación de Licencias en Timeout
```javascript
// Solo libera licencias si la orden tenía licencias reservadas
const reservedLicenses = await License.findAll({
  where: {
    orderId: order.id,
    status: { [Op.in]: ['RESERVED', 'SOLD'] }
  }
})

// Libera las licencias
await license.update({
  status: 'AVAILABLE',
  orderId: null,
  soldAt: null
})
```

**Nota**: En el flujo normal, las licencias solo se reservan cuando el pago es exitoso. Si una orden expira por timeout, generalmente no tiene licencias reservadas que liberar.

### Estados de Licencias

```javascript
status: {
  type: DataTypes.ENUM('AVAILABLE', 'RESERVED', 'SOLD', 'ANNULLED', 'RETURNED'),
  defaultValue: 'AVAILABLE'
}
```

#### Flujo de Estados
1. **AVAILABLE**: Licencia disponible para venta
2. **SOLD**: Licencia vendida (se asigna al pago exitoso)
3. **ANNULLED**: Licencia anulada por admin
4. **RETURNED**: Licencia devuelta al stock

**Nota**: El estado `RESERVED` no se usa en el flujo actual. Las licencias van directamente de `AVAILABLE` a `SOLD` cuando el pago es exitoso.

### Casos de Liberación de Licencias SOLD

Las licencias `SOLD` solo se liberan en casos excepcionales:

#### 1. Errores del Sistema
- Pago exitoso → Licencia `SOLD`
- Error posterior en el sistema
- Orden queda en estado inconsistente
- Timeout libera la licencia

#### 2. Múltiples Transacciones
- Cliente intenta pagar varias veces
- Una transacción falla, otra funciona
- Sistema libera licencias de transacciones fallidas

#### 3. Cancelación Manual
- Admin cancela orden manualmente
- Libera licencias `SOLD` asociadas

#### 4. Timeout de Orden
- Orden expira sin pago exitoso
- Si tenía licencias `SOLD` (caso raro), las libera

### Ejemplos de Flujo

#### Flujo Exitoso
```
1. Cliente crea orden → Licencia: AVAILABLE
2. Cliente paga → Webhook PAID
3. Sistema reserva licencia → Licencia: SOLD
4. Orden completada → Status: COMPLETED
5. Email enviado con licencia
```

#### Flujo con Timeout
```
1. Cliente crea orden → Licencia: AVAILABLE
2. Cliente no paga en 30 minutos
3. Sistema cancela orden → Licencia: Sigue AVAILABLE
4. Orden cancelada → Status: CANCELED
```

#### Flujo con Error
```
1. Cliente crea orden → Licencia: AVAILABLE
2. Cliente paga → Webhook PAID
3. Sistema reserva licencia → Licencia: SOLD
4. Error en el sistema → Orden queda PENDING
5. Timeout después de 30 minutos → Libera licencia
6. Licencia vuelve a AVAILABLE
```