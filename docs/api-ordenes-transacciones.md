# API de Órdenes y Transacciones - Guía de Testing

## Descripción General

Esta documentación describe cómo usar y probar el sistema de órdenes y transacciones usando Postman. El sistema permite crear órdenes, procesar pagos y gestionar licencias digitales de forma automática.

**IMPORTANTE**: Los endpoints principales para crear órdenes y pagos son **públicos** (no requieren autenticación), lo que permite a cualquier cliente crear órdenes. El sistema incluye medidas de seguridad como rate limiting y validación exhaustiva.

## Configuración Inicial

### 1. Variables de Entorno en Postman

Crear las siguientes variables en Postman:

```
base_url = http://localhost:3000
api_url = {{base_url}}/api
```

### 2. Autenticación (Solo para Endpoints Administrativos)

Los endpoints administrativos requieren autenticación JWT. Solo es necesario para consultas administrativas y gestión de órdenes:

#### Login de Administrador
```http
POST {{api_url}}/admins/login
Content-Type: application/json

{
  "email": "superadmin@innovatelearning.com.co",
  "password": "SuperAdmin2024!"
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "admin": {
      "id": 1,
      "name": "Super Administrador",
      "email": "superadmin@innovatelearning.com.co",
      "role": "SUPER_ADMIN"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Configurar Token en Postman:**
1. Ir a la pestaña "Tests" de la request
2. Agregar este script:
```javascript
if (pm.response.code === 200) {
    const response = pm.response.json();
    pm.environment.set("auth_token", response.data.token);
}
```

### 3. Header de Autorización

Para todas las requests protegidas, agregar el header:
```
Authorization: Bearer {{auth_token}}
```

## Seguridad y Rate Limiting

### Medidas de Seguridad Implementadas

1. **Rate Limiting**:
   - Creación de órdenes: 10 por IP cada 15 minutos
   - Iniciación de pagos: 5 por IP cada 5 minutos
   - Consultas generales: 100 por IP cada 15 minutos
   - Webhooks: 50 por IP cada minuto

2. **Validación de Entrada**:
   - Sanitización automática de input
   - Validación exhaustiva de todos los campos
   - Límites de longitud y formato

3. **Headers de Seguridad**:
   - Helmet.js para headers de seguridad
   - CORS configurado apropiadamente
   - Protección XSS y CSRF

### Manejo de Rate Limits

Si excedes los límites, recibirás una respuesta 429:

```json
{
  "success": false,
  "message": "Demasiadas órdenes creadas desde esta IP. Intenta nuevamente en 15 minutos.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 900
}
```

## Flujo Completo de Órdenes y Transacciones

### Paso 1: Verificar Productos Disponibles

Antes de crear una orden, verifica qué productos tienen licencias disponibles:

```http
GET {{api_url}}/products
```

**Nota**: Este endpoint es público y no requiere autenticación.

**Respuesta de ejemplo:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Microsoft Office 2024 Home",
      "productRef": "OFFICE-2024-HOME",
      "price": 29900,
      "currency": "USD",
      "licenseType": true,
      "isActive": true,
      "availableLicenses": 5
    }
  ]
}
```

### Paso 2: Crear una Orden (Endpoint Público)

```http
POST {{api_url}}/orders
Content-Type: application/json

{
  "productRef": "OFFICE-2024-HOME",
  "qty": 1,
  "customer": {
    "firstName": "Juan Carlos",
    "lastName": "Pérez Rodríguez",
    "email": "juan.perez@email.com",
    "documentType": "CC",
    "documentNumber": "12345678",
    "phone": "+57 300 123 4567",
    "birthDate": "1990-01-15"
  }
}
```

