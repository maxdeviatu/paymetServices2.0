# 📋 Guía Completa de Variables de Entorno

Esta guía describe detalladamente cada variable de entorno necesaria para configurar correctamente el sistema de pagos de Innovate Learning.

## 🏗️ Configuración Básica

### 1. Copiar el archivo de ejemplo
```bash
cp .env.example .env
```

### 2. Validar configuración
```bash
npm run env:validate
```

---

## 🖥️ Configuración del Servidor

### `PORT`
- **Descripción**: Puerto donde el servidor HTTP escuchará las peticiones
- **Tipo**: Número
- **Por defecto**: `3000`
- **Ejemplo**: `PORT=3000`
- **Notas**: En producción, utiliza el puerto asignado por tu proveedor (Heroku, Railway, etc.)

### `NODE_ENV`
- **Descripción**: Ambiente de ejecución de la aplicación
- **Tipo**: String (enum)
- **Valores permitidos**: `development`, `production`, `test`
- **Por defecto**: `development`
- **Ejemplo**: `NODE_ENV=production`
- **Importante**: 
  - En `development`: Se habilitan logs detallados y sincronización de BD
  - En `production`: Se optimiza el rendimiento y se deshabilitan funciones de debug

---

## 🗄️ Configuración de Base de Datos

### `DB_HOST`
- **Descripción**: Dirección del servidor de PostgreSQL
- **Tipo**: String
- **Requerido**: ✅ Sí
- **Ejemplo**: `DB_HOST=localhost`
- **Cómo obtener**:
  - **Local**: `localhost` o `127.0.0.1`
  - **Railway**: Disponible en el dashboard de Railway
  - **Heroku**: Disponible en las variables de la app
  - **DigitalOcean**: Panel de control de la base de datos

### `DB_PORT`
- **Descripción**: Puerto del servidor PostgreSQL
- **Tipo**: Número
- **Por defecto**: `5432`
- **Ejemplo**: `DB_PORT=5432`
- **Notas**: PostgreSQL usa 5432 por defecto

### `DB_NAME`
- **Descripción**: Nombre de la base de datos
- **Tipo**: String
- **Requerido**: ✅ Sí
- **Ejemplo**: `DB_NAME=payment-s2.0`
- **Cómo crear**:
  ```sql
  CREATE DATABASE "payment-s2.0";
  ```

### `DB_USER`
- **Descripción**: Usuario de la base de datos
- **Tipo**: String
- **Requerido**: ✅ Sí
- **Ejemplo**: `DB_USER=postgres`
- **Notas**: Debe tener permisos de lectura/escritura en la base de datos

### `DB_PASS`
- **Descripción**: Contraseña del usuario de la base de datos
- **Tipo**: String
- **Requerido**: ✅ Sí
- **Ejemplo**: `DB_PASS=mi_contraseña_segura`
- **Seguridad**: Nunca commits esta contraseña en git

---

## 🔐 Configuración JWT

### `JWT_SECRET`
- **Descripción**: Clave secreta para firmar y verificar tokens JWT
- **Tipo**: String
- **Requerido**: ✅ Sí
- **Longitud mínima**: 32 caracteres
- **Longitud recomendada**: 64+ caracteres
- **Ejemplo**: `JWT_SECRET=tu_clave_super_secreta_de_al_menos_32_caracteres`
- **Cómo generar**:
  ```bash
  # Opción 1: OpenSSL
  openssl rand -hex 32

  # Opción 2: Node.js
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

  # Opción 3: Online (usar con precaución)
  # https://generate-secret.vercel.app/64
  ```
- **Seguridad**: 
  - Usa una clave diferente para cada ambiente
  - Nunca reutilices claves entre proyectos
  - Cambia la clave si se compromete

### `JWT_EXPIRES_IN`
- **Descripción**: Tiempo de expiración de los tokens JWT
- **Tipo**: String
- **Por defecto**: `24h`
- **Ejemplo**: `JWT_EXPIRES_IN=24h`
- **Formatos válidos**:
  - Segundos: `3600` (1 hora)
  - Minutos: `60m` (60 minutos)
  - Horas: `24h` (24 horas)
  - Días: `7d` (7 días)

