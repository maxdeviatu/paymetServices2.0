# Payment Services API 2.0

Este proyecto implementa un servicio de pagos utilizando Node.js, Express, Sequelize (PostgreSQL), Winston y Docker, incluyendo gestión de productos, descuentos y usuarios administradores.

## Estructura del Proyecto (Actualizada)

```
src/
├── config/             # Variables de entorno y logger
├── routes/             # Definición de rutas
│   ├── products.routes.js
│   ├── discounts.routes.js
│   └── admins.routes.js
├── controllers/        # Controladores HTTP
│   ├── products.controller.js
│   ├── discounts.controller.js
│   └── admins.controller.js
├── services/           # Lógica de negocio
│   ├── product.service.js
│   ├── discount.service.js
│   └── admin.service.js
├── models/             # Modelos de datos
│   ├── product.model.js
│   ├── discount.model.js
│   └── admin.model.js
├── middlewares/        # Middlewares
│   ├── auth.js          # Autenticación JWT
│   ├── role.js          # Control de acceso por roles
│   └── validator.js     # Validación de datos
└── app.js              # App principal de Express
docker/
└── local.Dockerfile    # Dockerfile para entorno local
```

## Sistema de Logging

El proyecto utiliza Winston para el manejo de logs, con diferentes configuraciones para desarrollo y producción.

### Configuración

El sistema de logging está configurado en `src/config/logger.js` y proporciona las siguientes características:

- **Desarrollo**: Logs detallados con colores, timestamps y contexto completo
- **Producción**: Logs concisos en formato JSON para mejor integración con herramientas de análisis
- **Rotación automática** de archivos de log (5MB por archivo, máximo 5 archivos)
- **Separación** de logs de error y logs generales

### Convenciones de Logging

Al implementar nuevos servicios o funcionalidades, sigue estas convenciones:

1. **Importar el logger**:
```javascript
const logger = require('../config/logger')
```

2. **Logging de Operaciones de Negocio**:
```javascript
// Al inicio de la operación
logger.logBusiness('nombreOperacion', { 
  // Datos relevantes para el contexto
  id: 123,
  name: 'Ejemplo'
})

// Al finalizar exitosamente
logger.logBusiness('nombreOperacion.success', { 
  // Resultado de la operación
  id: result.id,
  status: 'completed'
})
```

3. **Logging de Errores**:
```javascript
try {
  // Código que puede fallar
} catch (error) {
  logger.logError(error, { 
    operation: 'nombreOperacion',
    // Contexto adicional del error
    id: 123,
    reason: 'invalid_data'
  })
  throw error
}
```

4. **Logging de Operaciones de Base de Datos**:
```javascript
logger.logDB('queryName', {
  // Detalles de la operación
  table: 'users',
  operation: 'SELECT'
})
```

### Estructura de Logs

#### En Desarrollo
```
[2024-03-14 10:15:30:123] INFO: Business Operation [createProduct]: {
  "name": "Producto 1",
  "price": 1000
}
```

#### En Producción
```json
{
  "timestamp": "2024-03-14T10:15:30.123Z",
  "level": "info",
  "message": "Business Operation [createProduct]"
}
```

### Archivos de Log

- `logs/error.log`: Contiene solo logs de error
- `logs/combined.log`: Contiene todos los logs (solo en desarrollo)

### Niveles de Log

- `error`: Errores que requieren atención inmediata
- `warn`: Advertencias que no son críticas
- `info`: Información general de operaciones
- `debug`: Información detallada (solo en desarrollo)
- `http`: Logs de peticiones HTTP

### Ejemplo de Implementación en un Nuevo Servicio

```javascript
const logger = require('../config/logger')

class NewService {
  async createItem(data) {
    try {
      // Log al inicio de la operación
      logger.logBusiness('createItem', { 
        name: data.name,
        type: data.type
      })

      // Validación
      if (!data.name) {
        const error = new Error('Nombre requerido')
        logger.logError(error, { 
          operation: 'createItem',
          data
        })
        throw error
      }

      // Operación principal
      const result = await Item.create(data)

      // Log de éxito
      logger.logBusiness('createItem.success', { 
        id: result.id,
        name: result.name
      })

      return result
    } catch (error) {
      // Log de error
      logger.logError(error, { 
        operation: 'createItem',
        data
      })
      throw error
    }
  }
}
```