**IMPORTANTE**: 
- Este endpoint es **público** y **NO requiere autenticación**
- Está protegido por rate limiting (10 órdenes por IP cada 15 minutos)
- Incluye validación exhaustiva de datos de entrada

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "orderId": 1,
    "customerId": 1,
    "transactionId": 1,
    "productRef": "OFFICE-2024-HOME",
    "qty": 1,
    "subtotal": 29900,
    "discountTotal": 0,
    "taxTotal": 0,
    "grandTotal": 29900,
    "currency": "USD",
    "status": "PENDING",
    "provider": "mock"
  }
}
```

### Validaciones de Entrada

El sistema valida exhaustivamente todos los campos:

**Campos del Cliente:**
- `firstName`: 2-80 caracteres, solo letras y espacios
- `lastName`: 2-80 caracteres, solo letras y espacios  
- `email`: Formato válido, max 120 caracteres
- `documentType`: CC, CE, NIT, TI, PP
- `documentNumber`: 5-30 caracteres, números/letras/guiones
- `phone`: Formato internacional válido (opcional)
- `birthDate`: Formato YYYY-MM-DD, edad 13-120 años (opcional)

**Campos del Producto:**
- `productRef`: 3-50 caracteres, letras mayúsculas/números/guiones
- `qty`: Entero entre 1 y 10

**Errores de Validación:**
```json
{
  "success": false,
  "message": "Datos de entrada inválidos",
  "errors": [
    {
      "field": "customer.email",
      "message": "email debe ser válido",
      "value": "email-invalido"
    }
  ]
}
```

**Guardar Order ID en Postman:**
```javascript
if (pm.response.code === 201) {
    const response = pm.response.json();
    pm.environment.set("order_id", response.data.orderId);
    pm.environment.set("customer_id", response.data.customerId);
    pm.environment.set("transaction_id", response.data.transactionId);
}
```

### Paso 3: Crear Intención de Pago (Endpoint Público)

```http
POST {{api_url}}/orders/{{order_id}}/payment
Content-Type: application/json

{
  "provider": "mock"
}
```

**IMPORTANTE**: 
- Este endpoint es **público** y **NO requiere autenticación**
- Está protegido por rate limiting (5 pagos por IP cada 5 minutos)
- Más restrictivo que la creación de órdenes para prevenir abuso

**Respuesta:**
```json
{
  "success": true,
  "message": "Payment intent created successfully",
  "data": {
    "transactionId": 1,
    "gatewayRef": "mock-1-1735876543210",
    "paymentUrl": "https://mock-payment.example.com/pay/mock-1-1735876543210",
    "provider": "mock",
    "amount": 29900,
    "currency": "USD"
  }
}
```

**Guardar datos de transacción:**
```javascript
if (pm.response.code === 200) {
    const response = pm.response.json();
    pm.environment.set("transaction_id", response.data.transactionId);
    pm.environment.set("gateway_ref", response.data.gatewayRef);
}
```

### Paso 4: Verificar Estado de la Orden (Endpoint Público)

```http
GET {{api_url}}/orders/{{order_id}}
```

**IMPORTANTE**: 
- Este endpoint es **público** y **NO requiere autenticación**
- Protegido con slow-down (retraso gradual después de 5 consultas por IP)
- Permite a los clientes verificar el estado de sus órdenes

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "customerId": 1,
    "productRef": "OFFICE-2024-HOME",
    "qty": 1,
    "subtotal": 29900,
    "discountTotal": 0,
    "grandTotal": 29900,
    "status": "PENDING",
    "customer": {
      "id": 1,
      "firstName": "Juan Carlos",
      "lastName": "Pérez Rodríguez",
      "email": "juan.perez@email.com"
    },
    "product": {
      "id": 1,
      "name": "Microsoft Office 2024 Home",
      "productRef": "OFFICE-2024-HOME"
    },
    "transactions": [
      {
        "id": 1,
        "gateway": "mock",
        "gatewayRef": "mock-1-1735876543210",
        "amount": 29900,
        "currency": "USD",
        "status": "PENDING"
      }
    ]
  }
}
```

### Paso 5: Simular Pago Exitoso (Webhook Mock - Endpoint Público)

```http
POST {{api_url}}/webhook/mock-payment/{{gateway_ref}}/complete
Content-Type: application/json
```

**IMPORTANTE**: 
- Este endpoint es **público** (webhooks no requieren autenticación)
- Protegido por rate limiting específico para webhooks (50 por minuto por IP)
- Solo disponible en modo desarrollo

