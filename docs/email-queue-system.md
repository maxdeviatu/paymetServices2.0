# Sistema de Cola de Correos para Lista de Espera

## Descripción

El sistema de cola de correos mejora la gestión de envío de licencias y notificaciones de la lista de espera, evitando saturar el servidor de correos con envíos masivos y garantizando una entrega ordenada y controlada.

## Características Principales

### 1. Envío Controlado
- Intervalo configurable entre envíos (por defecto 30 segundos)
- Máximo de reintentos configurable (por defecto 3)
- Tamaño máximo de cola configurable (por defecto 1000)

### 2. Procesamiento Asíncrono
- Los correos se procesan en segundo plano sin bloquear el sistema principal
- Gestión automática de la cola con inicio/parada inteligente
- Logs detallados para trazabilidad

### 3. Estados de Orden Actualizados
- Las órdenes solo se marcan como `COMPLETED` después del envío exitoso del correo
- Separación clara entre asignación de licencia y notificación al cliente

## Variables de Entorno

```properties
# Configuración de cola de correos para lista de espera
WAITLIST_EMAIL_INTERVAL_SECONDS=30          # Intervalo entre envíos (segundos)
WAITLIST_EMAIL_MAX_RETRIES=3                # Máximo de reintentos por correo
WAITLIST_EMAIL_QUEUE_MAX_SIZE=1000          # Tamaño máximo de la cola
```

## Flujo de Proceso Mejorado

### 1. Fase de Reserva Masiva
```
Cliente intenta comprar → Sin stock → Agregar a lista de espera
↓
Job de procesamiento → Reservar licencias disponibles (masivamente)
↓
Cambiar estado de licencias a RESERVED y entradas a RESERVED
```

### 2. Fase de Asignación Controlada
```
Job de procesamiento → Procesar entradas RESERVED
↓
Asignar licencia → Cambiar estado a SOLD
↓
Marcar entrada como COMPLETED → Agregar correo a cola
↓
Cola procesa correo (cada 30s) → Marcar orden como COMPLETED
```

## APIs Administrativas

### Obtener estadísticas de la cola
```http
GET /api/email-queue/stats
Authorization: Bearer <admin_token>
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "queueSize": 15,
    "isProcessing": true,
    "intervalSeconds": 30,
    "maxRetries": 3,
    "maxQueueSize": 1000,
    "typeStats": {
      "LICENSE_EMAIL": 12,
      "WAITLIST_NOTIFICATION": 3
    },
    "statusStats": {
      "PENDING": 13,
      "RETRYING": 2
    }
  }
}
```

### Obtener métricas completas
```http
GET /api/email-queue/metrics?productRef=PROD_001
Authorization: Bearer <admin_token>
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "waitlist": {
      "total": 45,
      "pending": 20,
      "reserved": 15,
      "processing": 2,
      "completed": 8,
      "failed": 0,
      "productRef": "PROD_001"
    },
    "emailQueue": {
      "queueSize": 15,
      "isProcessing": true,
      "intervalSeconds": 30
    }
  }
}
```

### Limpiar cola (Solo Super Admin)
```http
POST /api/email-queue/clear
Authorization: Bearer <super_admin_token>
```

### Procesar cola manualmente
```http
POST /api/email-queue/process
Authorization: Bearer <admin_token>
```

## Beneficios del Sistema

### 1. Protección del Servidor de Correos
- Evita saturación con envíos masivos
- Respeta límites de rate limiting de proveedores de email
- Reduce probabilidad de ser marcado como spam

### 2. Experiencia de Usuario Mejorada
- Garantiza que todos los usuarios reciban sus licencias
- Mantiene orden justo (FIFO) en la asignación
- Estados de orden precisos y actualizados

### 3. Operación y Monitoreo
- Métricas detalladas para administradores
- Logs completos para debugging
- Controles manuales para casos excepcionales

### 4. Escalabilidad
- Procesamiento asíncrono no bloquea el sistema principal
- Cola en memoria eficiente para volúmenes moderados
- Fácil configuración de parámetros según necesidades

## Consideraciones de Implementación

### 1. Persistencia
- La cola actual es en memoria (se pierde al reiniciar el servidor)
- Para producción considera implementar persistencia en Redis o base de datos

### 2. Monitoreo
- Implementar alertas para cola llena o fallos recurrentes
- Dashboard para visualizar métricas en tiempo real

### 3. Configuración de Producción
```properties
# Configuración conservadora para producción
WAITLIST_EMAIL_INTERVAL_SECONDS=60          # 1 minuto entre envíos
WAITLIST_EMAIL_MAX_RETRIES=5                # Más reintentos
WAITLIST_EMAIL_QUEUE_MAX_SIZE=5000          # Cola más grande
```

## Migración desde Sistema Anterior

El sistema mantiene compatibilidad con el flujo anterior:
- Método `processSingleEntry()` sigue disponible para envío inmediato
- Método `processSingleEntryWithQueue()` nuevo para envío controlado
- Variable `ENABLE_WAITLIST_PROCESSING` controla activación del nuevo sistema