### Mejores Prácticas

1. **Siempre incluir contexto relevante** en los logs
2. **Usar try/catch** para manejar errores y loggearlos
3. **No loggear información sensible** (contraseñas, tokens, etc.)
4. **Mantener consistencia** en los nombres de las operaciones
5. **Loggear tanto el inicio como el fin** de operaciones importantes
6. **Incluir IDs y referencias** para facilitar el debugging

## Modelos implementados

### Producto (Product)
- `id`: autoincremental
- `name`: nombre del producto
- `slug`: URL amigable (generado automáticamente desde el nombre)
- `productRef`: referencia única del producto
- `image`: URL de la imagen
- `description`: descripción detallada
- `features`: características del producto
- `price`: precio en centavos
- `provider`: proveedor
- `hasDiscount`: indica si tiene descuento aplicado
- `discountId`: ID del descuento aplicado (nullable)
- `isActive`: estado del producto

### Descuento (Discount)
- `id`: autoincremental
- `name`: nombre del descuento
- `amount`: cantidad del descuento
- `startDate`: fecha de inicio
- `endDate`: fecha de fin
- `isActive`: estado del descuento

### Administrador (Admin)
- `id`: autoincremental
- `name`: nombre completo
- `phone`: teléfono
- `email`: correo electrónico (único)
- `passwordHash`: contraseña hasheada
- `role`: rol (READ_ONLY, EDITOR, SUPER_ADMIN)
- `isActive`: estado del administrador

## Autenticación y Autorización

- Autenticación mediante JWT (JSON Web Token)
- Roles jerárquicos de acceso:
  - `READ_ONLY`: Solo consultas
  - `EDITOR`: Crear y editar recursos
  - `SUPER_ADMIN`: Acceso completo, incluyendo eliminación

## Sistema de Facturación

El sistema incluye un módulo completo de facturación que se integra automáticamente con las transacciones pagadas. 

### Características Principales

- **Integración automática**: Genera facturas automáticamente para transacciones pagadas
- **Múltiples proveedores**: Soporte para Siigo (producción) y Mock (desarrollo/testing)
- **Procesamiento por lotes**: Job diario que procesa transacciones pendientes
- **Control de ritmo**: Delay configurable entre facturas para evitar saturar APIs
- **Gestión de estados**: Seguimiento completo del ciclo de vida de las facturas
- **API administrativa**: Endpoints para gestión manual y consultas

### Proveedores de Facturación

#### Siigo (Producción)
- Autenticación OAuth2 con renovación automática de tokens
- Integración completa con la API de Siigo
- Verificación de estado DIAN
- Gestión de productos y clientes

#### Mock (Desarrollo/Testing)
- Simula el comportamiento completo de Siigo
- Respuestas predecibles para testing
- Sin llamadas externas reales

### Modelo de Datos

#### Tabla de Facturas (`invoices`)
- `id`: ID interno de la factura
- `provider_invoice_id`: ID de la factura en el proveedor
- `invoice_number`: Número visible de la factura
- `transaction_id`: Referencia a la transacción (único)
- `provider`: Proveedor utilizado ('siigo' | 'mock')
- `email_sent`: Estado del envío de email
- `accepted_by_dian`: Estado de aceptación DIAN
- `provider_product_id`: ID del producto en el proveedor
- `provider_customer_id`: ID del cliente en el proveedor
- `status`: Estado de la factura
- `metadata`: Datos adicionales del proveedor

#### Relación con Transacciones
- Cada transacción puede tener máximo una factura
- Campo `invoice_id` en la tabla de transacciones
- Relación bidireccional para consultas optimizadas

### Procesamiento Automático

#### Job Diario de Facturación
- **Horario**: 2:00 AM todos los días (configurable)
- **Criterios**: Transacciones con status 'PAID' sin factura
- **Optimización**: Solo procesa desde la última transacción facturada
- **Delay**: 1 minuto entre facturas (configurable)
- **Logging**: Registro completo de operaciones y errores

#### Algoritmo de Procesamiento
1. Buscar transacciones PAID sin `invoice_id`
2. Para cada transacción:
   - Validar que tenga orden y producto asociados
   - Buscar producto en el proveedor de facturación
   - Crear factura en el proveedor
   - Guardar registro de factura en BD
   - Actualizar transacción con `invoice_id`
   - Esperar delay configurado
