# Sistema de Cambio de Licencias

## Descripción General

El sistema de cambio de licencias permite a los administradores cambiar la licencia de un usuario que se equivocó en su compra, validando que la licencia pertenece al usuario y cambiando el producto en la orden correspondiente.

## Características Principales

- ✅ **Validación de Propiedad**: Verifica que la licencia pertenece al usuario mediante número de documento
- ✅ **Validación de Precios**: Solo permite cambios entre productos del mismo precio
- ✅ **Transaccional**: Todas las operaciones son atómicas usando transacciones de base de datos
- ✅ **Notificación Automática**: Envía email al usuario informando del cambio
- ✅ **Auditoría Completa**: Registra todos los cambios en el sistema de logs
- ✅ **Seguridad**: Solo accesible por administradores con rol `SUPER_ADMIN`

## Flujo de Cambio de Licencia

```mermaid
graph TD
    A[Admin solicita cambio] --> B[Validar datos de entrada]
    B --> C[Buscar licencia actual]
    C --> D[Verificar estado SOLD]
    D --> E[Validar propiedad del usuario]
    E --> F[Validar nuevo producto]
    F --> G[Verificar disponibilidad de licencia]
    G --> H[Ejecutar cambio transaccional]
    H --> I[Enviar email de notificación]
    I --> J[Registrar cambio en logs]
```

## Endpoint de API

### Cambiar Licencia

```http
POST /api/license-change/change
Content-Type: application/json
Authorization: Bearer {admin_token}

{
  "licenseKey": "AAA-BBB-CCC-111",
  "customerDocumentNumber": "12345678",
  "newProductRef": "SOFT-PRO-2Y"
}
```

**Parámetros:**
- `licenseKey` (string, requerido): Clave de la licencia actual
- `customerDocumentNumber` (string, requerido): Número de documento del cliente
- `newProductRef` (string, requerido): Referencia del nuevo producto

**Respuesta Exitosa (200):**
```json
{
  "success": true,
  "message": "Licencia cambiada exitosamente",
  "data": {
    "changeInfo": {
      "changedAt": "2025-01-14T10:30:00.000Z",
      "oldProductName": "Software Pro 1 Año",
      "newProductName": "Software Pro 2 Años"
    },
    "customer": {
      "id": 1,
      "name": "Juan Pérez",
      "email": "juan@example.com"
    },
    "order": {
      "id": 123,
      "productRef": "SOFT-PRO-2Y"
    },
    "licenses": {
      "old": {
        "licenseKey": "AAA-BBB-CCC-111",
        "productRef": "SOFT-PRO-1Y",
        "status": "AVAILABLE"
      },
      "new": {
        "licenseKey": "DDD-EEE-FFF-222",
        "productRef": "SOFT-PRO-2Y",
        "status": "SOLD"
      }
    }
  }
}
```

**Errores Comunes:**

| Código | Error | Descripción |
|--------|-------|-------------|
| 400 | `licenseKey es requerido` | Falta la clave de licencia |
| 400 | `customerDocumentNumber es requerido` | Falta el número de documento |
| 400 | `newProductRef es requerido` | Falta la referencia del nuevo producto |
| 400 | `Formato de licenseKey inválido` | Formato incorrecto de la clave |
| 400 | `El número de documento debe ser numérico con 8-12 dígitos` | Formato de documento inválido |
| 404 | `Licencia no encontrada` | La licencia no existe |
| 404 | `El número de documento no coincide` | El documento no pertenece al propietario |
| 404 | `Producto con referencia XXX no encontrado` | El nuevo producto no existe |
| 400 | `Solo se pueden cambiar licencias que estén vendidas` | La licencia no está vendida |
| 400 | `Solo se pueden cambiar licencias de órdenes completadas` | La orden no está completada |
| 400 | `No hay licencias disponibles para el producto XXX` | No hay stock del nuevo producto |
| 400 | `Los precios no coinciden` | Los productos tienen precios diferentes |
| 400 | `No se puede cambiar a la misma referencia de producto` | Intento de cambio al mismo producto |
| 400 | `El producto actual XXX no existe` | El producto actual no existe en el sistema |

