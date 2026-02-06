# API de Usuarios (Clientes)

## Descripción
Esta API permite gestionar los usuarios del sistema (clientes) con autenticación exclusiva por OTP (One-Time Password) enviado por correo electrónico. Los usuarios tienen acceso limitado solo a sus propios datos y recursos públicos.

## Características de Autenticación
- Autenticación por OTP de 6 dígitos
- OTP válido por 10 minutos
- Token JWT válido por 30 minutos
- Un OTP solo puede usarse una vez

## Endpoints

### Registrar Usuario
```http
POST /users/register
```
Registra un nuevo usuario en el sistema. Endpoint público.

**Cuerpo de la Petición:**
```json
{
  "firstName": "string",
  "lastName": "string",
  "phone": "string",
  "email": "string",
  "documentType": "string",
  "documentNumber": "string",
  "birthDate": "string",
  "consentAccepted": true
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "message": "Usuario creado exitosamente",
  "data": {
    "id": "number",
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phone": "string",
    "documentType": "string",
    "documentNumber": "string",
    "birthDate": "string",
    "consentAccepted": true,
    "createdAt": "string"
  }
}
```

### Solicitar Código OTP
```http
POST /users/request-otp
```
Solicita un código OTP para iniciar sesión. Endpoint público.

**Cuerpo de la Petición:**
```json
{
  "email": "string"
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "message": "Código OTP enviado correctamente",
  "data": {
    "expiresAt": "string"
  }
}
```

### Verificar Código OTP
```http
POST /users/verify-otp
```
Verifica el código OTP y genera un token de acceso. Endpoint público.

**Cuerpo de la Petición:**
```json
{
  "email": "string",
  "code": "string"
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "message": "Autenticación exitosa",
  "data": {
    "token": "string",
    "user": {
      "id": "number",
      "firstName": "string",
      "lastName": "string",
      "email": "string",
      "phone": "string",
      "documentType": "string",
      "documentNumber": "string",
      "birthDate": "string"
    }
  }
}
```

### Obtener Perfil de Usuario
```http
GET /users/profile
```
Obtiene los datos del usuario autenticado. Requiere autenticación.

**Headers:**
```
Authorization: Bearer {token}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "data": {
    "id": "number",
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phone": "string",
    "documentType": "string",
    "documentNumber": "string",
    "birthDate": "string",
    "consentAccepted": true,
    "createdAt": "string",
    "updatedAt": "string"
  }
}
```

### Actualizar Perfil de Usuario
```http
PATCH /users/profile
```
Actualiza los datos del usuario autenticado. Requiere autenticación.

**Headers:**
```
Authorization: Bearer {token}
```

**Cuerpo de la Petición:**
```json
{
  "firstName": "string",
  "lastName": "string",
  "phone": "string",
  "birthDate": "string"
}
```

**Respuesta Exitosa:**
```json
{
  "success": true,
  "message": "Perfil actualizado exitosamente",
  "data": {
    "id": "number",
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phone": "string",
    "documentType": "string",
    "documentNumber": "string",
    "birthDate": "string",
    "updatedAt": "string"
  }
}
```

---

## Endpoints Administrativos

### Buscar Usuario (Admin)

```http
GET /users/admin/search
```

Permite a un administrador buscar un usuario por email o número de documento y obtener toda su información. Útil para verificar los datos antes de realizar una actualización.

**Autenticación:** Token JWT de administrador  
**Rol requerido:** EDITOR o SUPER_ADMIN

**Headers:**
```
Authorization: Bearer {admin_token}
```

#### Parámetros de Query

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `email` | string | Email del usuario a buscar |
| `documentNumber` | string | Número de documento del usuario |

> **Nota:** Debe proporcionar al menos uno de los dos parámetros.

#### Ejemplo en Postman

**URL (buscar por email):**
```
{{base_url}}/api/users/admin/search?email=juan.perez@ejemplo.com
```

**URL (buscar por documento):**
```
{{base_url}}/api/users/admin/search?documentNumber=1234567890
```

**Método:** `GET`

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Respuesta Exitosa (200)

```json
{
  "success": true,
  "data": {
    "id": 123,
    "firstName": "Juan",
    "lastName": "Pérez García",
    "email": "juan.perez@ejemplo.com",
    "phone": "+573001234567",
    "documentType": "CC",
    "documentNumber": "1234567890",
    "birthDate": "1990-05-15",
    "consentAccepted": true,
    "createdAt": "2026-01-15T10:30:00.000Z",
    "updatedAt": "2026-01-22T18:30:00.000Z"
  }
}
```

