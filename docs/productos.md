# API de Productos

## Descripción
Esta API permite gestionar los productos del sistema. Los endpoints están protegidos según el rol del usuario.

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
  "provider": "string"
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
  "provider": "string"
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
- `name`: String, requerido
- `productRef`: String, requerido
- `price`: Número entero, mayor a 0
- `currency`: String, requerido, debe ser uno de: "USD", "EUR", "COP", "MXN"
- `description`: String, opcional
- `features`: String, opcional
- `image`: URL válida, opcional
- `provider`: String, opcional

## Roles Requeridos
- READ_ONLY: Puede ver todos los productos (activos e inactivos)
- EDITOR: Puede crear y editar productos
- SUPER_ADMIN: Puede eliminar productos 