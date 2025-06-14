# API de Productos

## Descripción
Esta API permite gestionar los productos del sistema de pagos. Los productos pueden ser de dos tipos:
- **Productos físicos/servicios**: `license_type: false` - No requieren gestión de licencias
- **Productos digitales con licencias**: `license_type: true` - Permiten gestión de inventario de licencias digitales

Los endpoints están protegidos según el rol del usuario y siguen el patrón de autenticación JWT del sistema.

## Endpoints

### Obtener Lista de Productos
```http
GET /products
```
Obtiene la lista de productos activos.

**Respuesta Exitosa:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "name": "string",
      "productRef": "string",
      "price": "number",
      "currency": "string",
      "description": "string",
      "features": "string",
      "image": "string",
      "provider": "string",
      "license_type": "boolean",
      "isActive": "boolean",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ]
}
```

### Obtener Producto por ID
```http
GET /products/:id
```
Obtiene un producto específico por su ID.

**Respuesta Exitosa:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "name": "string",
    "productRef": "string",
    "price": "number",
    "currency": "string",
    "description": "string",
    "features": "string",
    "image": "string",
    "provider": "string",
    "license_type": "boolean",
    "isActive": "boolean",
    "createdAt": "string",
    "updatedAt": "string"
  }
}
```

### Obtener Producto por Referencia
```http
GET /products/ref/:productRef
```
Obtiene un producto específico por su referencia.

**Respuesta Exitosa:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "name": "string",
    "productRef": "string",
    "price": "number",
    "currency": "string",
    "description": "string",
    "features": "string",
    "image": "string",
    "provider": "string",
    "license_type": "boolean",
    "isActive": "boolean",
    "createdAt": "string",
    "updatedAt": "string"
  }
}
```

### Obtener Todos los Productos (Incluyendo Inactivos)
```http
GET /products/all
```
Obtiene la lista completa de productos, incluyendo los inactivos. Requiere rol READ_ONLY.

**Respuesta Exitosa:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "name": "string",
      "productRef": "string",
      "price": "number",
      "currency": "string",
      "description": "string",
      "features": "string",
      "image": "string",
      "provider": "string",
      "license_type": "boolean",
      "isActive": "boolean",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ]
}
```

### Crear Producto
```http
POST /products
```
Crea un nuevo producto. Requiere rol EDITOR.

**Cuerpo de la Petición:**
```json
{
  "name": "string",
  "productRef": "string",
  "price": "number",
  "currency": "string",
  "description": "string",
  "features": "string",
  "image": "string",
  "provider": "string",
  "license_type": "boolean"
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "name": "string",
    "productRef": "string",
    "price": "number",
    "currency": "string",
    "description": "string",
    "features": "string",
    "image": "string",
    "provider": "string",
    "license_type": "boolean",
    "isActive": "boolean",
    "createdAt": "string",
    "updatedAt": "string"
  }
}
```

### Actualizar Producto
```http
PUT /products/:id
```
Actualiza un producto existente. Requiere rol EDITOR.

**Cuerpo de la Petición:**
```json
{
  "name": "string",
  "productRef": "string",
  "price": "number",
  "currency": "string",
  "description": "string",
  "features": "string",
  "image": "string",
  "provider": "string",
  "license_type": "boolean"
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "name": "string",
    "productRef": "string",
    "price": "number",
    "currency": "string",
    "description": "string",
    "features": "string",
    "image": "string",
    "provider": "string",
    "license_type": "boolean",
    "isActive": "boolean",
    "createdAt": "string",
    "updatedAt": "string"
  }
}
```

### Eliminar Producto
```http
DELETE /products/:id
```
Elimina un producto. Requiere rol SUPER_ADMIN.

**Respuesta Exitosa:**
```json
{
  "success": true,
  "message": "Producto eliminado exitosamente"
}
```