#### Posibles Errores

**400 - Bad Request (Falta criterio de búsqueda)**
```json
{
  "success": false,
  "message": "Debe proporcionar un criterio de búsqueda: email o documentNumber"
}
```

**401 - Unauthorized (Sin token)**
```json
{
  "success": false,
  "message": "Acceso no autorizado. Token no proporcionado."
}
```

**403 - Forbidden (Rol insuficiente)**
```json
{
  "success": false,
  "message": "No tiene permisos para realizar esta acción. Se requiere rol: EDITOR"
}
```

**404 - Not Found (Usuario no encontrado)**
```json
{
  "success": false,
  "message": "Usuario no encontrado"
}
```

#### Ejemplo con cURL

```bash
# Buscar por email
curl -X GET "http://localhost:3000/api/users/admin/search?email=juan@ejemplo.com" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Buscar por documento
curl -X GET "http://localhost:3000/api/users/admin/search?documentNumber=1234567890" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### Actualizar Usuario (Admin)

```http
PATCH /users/admin/update
```

Permite a un administrador buscar un usuario por email o número de documento y actualizar su información personal. Este endpoint es exclusivo para administradores con rol EDITOR o superior.

**Autenticación:** Token JWT de administrador  
**Rol requerido:** EDITOR o SUPER_ADMIN

**Headers:**
```
Authorization: Bearer {admin_token}
Content-Type: application/json
```

#### Estructura del Request

El cuerpo de la petición tiene dos partes:
- `search`: Criterio de búsqueda (email O documentNumber)
- `update`: Campos a actualizar

#### Campos de Búsqueda

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `search.email` | string | Email del usuario a buscar |
| `search.documentNumber` | string | Número de documento del usuario |

> **Nota:** Debe proporcionar al menos uno de los dos campos de búsqueda.

#### Campos Actualizables

| Campo | Tipo | Validación | Descripción |
|-------|------|------------|-------------|
| `update.firstName` | string | 2-80 caracteres | Nombre del usuario |
| `update.lastName` | string | 2-80 caracteres | Apellido del usuario |
| `update.phone` | string | máx 20 caracteres | Teléfono con indicativo |
| `update.email` | string | email válido, máx 120 | Correo electrónico |
| `update.documentType` | string | CC, CE, PASSPORT, PE | Tipo de documento |
| `update.documentNumber` | string | 1-30 caracteres | Número de documento |
| `update.birthDate` | string | ISO8601 | Fecha de nacimiento |

#### Ejemplo en Postman

**URL:** `{{base_url}}/api/users/admin/update`  
**Método:** `PATCH`

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

**Body (Buscar por email):**
```json
{
  "search": {
    "email": "juan.perez@ejemplo.com"
  },
  "update": {
    "firstName": "Juan Carlos",
    "lastName": "Pérez García",
    "phone": "+573001234567"
  }
}
```

**Body (Buscar por documento):**
```json
{
  "search": {
    "documentNumber": "1234567890"
  },
  "update": {
    "email": "nuevo.correo@ejemplo.com",
    "birthDate": "1990-05-15"
  }
}
```

**Body (Actualización completa):**
```json
{
  "search": {
    "email": "usuario@ejemplo.com"
  },
  "update": {
    "firstName": "María",
    "lastName": "González López",
    "phone": "+573109876543",
    "email": "maria.gonzalez@ejemplo.com",
    "documentType": "CC",
    "documentNumber": "9876543210",
    "birthDate": "1985-12-20"
  }
}
```

#### Respuesta Exitosa (200)

```json
{
  "success": true,
  "message": "Usuario actualizado exitosamente",
  "data": {
    "id": 123,
    "firstName": "Juan Carlos",
    "lastName": "Pérez García",
    "email": "juan.perez@ejemplo.com",
    "phone": "+573001234567",
    "documentType": "CC",
    "documentNumber": "1234567890",
    "birthDate": "1990-05-15",
    "updatedAt": "2026-01-22T18:30:00.000Z"
  }
}
```

#### Posibles Errores

**400 - Bad Request (Falta criterio de búsqueda)**
```json
{
  "success": false,
  "message": "Debe proporcionar un criterio de búsqueda: email o documentNumber"
}
```

**400 - Bad Request (Faltan datos para actualizar)**
```json
{
  "success": false,
  "message": "Debe proporcionar al menos un campo para actualizar"
}
```

**400 - Bad Request (Validación fallida)**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "update.firstName",
      "message": "El nombre debe tener entre 2 y 80 caracteres"
    }
  ]
}
```