3. Registrar estadísticas y errores

### Variables de Entorno

```bash
# Configuración de Siigo
SIIGO_API_URL=https://api.siigo.co
SIIGO_USERNAME=tu_usuario
SIIGO_ACCESS_KEY=tu_access_key
SIIGO_PARTNER_ID=tu_partner_id
SIIGO_SALES_DOCUMENT_ID=1
SIIGO_SELLER_ID=1
SIIGO_PAYMENT_TYPE_ID=1

# Configuración del sistema
INVOICE_PROVIDER=siigo              # 'siigo' | 'mock'
INVOICE_DELAY_BETWEEN_MS=60000      # Delay entre facturas (ms)
```

### Scripts de Configuración

```bash
# Crear tabla de facturas
npm run create-invoices-table

# Validar configuración
npm run env:validate
```

## Endpoints API

### Productos

| Método | Ruta | Acción | Rol |
|--------|------|--------|-----|
| GET | `/api/products` | Listar productos activos | Público |
| GET | `/api/products/:id` | Ver detalle por ID | Público |
| GET | `/api/products/ref/:productRef` | Ver detalle por referencia | Público |
| GET | `/api/products/all` | Listar todos (activos/inactivos) | READ_ONLY |
| POST | `/api/products` | Crear nuevo producto | EDITOR |
| PUT | `/api/products/:id` | Editar producto | EDITOR |
| PATCH | `/api/products/:id/status` | Activar/Desactivar | EDITOR |
| PATCH | `/api/products/:id/discount` | Vincular descuento | EDITOR |
| DELETE | `/api/products/:id` | Eliminar producto | SUPER_ADMIN |

### Descuentos

| Método | Ruta | Acción | Rol |
|--------|------|--------|-----|
| GET | `/api/discounts` | Listar descuentos | READ_ONLY |
| GET | `/api/discounts/:id` | Ver detalle | READ_ONLY |
| POST | `/api/discounts` | Crear descuento | EDITOR |
| PUT | `/api/discounts/:id` | Editar descuento | EDITOR |
| PATCH | `/api/discounts/:id/status` | Activar/Desactivar | EDITOR |

### Administradores

| Método | Ruta | Acción | Rol |
|--------|------|--------|-----|
| POST | `/api/admins/login` | Iniciar sesión | Público |
| GET | `/api/admins` | Listar administradores | SUPER_ADMIN |
| GET | `/api/admins/:id` | Ver detalle | SUPER_ADMIN |
| POST | `/api/admins` | Crear administrador | SUPER_ADMIN |
| PUT | `/api/admins/:id` | Editar administrador | SUPER_ADMIN |
| DELETE | `/api/admins/:id` | Eliminar administrador | SUPER_ADMIN |
| POST | `/api/admins/:id/reset-password` | Restablecer contraseña | SUPER_ADMIN |

### Facturas

| Método | Ruta | Acción | Rol |
|--------|------|--------|-----|
| GET | `/api/invoices` | Listar facturas con paginación | READ_ONLY |
| GET | `/api/invoices/stats` | Estadísticas de facturación | READ_ONLY |
| GET | `/api/invoices/:id` | Ver factura específica | READ_ONLY |
| POST | `/api/invoices/execute` | Ejecutar facturación masiva | EDITOR |
| PUT | `/api/invoices/:id/status` | Actualizar estado de factura | EDITOR |

### Jobs Administrativos

| Método | Ruta | Acción | Rol |
|--------|------|--------|-----|
| GET | `/api/admin/jobs/status` | Estado de todos los jobs | SUPER_ADMIN |
| POST | `/api/admin/jobs/invoice/run` | Ejecutar job de facturas | SUPER_ADMIN |
| POST | `/api/admin/jobs/:jobName/start` | Iniciar job específico | SUPER_ADMIN |
| POST | `/api/admin/jobs/:jobName/stop` | Detener job específico | SUPER_ADMIN |

## Requisitos Previos

- Node.js ≥ 14
- Docker y docker-compose (para entorno local)
- PostgreSQL (opcional, si no se usa Docker)

## Instalación

1. Clonar el repositorio:
```bash
git clone <url-del-repositorio>
cd payment-services2.0
```