## Validaciones
- `name`: String, requerido - Nombre descriptivo del producto
- `productRef`: String, requerido, único - Referencia única utilizada para vincular licencias
- `price`: Número entero, mayor a 0 - Precio en centavos de la moneda especificada
- `currency`: String, requerido, debe ser uno de: "USD", "EUR", "COP", "MXN"
- `description`: String, opcional - Descripción detallada del producto
- `features`: String, opcional - Características y beneficios del producto
- `image`: URL válida, opcional - URL de la imagen del producto
- `provider`: String, opcional - Proveedor o fabricante del producto
- `license_type`: Boolean, opcional, valor por defecto false - Indica si el producto soporta licencias digitales

## Campo license_type

### Descripción
El campo `license_type` determina si un producto puede tener licencias digitales asociadas:

- **`false` (default)**: Producto tradicional sin licencias (servicios, productos físicos)
- **`true`**: Producto digital que requiere gestión de licencias (software, cursos digitales, etc.)

### Comportamiento del Sistema

#### Cuando license_type = true:
- ✅ Se pueden crear licencias para este producto a través de `/api/licenses`
- ✅ Se pueden importar licencias masivamente vía CSV
- ✅ Las licencias se vinculan via `productRef`
- ✅ Se puede gestionar el inventario de licencias (AVAILABLE, RESERVED, SOLD, etc.)

#### Cuando license_type = false:
- ❌ No se pueden crear licencias para este producto
- ❌ La importación CSV fallará si incluye este `productRef`
- ❌ Los endpoints de licencias retornarán error para este producto

### Casos de Uso

#### Producto Digital con Licencias:
```json
{
  "name": "Software Pro License",
  "productRef": "SOFT-PRO-1Y",
  "price": 99900,
  "currency": "USD",
  "license_type": true,
  "description": "Licencia anual para Software Pro"
}
```

#### Producto Físico/Servicio:
```json
{
  "name": "Consultoría Personalizada",
  "productRef": "CONSULT-CUSTOM",
  "price": 50000,
  "currency": "USD",
  "license_type": false,
  "description": "Servicio de consultoría personalizada"
}
```

## Integración con el Sistema de Licencias

### Flujo Recomendado:
1. **Crear producto** con `license_type: true`
2. **Crear/importar licencias** usando el `productRef` del producto
3. **Gestionar inventario** a través de los endpoints de licencias
4. **Procesar ventas** cambiando estado de licencias a SOLD

### Validaciones Cruzadas:
- Al crear una licencia, se verifica que el producto tenga `license_type: true`
- Al importar CSV, se validan todos los `productRef` contra productos con licencias habilitadas
- Al cambiar `license_type` de `true` a `false`, las licencias existentes quedan inactivas

## Estados del Producto

- **`isActive: true`**: Producto visible y disponible para venta
- **`isActive: false`**: Producto oculto, no disponible en catálogo público
- **`hasDiscount: true/false`**: Indica si tiene descuento aplicado
- **`discountId`**: Referencia al descuento activo (nullable)

## Endpoints Administrativos Adicionales

### Cambiar Estado del Producto
```http
PATCH /api/products/:id/status
```
Activa/desactiva un producto. Requiere rol EDITOR.

### Gestionar Descuentos
```http
PATCH /api/products/:id/discount
```
Asigna o remueve descuentos del producto. Requiere rol EDITOR.

**Cuerpo de la Petición:**
```json
{
  "discountId": 123  // o null para remover
}
```

## Roles Requeridos
- **Público**: Puede ver productos activos (sin autenticación)
- **READ_ONLY**: Puede ver todos los productos (activos e inactivos)
- **EDITOR**: Puede crear, editar productos y gestionar descuentos
- **SUPER_ADMIN**: Puede eliminar productos

## Paginación
Todos los endpoints de listado soportan paginación:
- `page`: Número de página (default: 1)
- `limit`: Elementos por página (default: 20, max: 100 para público)

## Logging y Auditoría
- Todas las operaciones se registran con contexto de negocio
- Los errores se loggean con detalles para debugging
- Se mantiene trazabilidad de cambios en productos con licencias 