**Respuesta:**
```json
{
  "success": true,
  "message": "Pago simulado completado exitosamente",
  "data": {
    "gatewayRef": "mock-1-1735876543210",
    "status": "PAID",
    "orderId": 1,
    "transactionId": 1
  }
}
```

### Paso 6: Verificar Orden Completada

```http
GET {{api_url}}/orders/{{order_id}}
Authorization: Bearer {{auth_token}}
```

**Respuesta después del pago:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "COMPLETED",
    "customer": { ... },
    "product": { ... },
    "transactions": [
      {
        "id": 1,
        "status": "PAID",
        "paymentMethod": "credit_card"
      }
    ],
    "license": {
      "id": 1,
      "licenseKey": "OFFICE-HOME-ABC123-DEF456-GHI789",
      "status": "SOLD",
      "soldAt": "2025-06-14T05:46:15.123Z"
    }
  }
}
```

## Endpoints Detallados

### 1. Endpoints Públicos (Sin Autenticación)

#### Crear Orden
```http
POST {{api_url}}/orders
Content-Type: application/json
Rate Limit: 10 por IP cada 15 minutos

{
  "productRef": "PRODUCT-REF",
  "qty": 1,
  "customer": { ... }
}
```

#### Crear Intención de Pago
```http
POST {{api_url}}/orders/{orderId}/payment
Content-Type: application/json
Rate Limit: 5 por IP cada 5 minutos

{
  "provider": "mock"
}
```

#### Consultar Orden
```http
GET {{api_url}}/orders/{orderId}
Rate Limit: Con slow-down después de 5 consultas
```

#### Consultar Órdenes de Cliente
```http
GET {{api_url}}/orders/customer/{customerId}
Rate Limit: Con slow-down después de 5 consultas

Query Parameters:
- page: Número de página (default: 1)
- limit: Elementos por página (default: 20, max: 50)
- status: Filtrar por estado
```

#### Consultar Estado de Transacción
```http
GET {{api_url}}/orders/transactions/{transactionId}/status
```

#### Webhooks de Pago
```http
POST {{api_url}}/webhook/payment/{provider}
Rate Limit: 50 por IP cada minuto
```

### 2. Endpoints Administrativos (Requieren Autenticación)

#### Listar Todas las Órdenes (Admin)
```http
GET {{api_url}}/orders
Authorization: Bearer {{auth_token}}
Rol Requerido: READ_ONLY o superior
```

**Query Parameters:**
- `page`: Número de página (default: 1)
- `limit`: Elementos por página (default: 20, max: 50)
- `status`: Filtrar por estado (PENDING, IN_PROCESS, SHIPPED, DELIVERED, COMPLETED, CANCELED)
- `customerId`: Filtrar por cliente
- `productRef`: Filtrar por producto
- `startDate`: Fecha inicio (YYYY-MM-DD)
- `endDate`: Fecha fin (YYYY-MM-DD)

**Ejemplo:**
```http
GET {{api_url}}/orders?status=COMPLETED&startDate=2025-06-01&endDate=2025-06-30&page=1&limit=10
Authorization: Bearer {{auth_token}}
```

#### Actualizar Estado de Orden (Admin)
```http
PUT {{api_url}}/orders/{orderId}/status
Authorization: Bearer {{auth_token}}
Content-Type: application/json
Rol Requerido: EDITOR o superior

{
  "status": "SHIPPED"
}
```

**Estados válidos:**
- `PENDING`: Orden creada, esperando pago
- `IN_PROCESS`: Pago recibido, procesando
- `SHIPPED`: Enviado (para productos físicos)
- `DELIVERED`: Entregado
- `COMPLETED`: Completado (licencias entregadas)
- `CANCELED`: Cancelado

#### Cancelar Orden (Admin)
```http
POST {{api_url}}/orders/{orderId}/cancel
Authorization: Bearer {{auth_token}}
Content-Type: application/json
Rol Requerido: EDITOR o superior

{
  "reason": "CUSTOMER_REQUEST"
}
```

#### Revivir Orden Cancelada (Admin)
```http
POST {{api_url}}/orders/{orderId}/revive
Authorization: Bearer {{auth_token}}
Content-Type: application/json
Rol Requerido: EDITOR o superior