## Ejemplo de Uso con Postman

### Configuración Inicial

#### 1. Crear una Nueva Colección
1. Abrir Postman
2. Crear nueva colección llamada "Sistema de Cambio de Licencias"
3. Agregar variables de entorno:
   - `base_url`: `https://api.innovatelearning.com.co` (o tu URL de desarrollo)
   - `admin_token`: Token de autenticación de administrador con rol `SUPER_ADMIN`

#### 2. Configurar Variables de Entorno
```json
{
  "base_url": "https://api.innovatelearning.com.co",
  "admin_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "test_license_key": "AAA-BBB-CCC-111",
  "test_document_number": "12345678",
  "test_new_product": "SOFT-PRO-2Y"
}
```

### Request de Cambio de Licencia

#### Configuración del Request
- **Método**: `POST`
- **URL**: `{{base_url}}/api/license-change/change`
- **Headers**:
  ```
  Content-Type: application/json
  Authorization: Bearer {{admin_token}}
  ```

#### Body del Request
```json
{
  "licenseKey": "{{test_license_key}}",
  "customerDocumentNumber": "{{test_document_number}}",
  "newProductRef": "{{test_new_product}}"
}
```

### Casos de Prueba

#### Caso 1: Cambio Exitoso
**Request:**
```json
{
  "licenseKey": "AAA-BBB-CCC-111",
  "customerDocumentNumber": "12345678",
  "newProductRef": "SOFT-PRO-2Y"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Licencia cambiada exitosamente",
  "data": {
    "changeInfo": {
      "changedAt": "2025-01-14T10:30:00.000Z",
      "oldProductName": "Software Pro 1 Año",
      "newProductName": "Software Pro 2 Años"
    },
    "customer": {
      "id": 1,
      "name": "Juan Pérez",
      "email": "juan@example.com"
    },
    "order": {
      "id": 123,
      "productRef": "SOFT-PRO-2Y"
    },
    "licenses": {
      "old": {
        "licenseKey": "AAA-BBB-CCC-111",
        "productRef": "SOFT-PRO-1Y",
        "status": "AVAILABLE"
      },
      "new": {
        "licenseKey": "DDD-EEE-FFF-222",
        "productRef": "SOFT-PRO-2Y",
        "status": "SOLD"
      }
    }
  }
}
```

#### Caso 2: Licencia No Encontrada
**Request:**
```json
{
  "licenseKey": "XXX-YYY-ZZZ-999",
  "customerDocumentNumber": "12345678",
  "newProductRef": "SOFT-PRO-2Y"
}
```

**Response (404):**
```json
{
  "success": false,
  "message": "Licencia no encontrada"
}
```

#### Caso 3: Documento No Coincide
**Request:**
```json
{
  "licenseKey": "AAA-BBB-CCC-111",
  "customerDocumentNumber": "87654321",
  "newProductRef": "SOFT-PRO-2Y"
}
```

**Response (404):**
```json
{
  "success": false,
  "message": "El número de documento no coincide con el propietario de la licencia"
}
```

#### Caso 4: Producto No Encontrado
**Request:**
```json
{
  "licenseKey": "AAA-BBB-CCC-111",
  "customerDocumentNumber": "12345678",
  "newProductRef": "PRODUCTO-INEXISTENTE"
}
```

**Response (404):**
```json
{
  "success": false,
  "message": "Producto con referencia PRODUCTO-INEXISTENTE no encontrado"
}
```

#### Caso 5: Precios Diferentes
**Request:**
```json
{
  "licenseKey": "AAA-BBB-CCC-111",
  "customerDocumentNumber": "12345678",
  "newProductRef": "SOFT-PREMIUM-2Y"
}
```

**Response (400):**
```json
{
  "success": false,
  "message": "Los precios no coinciden. Producto actual: 99900, Nuevo producto: 199900"
}
```

#### Caso 6: Sin Stock Disponible
**Request:**
```json
{
  "licenseKey": "AAA-BBB-CCC-111",
  "customerDocumentNumber": "12345678",
  "newProductRef": "SOFT-PRO-2Y"
}
```