---

## 👤 Configuración de Super Administrador

### `SUPER_ADMIN_EMAIL`
- **Descripción**: Email del super administrador (creado automáticamente)
- **Tipo**: Email válido
- **Requerido**: ✅ Sí
- **Ejemplo**: `SUPER_ADMIN_EMAIL=admin@innovatelearning.com.co`
- **Notas**: 
  - Este usuario se crea automáticamente al iniciar la aplicación
  - Tiene permisos completos sobre el sistema

### `SUPER_ADMIN_PASSWORD`
- **Descripción**: Contraseña del super administrador
- **Tipo**: String
- **Requerido**: ✅ Sí
- **Longitud mínima**: 8 caracteres
- **Ejemplo**: `SUPER_ADMIN_PASSWORD=Innovate@2025`
- **Recomendaciones**:
  - Mínimo 12 caracteres
  - Incluir mayúsculas, minúsculas, números y símbolos
  - Cambiar después del primer login

---

## 💳 Configuración de Cobre

### `COBRE_BASE_URL`
- **Descripción**: URL base de la API de Cobre
- **Tipo**: URL
- **Por defecto**: `https://api.cobre.co`
- **Ejemplo**: `COBRE_BASE_URL=https://api.cobre.co`
- **Notas**: No cambiar a menos que Cobre indique lo contrario

### `COBRE_USER_ID`
- **Tipo**: String
- **Requerido**: ✅ Sí
- **Descripción**: User ID de Cobre para autenticación
- **Formato**: Debe empezar con `cli_`
- **Ejemplo**: `COBRE_USER_ID=cli_ABC123XYZ789`
- **Dónde obtener**: Dashboard de Cobre → Settings → API Keys

### `COBRE_SECRET`
- **Tipo**: String
- **Requerido**: ✅ Sí
- **Descripción**: Secret de Cobre para autenticación
- **Longitud mínima**: 8 caracteres
- **Ejemplo**: `COBRE_SECRET=tu_secret_de_cobre`
- **Dónde obtener**: Dashboard de Cobre → Settings → API Keys

### `COBRE_BALANCE_ID` (Opcional)
- **Descripción**: ID específico de la cuenta de balance en Cobre
- **Tipo**: String (debe empezar con `bal_`)
- **Requerido**: ❌ No (se obtiene automáticamente)
- **Ejemplo**: `COBRE_BALANCE_ID=bal_ABC123`
- **Notas**: El sistema lo detecta automáticamente si no se especifica

---

## 🔗 Configuración de Webhooks

### `COBRE_WEBHOOK_URL`
- **Descripción**: URL donde Cobre enviará las notificaciones de pago
- **Tipo**: URL (debe ser HTTPS)
- **Requerido**: ✅ Sí
- **Ejemplo**: `COBRE_WEBHOOK_URL=https://tu-dominio.com/webhooks/cobre`
- **Cómo configurar**:

#### Para Desarrollo Local:
1. **Instalar ngrok**:
   ```bash
   # MacOS
   brew install ngrok

   # Ubuntu/Debian
   curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
   echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
   sudo apt update && sudo apt install ngrok
   ```

2. **Crear túnel**:
   ```bash
   ngrok http 3000
   ```

3. **Copiar URL HTTPS**:
   ```
   Forwarding    https://abc123.ngrok.io -> http://localhost:3000
   ```

4. **Configurar variable**:
   ```bash
   COBRE_WEBHOOK_URL=https://abc123.ngrok.io/webhooks/cobre
   ```

#### Para Producción:
```bash
COBRE_WEBHOOK_URL=https://tu-dominio.com/webhooks/cobre
```

### `COBRE_WEBHOOK_SECRET`
- **Descripción**: Clave secreta para verificar la autenticidad de los webhooks
- **Tipo**: String
- **Requerido**: ✅ Sí
- **Longitud**: 10-64 caracteres
- **Ejemplo**: `COBRE_WEBHOOK_SECRET=mi_clave_webhook_secreta_123`
- **Cómo configurar**:

