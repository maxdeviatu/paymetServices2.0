# API de Descuentos

## Descripción
Esta API permite gestionar los descuentos del sistema. Todos los endpoints requieren autenticación y están protegidos según el rol del usuario.

## Endpoints

### Obtener Lista de Descuentos
```http
GET /discounts
```
Obtiene la lista de descuentos. Requiere autenticación.

**Respuesta Exitosa:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "name": "string",
      "amount": "number",
      "startDate": "string",
      "endDate": "string",
      "isActive": "boolean",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ]
}
```

### Obtener Descuento por ID
```http
GET /discounts/:id
```
Obtiene un descuento específico por su ID. Requiere autenticación.

**Respuesta Exitosa:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "name": "string",
    "amount": "number",
    "startDate": "string",
    "endDate": "string",
    "isActive": "boolean",
    "createdAt": "string",
    "updatedAt": "string"
  }
}
```

### Crear Descuento
```http
POST /discounts
```
Crea un nuevo descuento. Requiere rol EDITOR.

**Cuerpo de la Petición:**
```json
{
  "name": "string",
  "amount": "number",
  "startDate": "string",
  "endDate": "string",
  "isActive": "boolean"
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "name": "string",
    "amount": "number",
    "startDate": "string",
    "endDate": "string",
    "isActive": "boolean",
    "createdAt": "string",
    "updatedAt": "string"
  }
}
```

### Actualizar Descuento
```http
PUT /discounts/:id
```
Actualiza un descuento existente. Requiere rol EDITOR.

**Cuerpo de la Petición:**
```json
{
  "name": "string",
  "amount": "number",
  "startDate": "string",
  "endDate": "string",
  "isActive": "boolean"
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "name": "string",
    "amount": "number",
    "startDate": "string",
    "endDate": "string",
    "isActive": "boolean",
    "createdAt": "string",
    "updatedAt": "string"
  }
}
```

## Validaciones
- `name`: String, requerido
- `amount`: Número entero, mayor a 0
- `startDate`: Fecha ISO8601 válida, requerida
- `endDate`: Fecha ISO8601 válida, requerida
- `isActive`: Booleano, opcional

## Roles Requeridos
- Todos los usuarios autenticados pueden ver los descuentos
- EDITOR: Puede crear y actualizar descuentos 