**Response (400):**
```json
{
  "success": false,
  "message": "No hay licencias disponibles para el producto SOFT-PRO-2Y"
}
```

#### Caso 7: Campos Requeridos Faltantes
**Request:**
```json
{
  "licenseKey": "AAA-BBB-CCC-111"
}
```

**Response (400):**
```json
{
  "success": false,
  "message": "customerDocumentNumber es requerido"
}
```

### Scripts de Postman

#### Pre-request Script (Validación de Token)
```javascript
// Verificar que el token esté configurado
if (!pm.environment.get("admin_token")) {
    throw new Error("Token de administrador no configurado");
}

// Verificar que la URL base esté configurada
if (!pm.environment.get("base_url")) {
    throw new Error("URL base no configurada");
}
```

#### Tests Script (Validaciones Automáticas)
```javascript
// Verificar que la respuesta sea JSON válido
pm.test("Response is JSON", function () {
    pm.response.to.have.jsonBody();
});

// Verificar código de estado
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

// Verificar estructura de respuesta exitosa
if (pm.response.code === 200) {
    pm.test("Success response structure", function () {
        const jsonData = pm.response.json();
        pm.expect(jsonData).to.have.property('success', true);
        pm.expect(jsonData).to.have.property('message');
        pm.expect(jsonData).to.have.property('data');
        pm.expect(jsonData.data).to.have.property('changeInfo');
        pm.expect(jsonData.data).to.have.property('customer');
        pm.expect(jsonData.data).to.have.property('order');
        pm.expect(jsonData.data).to.have.property('licenses');
    });

    pm.test("License change details", function () {
        const jsonData = pm.response.json();
        pm.expect(jsonData.data.licenses.old.status).to.eql('AVAILABLE');
        pm.expect(jsonData.data.licenses.new.status).to.eql('SOLD');
        pm.expect(jsonData.data.order.productRef).to.eql(pm.request.body.newProductRef);
    });
}

// Verificar errores
if (pm.response.code >= 400) {
    pm.test("Error response structure", function () {
        const jsonData = pm.response.json();
        pm.expect(jsonData).to.have.property('success', false);
        pm.expect(jsonData).to.have.property('message');
    });
}

// Guardar datos para uso posterior
if (pm.response.code === 200) {
    const jsonData = pm.response.json();
    pm.environment.set("last_change_id", jsonData.data.order.id);
    pm.environment.set("new_license_key", jsonData.data.licenses.new.licenseKey);
}
```

### Colección Completa de Postman

#### Estructura de la Colección
```
📁 Sistema de Cambio de Licencias
├── 🔧 Setup
│   ├── 🔑 Obtener Token Admin
│   └── 📋 Configurar Variables
├── ✅ Casos Exitosos
│   ├── 🔄 Cambio de Licencia Básico
│   └── 🔄 Cambio con Validaciones
├── ❌ Casos de Error
│   ├── 🚫 Licencia No Encontrada
│   ├── 🚫 Documento No Coincide
│   ├── 🚫 Producto No Existe
│   ├── 🚫 Precios Diferentes
│   ├── 🚫 Sin Stock Disponible
│   └── 🚫 Campos Requeridos Faltantes
└── 🔍 Verificaciones
    ├── 📧 Verificar Email Enviado
    └── 📊 Verificar Logs
```

#### Variables de Entorno Recomendadas
```json
{
  "base_url": "https://api.innovatelearning.com.co",
  "admin_token": "",
  "test_license_key": "AAA-BBB-CCC-111",
  "test_document_number": "12345678",
  "test_new_product": "SOFT-PRO-2Y",
  "last_change_id": "",
  "new_license_key": "",
  "customer_email": "juan@example.com"
}
```

### Comandos de Terminal para Testing

#### Ejecutar Tests Unitarios
```bash
# Ejecutar todos los tests del servicio
npm test -- src/tests/unit/services/licenseChange.service.test.js

# Ejecutar tests con coverage
npm test -- --coverage src/tests/unit/services/licenseChange.service.test.js

# Ejecutar tests en modo watch
npm test -- --watch src/tests/unit/services/licenseChange.service.test.js
```

