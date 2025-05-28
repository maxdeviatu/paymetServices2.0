# Autenticación

## Descripción General

El sistema utiliza JWT (JSON Web Tokens) para la autenticación. Los tokens se generan al iniciar sesión y deben incluirse en todas las peticiones subsiguientes en el header `Authorization`.

## Proceso de Autenticación

1. **Registro de Usuario**: Solo los SUPER_ADMIN pueden crear nuevos usuarios
2. **Login**: Obtener token JWT
3. **Uso del Token**: Incluir en todas las peticiones subsiguientes

## Niveles de Permiso

- `READ_ONLY`: Solo lectura
- `EDITOR`: Lectura y escritura
- `SUPER_ADMIN`: Acceso total

## Endpoints de Autenticación

### Login

```http
POST http://localhost:3000/api/admins/login
Content-Type: application/json

{
  "email": "superadmin@innovatelearning.com.co",
  "password": "Innovate@202025"
}
```

Respuesta exitosa:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "admin": {
      "id": 1,
      "name": "Super Admin",
      "email": "superadmin@innovatelearning.com.co",
      "role": "SUPER_ADMIN",
      "isActive": true
    }
  },
  "message": "Autenticación exitosa"
}
```

### Crear Nuevo Usuario (Requiere SUPER_ADMIN)

```http
POST http://localhost:3000/api/admins
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Nuevo Usuario",
  "email": "usuario@innovatelearning.com.co",
  "passwordHash": "Contraseña123",
  "role": "EDITOR",
  "isActive": true
}
```

### Restablecer Contraseña (Requiere SUPER_ADMIN)

```http
POST http://localhost:3000/api/admins/:id/reset-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "newPassword": "NuevaContraseña123"
}
```

## Ejemplo de Uso con cURL

### Login

```bash
curl -X POST http://localhost:3000/api/admins/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "superadmin@innovatelearning.com.co",
    "password": "Innovate@202025"
  }'
```

### Acceso a Recurso Protegido

```bash
curl -X GET http://localhost:3000/api/products \
  -H "Authorization: Bearer <token>"
```

## Pruebas con Postman

### 1. Login

- **Método**: POST
- **URL**: `http://localhost:3000/api/admins/login`
- **Headers**:
  - `Content-Type: application/json`
- **Body**:
```json
{
  "email": "superadmin@innovatelearning.com.co",
  "password": "Innovate@202025"
}
```

### 2. Crear Usuario (Requiere SUPER_ADMIN)

- **Método**: POST
- **URL**: `http://localhost:3000/api/admins`
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer <token>`
- **Body**:
```json
{
  "name": "Nuevo Usuario",
  "email": "usuario@innovatelearning.com.co",
  "passwordHash": "Contraseña123",
  "role": "EDITOR",
  "isActive": true
}
```

## Notas Importantes

1. **Seguridad del Token**:
   - El token expira en 24 horas
   - Mantener el token seguro y no compartirlo
   - Usar HTTPS en producción

2. **Manejo de Errores**:
   - 401: Token no proporcionado o inválido
   - 403: Permisos insuficientes
   - 404: Ruta no encontrada
   - 500: Error interno del servidor

3. **Credenciales por Defecto**:
   - Email: superadmin@innovatelearning.com.co
   - Password: Innovate@202025

4. **Roles y Permisos**:
   - Solo SUPER_ADMIN puede crear nuevos usuarios
   - EDITOR puede modificar productos y descuentos
   - READ_ONLY solo puede ver información

## Ejemplos de Respuestas de Error

### Token No Proporcionado
```json
{
  "success": false,
  "message": "Acceso no autorizado. Token no proporcionado."
}
```

### Token Inválido
```json
{
  "success": false,
  "message": "Token inválido o expirado."
}
```

### Permisos Insuficientes
```json
{
  "success": false,
  "message": "No tiene permisos para realizar esta acción."
}
```