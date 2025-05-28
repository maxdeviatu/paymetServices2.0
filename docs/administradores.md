# API de Administradores

## Descripción
Esta API permite gestionar los administradores del sistema. La mayoría de los endpoints requieren autenticación como SUPER_ADMIN.

## Endpoints

### Login de Administrador
```http
POST /admins/login
```
Endpoint público para iniciar sesión como administrador.

**Cuerpo de la Petición:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "data": {
    "token": "string",
    "admin": {
      "id": "string",
      "name": "string",
      "email": "string",
      "phone": "string",
      "role": "string",
      "isActive": "boolean",
      "createdAt": "string",
      "updatedAt": "string"
    }
  }
}
```

### Obtener Lista de Administradores
```http
GET /admins
```
Obtiene la lista de administradores. Requiere rol SUPER_ADMIN.

**Respuesta Exitosa:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "name": "string",
      "email": "string",
      "phone": "string",
      "role": "string",
      "isActive": "boolean",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ]
}
```

### Obtener Administrador por ID
```http
GET /admins/:id
```
Obtiene un administrador específico por su ID. Requiere rol SUPER_ADMIN.

**Respuesta Exitosa:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "name": "string",
    "email": "string",
    "phone": "string",
    "role": "string",
    "isActive": "boolean",
    "createdAt": "string",
    "updatedAt": "string"
  }
}
```

### Crear Administrador
```http
POST /admins
```
Crea un nuevo administrador. Requiere rol SUPER_ADMIN.

**Cuerpo de la Petición:**
```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "role": "string",
  "passwordHash": "string",
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
    "email": "string",
    "phone": "string",
    "role": "string",
    "isActive": "boolean",
    "createdAt": "string",
    "updatedAt": "string"
  }
}
```

### Actualizar Administrador
```http
PUT /admins/:id
```
Actualiza un administrador existente. Requiere rol SUPER_ADMIN.

**Cuerpo de la Petición:**
```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "role": "string",
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
    "email": "string",
    "phone": "string",
    "role": "string",
    "isActive": "boolean",
    "createdAt": "string",
    "updatedAt": "string"
  }
}
```

### Eliminar Administrador
```http
DELETE /admins/:id
```
Elimina un administrador. Requiere rol SUPER_ADMIN.

**Respuesta Exitosa:**
```json
{
  "success": true,
  "message": "Administrador eliminado exitosamente"
}
```

### Restablecer Contraseña
```http
POST /admins/:id/reset-password
```
Restablece la contraseña de un administrador. Requiere rol SUPER_ADMIN.

**Cuerpo de la Petición:**
```json
{
  "newPassword": "string"
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "message": "Contraseña restablecida exitosamente"
}
```

## Validaciones
- `name`: String, requerido
- `email`: Email válido, requerido
- `phone`: String, opcional
- `role`: Debe ser uno de: "READ_ONLY", "EDITOR", "SUPER_ADMIN"
- `passwordHash`: String, mínimo 6 caracteres (solo para creación)
- `isActive`: Booleano, opcional
- `newPassword`: String, mínimo 6 caracteres (para restablecimiento)

## Roles Requeridos
- SUPER_ADMIN: Acceso completo a todos los endpoints excepto login
- Login: Endpoint público 