#### Verificar Logs del Sistema
```bash
# Ver logs de cambios de licencia
tail -f logs/app.log | grep "licenseChange"

# Ver logs de emails enviados
tail -f logs/app.log | grep "email:licenseChange"

# Ver logs de errores
tail -f logs/app.log | grep "ERROR"
```

### Checklist de Testing

#### ✅ Configuración
- [ ] Token de administrador válido configurado
- [ ] Variables de entorno configuradas
- [ ] URL base correcta
- [ ] Headers de autorización configurados

#### ✅ Casos de Prueba
- [ ] Cambio exitoso con datos válidos
- [ ] Validación de licencia no encontrada
- [ ] Validación de documento no coincidente
- [ ] Validación de producto inexistente
- [ ] Validación de precios diferentes
- [ ] Validación de stock insuficiente
- [ ] Validación de campos requeridos
- [ ] Validación de formato de datos

#### ✅ Verificaciones Post-Cambio
- [ ] Email enviado al cliente
- [ ] Logs de auditoría generados
- [ ] Licencia anterior liberada
- [ ] Nueva licencia asignada
- [ ] Orden actualizada
- [ ] Información de envío actualizada

## Validaciones del Sistema

### 1. Validación de Licencia
- ✅ La licencia debe existir
- ✅ La licencia debe tener estado `SOLD`
- ✅ La licencia debe estar asociada a una orden

### 2. Validación de Usuario
- ✅ El número de documento debe coincidir con el propietario de la licencia
- ✅ El usuario debe existir en el sistema

### 3. Validación de Producto
- ✅ El nuevo producto debe existir
- ✅ El nuevo producto debe estar activo
- ✅ El nuevo producto debe soportar licencias (`license_type: true`)
- ✅ Debe haber licencias disponibles del nuevo producto

### 4. Validación de Orden
- ✅ La orden debe estar completada (`status: COMPLETED`)

### 5. Validación de Precios
- ✅ Los productos deben tener el mismo precio (configurable)
- ✅ El producto actual debe existir en el sistema
- ✅ No se permite cambiar al mismo producto

## Proceso Transaccional

### 1. Actualización de Orden
```sql
UPDATE orders 
SET product_ref = 'SOFT-PRO-2Y' 
WHERE id = 123
```

### 2. Asignación de Nueva Licencia
```sql
UPDATE licenses 
SET status = 'SOLD', order_id = 123, sold_at = NOW() 
WHERE id = 2
```

### 3. Liberación de Licencia Anterior
```sql
UPDATE licenses 
SET status = 'AVAILABLE', order_id = NULL, sold_at = NULL, reserved_at = NULL 
WHERE id = 1
```

### 4. Actualización de Información de Envío
```json
{
  "shippingInfo": {
    "licenseChange": {
      "changedAt": "2025-01-14T10:30:00.000Z",
      "oldLicenseKey": "AAA-BBB-CCC-111",
      "oldProductRef": "SOFT-PRO-1Y",
      "newLicenseKey": "DDD-EEE-FFF-222",
      "newProductRef": "SOFT-PRO-2Y",
      "customerDocumentNumber": "12345678",
      "adminId": 1,
      "emailPending": true,
      "emailSent": true,
      "emailSentAt": "2025-01-14T10:30:05.000Z",
      "emailMessageId": "msg_123456"
    }
  }
}
```

## Email de Notificación

### Plantilla: `license-change.hbs`

El sistema envía automáticamente un email al usuario con:

- ✅ Confirmación del cambio realizado
- ✅ Información del producto anterior
- ✅ Información del nuevo producto
- ✅ Nueva clave de activación
- ✅ Instrucciones específicas (si las hay)
- ✅ Advertencia sobre la desactivación de la licencia anterior

### Variables del Email:
- `customerName`: Nombre completo del cliente
- `oldProductName`: Nombre del producto anterior
- `newProductName`: Nombre del nuevo producto
- `oldLicenseKey`: Clave de la licencia anterior
- `newLicenseKey`: Clave de la nueva licencia
- `instructions`: Instrucciones de activación
- `orderId`: Número de orden
- `changeDate`: Fecha del cambio
- `supportEmail`: Email de soporte
- `whatsappLink`: Link de WhatsApp

