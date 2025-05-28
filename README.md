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