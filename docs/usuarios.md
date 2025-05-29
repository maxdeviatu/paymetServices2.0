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