## Logs y Auditoría

### Logs de Negocio
```javascript
// Inicio del cambio
logger.logBusiness('licenseChange:start', {
  licenseKey: 'AAA-BBB-CCC-111',
  customerDocumentNumber: '12345678',
  newProductRef: 'SOFT-PRO-2Y',
  adminId: 1
})

// Cambio exitoso
logger.logBusiness('licenseChange:success', {
  oldLicenseId: 1,
  newLicenseId: 2,
  orderId: 123,
  customerId: 1,
  oldProductRef: 'SOFT-PRO-1Y',
  newProductRef: 'SOFT-PRO-2Y',
  adminId: 1
})

// Email enviado
logger.logBusiness('licenseChange:emailSent', {
  orderId: 123,
  customerEmail: 'juan@example.com',
  messageId: 'msg_123456'
})
```

### Logs de Error
```javascript
logger.logError(error, {
  operation: 'changeLicense',
  licenseKey: 'AAA-BBB-CCC-111',
  customerDocumentNumber: '12345678',
  newProductRef: 'SOFT-PRO-2Y',
  adminId: 1
})
```

## Casos de Uso

### Caso 1: Cambio Exitoso
1. Usuario compra "Software Pro 1 Año" por error
2. Admin identifica la licencia y el usuario
3. Admin solicita cambio a "Software Pro 2 Años"
4. Sistema valida y ejecuta el cambio
5. Usuario recibe email con nueva licencia

### Caso 2: Validación de Propiedad
1. Usuario A intenta cambiar licencia de Usuario B
2. Sistema verifica número de documento
3. Sistema rechaza el cambio por no coincidir

### Caso 3: Sin Stock Disponible
1. Admin solicita cambio a producto sin licencias disponibles
2. Sistema verifica disponibilidad
3. Sistema rechaza el cambio

### Caso 4: Precios Diferentes
1. Admin intenta cambiar a producto con precio diferente
2. Sistema valida precios
3. Sistema rechaza el cambio

## Seguridad

### Roles Requeridos
- **SUPER_ADMIN**: Único rol con acceso al endpoint

### Validaciones de Seguridad
- ✅ Autenticación requerida
- ✅ Autorización por rol
- ✅ Validación de propiedad de licencia
- ✅ Transacciones atómicas
- ✅ Logs de auditoría completos

### Consideraciones
- Solo licencias `SOLD` pueden ser cambiadas
- Solo órdenes `COMPLETED` pueden ser modificadas
- Los cambios son irreversibles (requieren nuevo cambio)
- Se mantiene historial completo en `shippingInfo`

## Testing

### Tests Unitarios
```bash
npm test -- src/tests/unit/services/licenseChange.service.test.js
```

### Casos de Prueba Cubiertos
- ✅ Cambio exitoso
- ✅ Validación de licencia no encontrada
- ✅ Validación de estado de licencia
- ✅ Validación de propiedad de usuario
- ✅ Validación de producto no encontrado
- ✅ Validación de producto inactivo
- ✅ Validación de producto sin licencias
- ✅ Validación de precios diferentes
- ✅ Validación de stock insuficiente
- ✅ Validación de orden no completada
- ✅ Validación de formato de datos
- ✅ Validación de documento colombiano
- ✅ Validación de cambio al mismo producto
- ✅ Validación de producto actual inexistente

## Configuración

### Variables de Entorno
```bash
# No se requieren variables adicionales
# Usa la configuración existente del sistema
```

### Personalización
Para deshabilitar la validación de precios, modificar en `licenseChange.service.js`:
```javascript
// Comentar o eliminar esta validación
if (currentProduct && currentProduct.price !== newProduct.price) {
  throw new Error(`Los precios no coinciden...`)
}
```

## Monitoreo

### Métricas a Monitorear
- Número de cambios de licencia por día
- Tiempo promedio de procesamiento
- Tasa de éxito vs errores
- Emails enviados exitosamente

### Alertas Recomendadas
- Errores frecuentes de validación
- Fallos en envío de emails
- Tiempo de respuesta alto
- Cambios de licencia fuera de horario normal 