**400 - Bad Request (Email duplicado)**
```json
{
  "success": false,
  "message": "Ya existe un usuario con el email nuevo.correo@ejemplo.com"
}
```

**400 - Bad Request (Documento duplicado)**
```json
{
  "success": false,
  "message": "Ya existe un usuario con el documento CC 9876543210"
}
```

**400 - Bad Request (Tipo de documento inválido)**
```json
{
  "success": false,
  "message": "Tipo de documento inválido. Debe ser uno de: CC, CE, PASSPORT, PE"
}
```

**401 - Unauthorized (Sin token)**
```json
{
  "success": false,
  "message": "Acceso no autorizado. Token no proporcionado."
}
```

**401 - Unauthorized (Token inválido)**
```json
{
  "success": false,
  "message": "Acceso no autorizado. Token inválido."
}
```

**403 - Forbidden (Rol insuficiente)**
```json
{
  "success": false,
  "message": "No tiene permisos para realizar esta acción. Se requiere rol: EDITOR"
}
```

**404 - Not Found (Usuario no encontrado)**
```json
{
  "success": false,
  "message": "Usuario no encontrado"
}
```

#### Ejemplo con cURL

```bash
# Buscar por email y actualizar nombre
curl -X PATCH http://localhost:3000/api/users/admin/update \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "search": {
      "email": "juan@ejemplo.com"
    },
    "update": {
      "firstName": "Juan Carlos",
      "lastName": "Pérez Modificado"
    }
  }'

# Buscar por documento y cambiar email
curl -X PATCH http://localhost:3000/api/users/admin/update \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "search": {
      "documentNumber": "1234567890"
    },
    "update": {
      "email": "nuevo.correo@ejemplo.com"
    }
  }'
```

---

## Validaciones

### Registro de Usuario
- `firstName`: String, 2-80 caracteres, requerido
- `lastName`: String, 2-80 caracteres, requerido
- `phone`: String, máximo 20 caracteres, opcional
- `email`: Email válido, máximo 120 caracteres, único, requerido
- `documentType`: Debe ser uno de: "CC", "CE", "PASSPORT", "PE", requerido
- `documentNumber`: String, 1-30 caracteres, único por tipo, requerido
- `birthDate`: Fecha ISO8601 válida, opcional
- `consentAccepted`: Boolean, debe ser true, requerido

### Solicitar OTP
- `email`: Email válido, requerido

### Verificar OTP
- `email`: Email válido, requerido
- `code`: String numérico de 6 dígitos, requerido

### Actualizar Perfil
- `firstName`: String, 2-80 caracteres, opcional
- `lastName`: String, 2-80 caracteres, opcional
- `phone`: String, máximo 20 caracteres, opcional
- `birthDate`: Fecha ISO8601 válida, opcional

## Códigos de Error

### 400 - Bad Request
- Datos de entrada inválidos
- Código OTP inválido o expirado
- Consentimiento no aceptado

### 401 - Unauthorized
- Token no proporcionado
- Token inválido o expirado
- Usuario no autorizado

### 404 - Not Found
- Usuario no encontrado con el email proporcionado

### 500 - Internal Server Error
- Error interno del servidor

## Seguridad

- Los OTPs expiran automáticamente después de 10 minutos
- Un OTP solo puede usarse una vez
- Los tokens JWT tienen una duración máxima de 30 minutos
- Los emails y documentos deben ser únicos
- Solo se pueden actualizar campos específicos del perfil
- Los campos sensibles (email, documento) no se pueden modificar

## Ejemplo de Flujo de Autenticación

1. **Registro:**
```bash
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Juan",
    "lastName": "Pérez",
    "email": "juan@example.com",
    "documentType": "CC",
    "documentNumber": "12345678",
    "consentAccepted": true
  }'
```

2. **Solicitar OTP:**
```bash
curl -X POST http://localhost:3000/api/users/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "juan@example.com"}'
```

3. **Verificar OTP:**
```bash
curl -X POST http://localhost:3000/api/users/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "juan@example.com",
    "code": "123456"
  }'
```

4. **Acceder al perfil:**
```bash
curl -X GET http://localhost:3000/api/users/profile \
  -H "Authorization: Bearer {token_obtenido}"
``` 