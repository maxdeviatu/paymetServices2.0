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