{
  "reason": "CUSTOMER_REQUEST"
}
```

**Descripción:** Revive una orden cancelada o pendiente asignando una licencia disponible, enviando el email correspondiente y marcando la orden como completada.

**Flujo del proceso:**
1. Valida que la orden esté en estado `CANCELED` o `PENDING`
2. Verifica que tenga transacciones asignadas
3. Busca una licencia disponible para el producto
4. Asigna la licencia a la orden
5. Envía email con la licencia
6. Cambia el estado de la orden a `COMPLETED`
7. Actualiza la transacción a `PAID`

**Respuesta exitosa:**
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

**Posibles errores:**
- `404`: Orden no encontrada
- `409`: Orden no está cancelada o pendiente / No hay licencias disponibles
- `400`: No hay transacciones válidas
- `500`: Error interno del servidor

### 2. Gestión de Transacciones

#### Obtener Estado de Transacción
```http
GET {{api_url}}/transactions/{{transaction_id}}/status
Authorization: Bearer {{auth_token}}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "orderId": 1,
    "gateway": "mock",
    "gatewayRef": "mock-1-1735876543210",
    "amount": 29900,
    "currency": "USD",
    "status": "PAID",
    "paymentMethod": "credit_card",
    "createdAt": "2025-06-14T05:45:30.000Z",
    "updatedAt": "2025-06-14T05:46:15.000Z"
  }
}
```

### 3. Webhooks para Testing

#### Webhook Manual (Mock)
```http
POST {{api_url}}/webhook/mock
Content-Type: application/json

{
  "gatewayRef": "mock-1-1735876543210",
  "status": "PAID",
  "amount": 29900,
  "currency": "USD",
  "paymentMethod": "credit_card",
  "transactionId": "ext-123456789"
}
```

#### Webhook Directo de Completar Pago
```http
POST {{api_url}}/webhook/mock/complete/{{gateway_ref}}
```

#### Webhook de Fallo de Pago
```http
POST {{api_url}}/webhook/mock
Content-Type: application/json

{
  "gatewayRef": "mock-1-1735876543210",
  "status": "FAILED",
  "amount": 29900,
  "currency": "USD",
  "errorCode": "insufficient_funds",
  "errorMessage": "Fondos insuficientes"
}
```

## Casos de Prueba

### Caso 1: Flujo Exitoso Completo

1. **Crear orden** → `POST /orders`
2. **Crear pago** → `POST /orders/{id}/payment`
3. **Completar pago** → `POST /webhook/mock/complete/{gateway_ref}`
4. **Verificar resultado** → `GET /orders/{id}`

**Resultado esperado:**
- Orden en estado `COMPLETED`
- Transacción en estado `PAID`
- Licencia asignada y enviada por email

### Caso 2: Pago Fallido

1. **Crear orden** → `POST /orders`
2. **Crear pago** → `POST /orders/{id}/payment`
3. **Simular fallo** → `POST /webhook/mock` (con status FAILED)
4. **Verificar resultado** → `GET /orders/{id}`

**Resultado esperado:**
- Orden en estado `CANCELED`
- Transacción en estado `FAILED`
- Licencia devuelta al inventario

### Caso 3: Timeout de Orden

1. **Crear orden** → `POST /orders`
2. **Esperar 30+ minutos** (o cambiar `ORDER_TIMEOUT_MINUTES`)
3. **Ejecutar job manualmente** → Job scheduler automático
4. **Verificar resultado** → `GET /orders/{id}`

**Resultado esperado:**
- Orden en estado `CANCELED`
- Licencias devueltas al inventario

### Caso 4: Cliente Existente

1. **Crear primera orden** con cliente nuevo
2. **Crear segunda orden** con mismo email/documento
3. **Verificar** que se reutiliza el mismo cliente

### Caso 5: Sin Licencias Disponibles

1. **Agotar licencias** de un producto
2. **Intentar crear orden** para ese producto
3. **Verificar error** apropiado

## Códigos de Error Comunes

### 400 - Bad Request
```json
{
  "success": false,
  "message": "Datos de entrada inválidos",
  "errors": [
    {
      "field": "customer.email",
      "message": "Email inválido"
    }
  ]
}
```

### 404 - Not Found
```json
{
  "success": false,
  "message": "Orden no encontrada"
}
```

### 409 - Conflict
```json
{
  "success": false,
  "message": "No hay licencias disponibles para este producto"
}
```

### 500 - Internal Server Error
```json
{
  "success": false,
  "message": "Error interno del servidor"
}
```

## Colección de Postman

### Variables de Entorno Recomendadas

```json
{
  "base_url": "http://localhost:3000",
  "api_url": "{{base_url}}/api",
  "auth_token": "",
  "order_id": "",
  "customer_id": "",
  "transaction_id": "",
  "gateway_ref": "",
  "customer_email": "test@example.com"
}
```

### Estructura de Carpetas Recomendada

```
Payment Services API/
├── 📁 Public Endpoints/
│   ├── 🟢 Create Order
│   ├── 🟢 Create Payment Intent
│   ├── 🟢 Get Order Status
│   ├── 🟢 Get Customer Orders
│   ├── 🟢 Get Transaction Status
│   └── 🟢 Mock Payment Complete
├── 📁 Admin Endpoints/
│   ├── 🔐 Admin Login
│   ├── 🔐 List All Orders
│   ├── 🔐 Update Order Status
│   └── 🔐 Cancel Order
├── 📁 Test Flows/
│   ├── 🔄 Complete Order Flow
│   ├── 🔄 Failed Payment Flow
│   └── 🔄 Rate Limiting Tests
└── 📁 Health Checks/
    └── ⚡ Health Check