1. **Generar clave secreta**:
   ```bash
   # Generar clave aleatoria
   openssl rand -base64 32
   ```

2. **Configurar en tu .env**:
   ```bash
   COBRE_WEBHOOK_SECRET=tu_clave_generada
   ```

3. **Configurar la misma clave en Cobre**:
   - Ir al Dashboard de Cobre
   - Navegar a **"Webhooks"** o **"Configuración"**
   - Agregar tu URL de webhook
   - Configurar la **misma clave secreta**
   - Suscribirse al evento `accounts.balance.credit`

---

## 🌐 Configuración de Aplicación

### `COMPANY_NAME`
- **Descripción**: Nombre de la empresa (aparece en los checkouts)
- **Tipo**: String
- **Por defecto**: `Innovate Learning`
- **Ejemplo**: `COMPANY_NAME=Innovate Learning`
- **Notas**: Aparece en las páginas de pago de Cobre

### `FRONTEND_URL`
- **Descripción**: URL del frontend de la aplicación
- **Tipo**: URL
- **Ejemplo**: `FRONTEND_URL=https://innovatelearning.com.co`
- **Uso**: Para enlaces en emails y redirecciones

### `PAYMENT_SUCCESS_URL`
- **Descripción**: URL de redirección después de un pago exitoso
- **Tipo**: URL
- **Ejemplo**: `PAYMENT_SUCCESS_URL=https://innovatelearning.com.co/payment/success`
- **Notas**: Los usuarios son redirigidos aquí después de pagar

---

## 🔒 Configuración de Seguridad

### `CORS_ORIGIN`
- **Descripción**: Dominios permitidos para requests CORS
- **Tipo**: String
- **Por defecto**: `*` (todos los dominios)
- **Ejemplos**:
  - Desarrollo: `CORS_ORIGIN=*`
  - Producción: `CORS_ORIGIN=https://innovatelearning.com.co`
  - Múltiples: `CORS_ORIGIN=https://app.com,https://admin.app.com`

### `WEBHOOK_RATE_LIMIT`
- **Descripción**: Límite de requests por minuto para webhooks
- **Tipo**: Número
- **Por defecto**: `50`
- **Ejemplo**: `WEBHOOK_RATE_LIMIT=100`

---

## 📝 Configuración de Logging

### `LOG_LEVEL`
- **Descripción**: Nivel de detalle de los logs
- **Tipo**: String (enum)
- **Valores**: `error`, `warn`, `info`, `debug`
- **Por defecto**: `info`
- **Ejemplo**: `LOG_LEVEL=debug`
- **Recomendaciones**:
  - Desarrollo: `debug`
  - Producción: `info` o `warn`

---

## 📧 Configuración de Email (Opcional)

### `SMTP_HOST`
- **Descripción**: Servidor SMTP para envío de emails
- **Tipo**: String
- **Ejemplo**: `SMTP_HOST=smtp.gmail.com`
- **Proveedores comunes**:
  - Gmail: `smtp.gmail.com`
  - Outlook: `smtp-mail.outlook.com`
  - Yahoo: `smtp.mail.yahoo.com`

### `SMTP_PORT`
- **Descripción**: Puerto del servidor SMTP
- **Tipo**: Número
- **Ejemplo**: `SMTP_PORT=587`
- **Puertos comunes**:
  - 587: STARTTLS (recomendado)
  - 465: SSL/TLS
  - 25: Sin cifrado (no recomendado)

### `SMTP_USER`
- **Descripción**: Usuario/email para autenticación SMTP
- **Tipo**: Email
- **Ejemplo**: `SMTP_USER=noreply@innovatelearning.com.co`

### `SMTP_PASS`
- **Descripción**: Contraseña para autenticación SMTP
- **Tipo**: String
- **Ejemplo**: `SMTP_PASS=tu_contraseña_email`
- **Para Gmail**: Usar "App Password" en lugar de la contraseña normal

### `SMTP_FROM`
- **Descripción**: Dirección de envío que aparecerá en los emails
- **Tipo**: Email
- **Ejemplo**: `SMTP_FROM=noreply@innovatelearning.com.co`

