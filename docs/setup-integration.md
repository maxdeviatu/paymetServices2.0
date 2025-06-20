# Guía de Setup - Integración Cobre + Webhooks

## 🚀 Configuración Inicial

### 1. **Preparar el Entorno**

```bash
# Clonar el repositorio
git clone <repository-url>
cd paymetServices2.0

# Instalar dependencias
npm install

# Copiar archivo de configuración
cp .env.example .env
```

### 2. **Configurar Variables de Entorno**

Editar el archivo `.env` con tus credenciales:

```bash
# Configuración básica
PORT=3000
NODE_ENV=development

# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=payment-s2.0
DB_USER=postgres
DB_PASS=tu_password

# JWT
JWT_SECRET=tu_jwt_secret_muy_largo_y_seguro
JWT_EXPIRES_IN=24h

# Cobre (OBLIGATORIO)
COBRE_USER_ID=cli_tu_user_id
COBRE_SECRET=tu_secret
COBRE_BASE_URL=https://api.cobre.co

# Webhooks (OBLIGATORIO)
COBRE_WEBHOOK_URL=https://tu-ngrok-url.ngrok-free.app
COBRE_WEBHOOK_SECRET=tu_webhook_secret_min_10_chars
```

## 🔐 Configuración de Cobre

### 1. **Obtener Credenciales**

1. Ir a [Dashboard de Cobre](https://dashboard.cobre.co)
2. Navegar a **API Keys** o **Credenciales**
3. Crear nueva aplicación o usar existente
4. Copiar `CLIENT_ID` y `CLIENT_SECRET`

### 2. **Configurar Webhooks en Cobre**

1. En el dashboard de Cobre, ir a **Webhooks** o **Notificaciones**
2. Crear nueva suscripción:
   - **URL**: `https://tu-ngrok-url.ngrok-free.app/webhooks/cobre`
   - **Eventos**: `accounts.balance.credit`
   - **Clave de firma**: Usar la misma que `COBRE_WEBHOOK_SECRET`

## 🌐 Configuración de Ngrok (Desarrollo)

### 1. **Instalar Ngrok**

```bash
# Descargar desde https://ngrok.com/download
# O usar npm
npm install -g ngrok
```

### 2. **Exponer el Servidor**

```bash
# Terminal 1: Iniciar el servidor
npm run dev

# Terminal 2: Exponer con ngrok
ngrok http 3000
```

### 3. **Actualizar URL de Webhook**

Copiar la URL de ngrok y actualizar `.env`:
```bash
COBRE_WEBHOOK_URL=https://abc123.ngrok-free.app
```

## 🗄️ Configuración de Base de Datos

### 1. **Crear Base de Datos**

```sql
CREATE DATABASE "payment-s2.0";
```

### 2. **Ejecutar Migraciones**

```bash
# Crear tabla de webhooks
npm run webhook:setup

# O ejecutar todas las migraciones
npm run db:migrate
```

## ✅ Verificación de Configuración

### 1. **Probar Conexión con Cobre**

```bash
npm run cobre:test
```

**Resultado esperado:**
```
🧪 Starting Cobre connection tests...

📋 Test 1: Configuration Check
   ✅ All required environment variables are set
   📍 Base URL: https://api.cobre.co
   🔑 Client ID: cli_xxx...
   🔐 Client Secret: ***configured***

🔐 Test 2: Authentication Test
   ✅ Authentication successful
   🎫 Token: eyJhbGciOiJSUzI1NiIs...

✅ Test 3: Token Validation Test
   ✅ Token is valid

🏦 Test 4: Account Access Test
   ✅ Account access successful
   🆔 Account ID: acc_xxx
   💰 Balance: 100000
   💱 Currency: COP

🎉 All tests completed successfully!
🚀 Cobre is ready to use
```

### 2. **Verificar Suscripción de Webhooks**

```bash
npm run cobre:subscribe
```

**Resultado esperado:**
```
🚀 CobreSubscriptionBootstrap: Starting subscription bootstrap
📋 Configuration verified: {
  webhookUrl: 'https://abc123.ngrok-free.app',
  webhookSecret: '***configured***',
  baseUrl: 'https://api.cobre.co'
}
🔐 Getting Cobre access token...
✅ Cobre access token obtained successfully
🔍 Checking existing subscriptions...
📊 Found 1 existing subscription(s)
✅ Found existing subscription for our webhook
✅ Subscription is up to date, no changes needed
```

## 🚀 Iniciar el Sistema

### 1. **Arranque Completo**

```bash
npm run dev
```