```

### Scripts de Test Automáticos

#### Para Login de Admin:
```javascript
pm.test("Login successful", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.expect(response.success).to.be.true;
    pm.environment.set("auth_token", response.data.token);
});
```

#### Para Crear Orden:
```javascript
pm.test("Order created successfully", function () {
    pm.response.to.have.status(201);
    const response = pm.response.json();
    pm.expect(response.success).to.be.true;
    pm.expect(response.data.status).to.equal("PENDING");
    pm.environment.set("order_id", response.data.orderId);
    pm.environment.set("customer_id", response.data.customerId);
    pm.environment.set("transaction_id", response.data.transactionId);
});
```

#### Para Validación de Entrada:
```javascript
pm.test("Validation errors handled properly", function () {
    if (pm.response.code === 400) {
        const response = pm.response.json();
        pm.expect(response.success).to.be.false;
        pm.expect(response.message).to.include("inválidos");
        pm.expect(response.errors).to.be.an('array');
    }
});
```

#### Para Rate Limiting:
```javascript
pm.test("Rate limit handled", function () {
    if (pm.response.code === 429) {
        const response = pm.response.json();
        pm.expect(response.success).to.be.false;
        pm.expect(response.code).to.include("RATE_LIMIT");
        pm.expect(response.retryAfter).to.be.a('number');
    }
});
```

#### Para Crear Pago:
```javascript
pm.test("Payment intent created", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.expect(response.success).to.be.true;
    pm.environment.set("transaction_id", response.data.transactionId);
    pm.environment.set("gateway_ref", response.data.gatewayRef);
});
```

#### Para Completar Pago:
```javascript
pm.test("Payment completed", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.expect(response.success).to.be.true;
    pm.expect(response.data.status).to.equal("PAID");
});
```

## Logs y Monitoreo

### Verificar Logs de Negocio

Los logs importantes aparecen en la consola del servidor:

```bash
# Orden creada
[info]: Business Event [order:created] {...}

# Pago procesado
[info]: Business Event [payment:success] {...}

# Licencia reservada
[info]: Business Event [license:reserve] {...}