---

## 🚀 Scripts de Configuración

### Validar configuración completa
```bash
npm run env:validate
```

### Probar conexión con Cobre
```bash
npm run cobre:test
```

### Configurar webhooks automáticamente
```bash
npm run cobre:subscribe
```

### Crear tabla de webhooks
```bash
npm run webhook:setup
```

---

## ⚠️ Errores Comunes y Soluciones

### 1. **Error: "COBRE_USER_ID must start with cli_"**

**Problema**: El User ID de Cobre no tiene el formato correcto.

**Solución**:
```bash
# Verificar el formato actual
echo $COBRE_USER_ID

# Debe empezar con cli_
# Ejemplo correcto: cli_ABC123XYZ789
# Ejemplo incorrecto: ABC123XYZ789

# Corregir en .env
COBRE_USER_ID=cli_tu_user_id_correcto
```

### 2. **Error: "Webhook URL must use HTTPS"**
**Problema**: La URL de webhook usa HTTP en lugar de HTTPS
**Solución**: 
- En desarrollo: Usar ngrok para obtener HTTPS
- En producción: Configurar SSL en tu dominio

### 3. **Error: "JWT_SECRET must be at least 32 characters"**
**Problema**: La clave JWT es muy corta
**Solución**: Generar una nueva clave más larga:
```bash
openssl rand -hex 32
```

### 4. **Error: "Database connection failed"**
**Problema**: No se puede conectar a PostgreSQL
**Solución**: 
- Verificar que PostgreSQL esté corriendo
- Comprobar credenciales de base de datos
- Verificar que la base de datos exista

### 5. **Error: "Cobre authentication failed"**
**Problema**: Credenciales de Cobre incorrectas
**Solución**: 
- Verificar Client ID y Client Secret en el dashboard de Cobre
- Asegurarse de que las credenciales sean del ambiente correcto (sandbox/production)

---

## 🔧 Configuración por Ambiente

### Desarrollo Local
```bash
NODE_ENV=development
DB_HOST=localhost
COBRE_WEBHOOK_URL=https://abc123.ngrok.io/webhooks/cobre
LOG_LEVEL=debug
CORS_ORIGIN=*
```

### Producción
```bash
NODE_ENV=production
DB_HOST=tu-servidor-bd.com
COBRE_WEBHOOK_URL=https://tu-dominio.com/webhooks/cobre
LOG_LEVEL=info
CORS_ORIGIN=https://tu-frontend.com
```

### Testing
```bash
NODE_ENV=test
DB_NAME=payment_test
LOG_LEVEL=error
```

---

## 📞 Soporte

Si tienes problemas con la configuración:

1. **Ejecutar validación**: `npm run env:validate`
2. **Revisar logs**: `tail -f logs/app.log`
3. **Probar conexiones**: `npm run cobre:test`
4. **Consultar documentación**: Este archivo y `.env.example`

---

## 🔒 Seguridad

### ⚠️ Nunca hagas esto:
- Commitear el archivo `.env` en git
- Compartir credenciales en chat/email
- Usar las mismas claves en diferentes ambientes
- Usar credenciales de producción en desarrollo

### ✅ Mejores prácticas:
- Usar claves diferentes para cada ambiente
- Rotar credenciales regularmente
- Usar herramientas de gestión de secrets en producción
- Monitorear accesos a las APIs

---

## ⚙️ Configuración Opcional

### `ENABLE_WAITLIST_PROCESSING`
- **Descripción**: Habilita o deshabilita el procesamiento automático de la lista de espera
- **Tipo**: Boolean
- **Valores permitidos**: `true`, `false`
- **Por defecto**: `false`
- **Ejemplo**: `ENABLE_WAITLIST_PROCESSING=false`
- **Notas**: 
  - `true`: El job procesa automáticamente la lista de espera cada 30 segundos
  - `false`: El job se pausa y no procesa automáticamente
  - Útil para desarrollo o cuando se quiere control manual del procesamiento

*Última actualización: Junio 2025*