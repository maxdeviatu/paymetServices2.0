# Fix: SequelizeUniqueConstraintError en webhooks de ePayco

**Fecha:** 2026-02-18
**Archivo modificado:** `src/services/webhook/index.js`
**Commits relacionados:** `4d456a0` (fix parcial original), commit actual (fix completo)

---

## Problema

ePayco envía `x_transaction_id: '000000'` en modo checkout para todas las transacciones que aún no tienen ID real asignado. La tabla `webhook_events` tiene un índice único parcial en `(event_id, provider) WHERE event_id IS NOT NULL`, lo que causaba `SequelizeUniqueConstraintError` al procesar el segundo webhook de cualquier orden diferente.

### Flujo del bug (antes del fix)

```
Webhook orden A → adaptador ePayco → eventId: null
                → sanitizeWebhookEvent() → eventId: null || 'unknown' → 'unknown'
                → INSERT ('unknown', 'epayco') → OK

Webhook orden B → adaptador ePayco → eventId: null
                → sanitizeWebhookEvent() → eventId: null || 'unknown' → 'unknown'
                → INSERT ('unknown', 'epayco') → SequelizeUniqueConstraintError
```

El commit `4d456a0` corrigió el adaptador para producir `eventId: null` en vez de `'000000'`, pero la sanitización en `sanitizeWebhookEvent()` convertía ese `null` en `'unknown'`, reproduciendo el mismo problema con un valor distinto.

---

## Cambios realizados

### 1. Preservar `null` en `eventId` durante sanitización (linea 382)

```javascript
// Antes:
eventId: this.sanitizeString(webhookEvent.eventId) || 'unknown',

// Despues:
eventId: this.sanitizeString(webhookEvent.eventId) || null,
```

**Por que:** Cuando `eventId` es `null`, el indice parcial `WHERE event_id IS NOT NULL` lo excluye, permitiendo multiples registros con `eventId = NULL` sin colision.

### 2. Manejo de `UniqueConstraintError` en `registerWebhookEvent` (lineas 343-371)

```javascript
try {
  return await WebhookEvent.create({ ... })
} catch (error) {
  if (error instanceof UniqueConstraintError) {
    // Log warning y retornar evento existente
    const existing = await WebhookEvent.findOne({
      where: { eventId, provider }
    })
    if (existing) return existing
  }
  throw error
}
```

**Por que:** Protege contra condiciones de carrera. Si dos webhooks con el mismo `eventId` llegan simultaneamente, uno gana el INSERT y el otro recibe el `UniqueConstraintError`. En vez de fallar, el segundo retorna el registro existente y el procesamiento continua normalmente.

---

## Que NO se toco (y por que)

| Componente | Razon |
|---|---|
| `src/services/webhook/providers/epayco.js` | El fix del adaptador en `4d456a0` es correcto: produce `null` cuando `x_transaction_id === '000000'` |
| Verificacion de firma (HMAC-SHA256) | Funciona correctamente segun docs de ePayco |
| `checkIdempotency()` | La idempotencia por `(provider, externalRef)` funciona bien; el problema era solo en el INSERT posterior |
| Mapeo de estados ePayco (codigos 1-11) | Sin cambios necesarios |
| Registros historicos con `event_id='000000'` | Datos historicos inofensivos, no requieren migracion |

---

## Como verificar

1. Enviar dos webhooks consecutivos de ePayco con ordenes diferentes (ambos tendran `x_transaction_id: '000000'`):
   ```bash
   npm run webhook:test
   ```

2. Verificar en la BD que ambos registros se crearon con `event_id = NULL`:
   ```sql
   SELECT id, event_id, provider, external_ref, status
   FROM webhook_events
   WHERE provider = 'epayco'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

3. Ejecutar tests:
   ```bash
   npm test
   ```

---

## Diagrama del flujo corregido

```
Webhook orden A → adaptador ePayco → eventId: null
                → sanitizeWebhookEvent() → eventId: null || null → NULL
                → INSERT (NULL, 'epayco') → OK (indice parcial no aplica)

Webhook orden B → adaptador ePayco → eventId: null
                → sanitizeWebhookEvent() → eventId: null || null → NULL
                → INSERT (NULL, 'epayco') → OK (indice parcial no aplica)

Webhook con ID real → adaptador ePayco → eventId: 'abc123'
                    → sanitizeWebhookEvent() → eventId: 'abc123'
                    → INSERT ('abc123', 'epayco') → OK (indice unico protege duplicados reales)
```