# Email enviado
[info]: Business Event [email:license] {...}
```

### Health Check

```http
GET {{base_url}}/health
```

**Respuesta:**
```json
{
  "status": "ok",
  "timestamp": "2025-06-14T05:45:23.456Z",
  "environment": "development"
}
```

## Recomendaciones de Testing

### 1. Testing de Seguridad

#### Test de Rate Limiting
1. **Crear múltiples órdenes rápidamente** para alcanzar el límite de 10 por 15 minutos
2. **Verificar respuesta 429** con código `RATE_LIMIT_EXCEEDED`
3. **Esperar y verificar reset** después del tiempo especificado

#### Test de Validación
1. **Enviar datos inválidos** para verificar validaciones
2. **Probar campos faltantes** o con formato incorrecto
3. **Verificar sanitización** de caracteres especiales

### 2. Testing de Flujos de Negocio

#### Flujo Completo Exitoso
```
1. GET /products → Verificar productos disponibles
2. POST /orders → Crear orden
3. POST /orders/{id}/payment → Crear intención de pago
4. POST /webhook/mock-payment/{ref}/complete → Simular pago exitoso
5. GET /orders/{id} → Verificar orden completada con licencia
```

#### Flujo de Pago Fallido
```
1. POST /orders → Crear orden
2. POST /orders/{id}/payment → Crear intención de pago
3. POST /webhook/payment/mock → Enviar webhook con status FAILED
4. GET /orders/{id} → Verificar orden cancelada
```

#### Flujo de Cliente Existente
```
1. POST /orders → Crear primera orden con cliente nuevo
2. POST /orders → Crear segunda orden con mismo email/documento
3. Verificar que se reutiliza el mismo customerId
```

### 3. Testing de Administración

#### Gestión de Órdenes (Requiere Auth)
```
1. POST /admins/login → Autenticarse
2. GET /orders → Listar todas las órdenes
3. PUT /orders/{id}/status → Cambiar estado
4. POST /orders/{id}/cancel → Cancelar orden
```

### 4. Monitoreo y Debugging

#### Logs a Verificar
```bash
# Eventos de negocio importantes
[info]: Business Event [order:created]
[info]: Business Event [payment:success]
[info]: Business Event [license:reserve]
[info]: Business Event [email:license]

# Rate limiting
[error]: Rate limit exceeded for order creation

# Validaciones
[error]: Validation failed
```

#### Headers de Respuesta Importantes
```
RateLimit-Limit: 10
RateLimit-Remaining: 9
RateLimit-Reset: 1735876543
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
```

### 5. Variables de Entorno para Testing

```bash
# Para development
NODE_ENV=development
ORDER_TIMEOUT_MINUTES=30
CORS_ORIGIN=*

# Para testing más agresivo
ORDER_TIMEOUT_MINUTES=1  # Para probar timeout rápido
```

### 6. Casos Edge a Probar

1. **Sin licencias disponibles**: Agotar inventario y intentar crear orden
2. **Productos inactivos**: Intentar crear orden para producto desactivado
3. **Órdenes con descuentos**: Probar cálculos de precios
4. **Múltiples transacciones**: Crear múltiples intentos de pago para una orden
5. **Webhooks duplicados**: Enviar el mismo webhook múltiples veces
6. **Timeouts de orden**: Esperar que el job automático cancele órdenes expiradas

### 7. Performance Testing

#### Load Testing con Postman Runner
- Configurar 50-100 iteraciones
- Usar delays aleatorios entre requests
- Monitorear rate limits y tiempos de respuesta
- Verificar que el sistema mantenga consistencia bajo carga

---

## Resumen

**Endpoints Públicos (Sin Autenticación)**:
- ✅ Crear órdenes con auto-creación de clientes
- ✅ Iniciar pagos con proveedores
- ✅ Consultar estado de órdenes y transacciones
- ✅ Webhooks para confirmaciones de pago

**Seguridad Implementada**:
- 🛡️ Rate limiting por IP y endpoint
- 🔒 Validación exhaustiva de entrada
- 🧹 Sanitización automática
- 📝 Logging detallado de eventos

**Endpoints Administrativos (Con Autenticación)**:
- 👨‍💼 Gestión completa de órdenes
- 📊 Reportes y filtros avanzados
- ⚙️ Cambios de estado y cancelaciones

Esta documentación te permite probar completamente el sistema de órdenes y transacciones usando Postman, cubriendo todos los casos de uso, flujos posibles y medidas de seguridad implementadas.