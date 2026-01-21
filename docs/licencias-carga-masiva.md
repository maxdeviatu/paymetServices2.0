# Gestión Masiva de Licencias

Este documento describe los endpoints para la carga y desmontaje masivo de licencias mediante archivos CSV.

## Tabla de Contenidos

- [Resumen de Endpoints](#resumen-de-endpoints)
- [Formato del Archivo CSV](#formato-del-archivo-csv)
- [Carga Masiva de Licencias](#carga-masiva-de-licencias-upload)
- [Desmontaje Masivo de Licencias](#desmontaje-masivo-de-licencias-dismount)
- [Plantilla CSV](#plantilla-csv)
- [Configuración en Postman](#configuración-en-postman)
- [Errores Comunes](#errores-comunes)

---

## Resumen de Endpoints

| Endpoint | Método | Rol Requerido | Descripción |
|----------|--------|---------------|-------------|
| `/api/licenses/template` | GET | EDITOR | Descargar plantilla CSV |
| `/api/licenses/upload` | POST | EDITOR | Cargar licencias masivamente |
| `/api/licenses/dismount` | POST | SUPER_ADMIN | Desmontar licencias masivamente |

---

## Formato del Archivo CSV

Ambos endpoints (upload y dismount) utilizan el mismo formato de archivo CSV:

```csv
productRef,licenseKey,instructions
SOFT-PRO-1Y,XXXX-YYYY-ZZZZ-1111,https://example.com/activar
SOFT-PRO-1Y,XXXX-YYYY-ZZZZ-2222,Instrucciones de activación
SOFT-PRO-2Y,AAAA-BBBB-CCCC-3333,
```

### Columnas

| Columna | Requerida | Descripción |
|---------|-----------|-------------|
| `productRef` | Sí | Referencia única del producto (debe existir en el sistema) |
| `licenseKey` | Sí | Clave de licencia única |
| `instructions` | No | Instrucciones de activación (solo para upload) |

### Requisitos del Archivo

- **Formato**: CSV (text/csv)
- **Tamaño máximo**: 5 MB
- **Codificación**: UTF-8
- **Primera fila**: Debe contener los nombres de las columnas

---

## Carga Masiva de Licencias (Upload)

### Descripción

Permite cargar múltiples licencias al inventario desde un archivo CSV. Las licencias se crean con estado `AVAILABLE` listas para ser vendidas.

### Endpoint

```
POST /api/licenses/upload
```

### Autenticación

- **Header**: `Authorization: Bearer <JWT_TOKEN>`
- **Rol mínimo**: `EDITOR`

### Request

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: multipart/form-data
```

**Body (form-data):**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `file` | File | Archivo CSV con las licencias |

### Ejemplo con cURL

```bash
curl -X POST http://localhost:3000/api/licenses/upload \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -F "file=@licencias.csv"
```

### Ejemplo de Archivo CSV para Upload

```csv
productRef,licenseKey,instructions
OFFICE-365-1Y,OFF365-AAAA-BBBB-1111,Activar en office.com/setup
OFFICE-365-1Y,OFF365-AAAA-BBBB-2222,Activar en office.com/setup
OFFICE-365-1Y,OFF365-AAAA-BBBB-3333,Activar en office.com/setup
WINDOWS-11-PRO,WIN11-XXXX-YYYY-4444,Ir a Configuración > Activación
WINDOWS-11-PRO,WIN11-XXXX-YYYY-5555,Ir a Configuración > Activación
```

### Respuestas

#### Éxito (201 Created)

```json
{
  "success": true,
  "message": "Successfully imported 5 licenses",
  "data": {
    "imported": 5,
    "total": 5
  }
}
```

#### Éxito Parcial (201 Created)

Cuando algunas licencias ya existen (duplicados ignorados):

```json
{
  "success": true,
  "message": "Successfully imported 3 licenses",
  "data": {
    "imported": 3,
    "total": 5
  }
}
```

### Comportamiento

1. **Validación de productos**: Verifica que todos los `productRef` existan en el sistema
2. **Validación de tipo**: Verifica que los productos soporten licencias (`license_type = true`)
3. **Duplicados**: Las licencias con `licenseKey` duplicado se ignoran silenciosamente
4. **Estado inicial**: Todas las licencias se crean con estado `AVAILABLE`

---

## Desmontaje Masivo de Licencias (Dismount)

### Descripción

Permite dar de baja múltiples licencias del inventario. Las licencias pasan al estado `ANNULLED` y ya no pueden ser vendidas. Esta operación es **atómica**: si alguna licencia no puede ser desmontada, toda la operación se cancela.

### Endpoint

```
POST /api/licenses/dismount
```

### Autenticación

- **Header**: `Authorization: Bearer <JWT_TOKEN>`
- **Rol mínimo**: `SUPER_ADMIN`

### Request

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: multipart/form-data
```

**Body (form-data):**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `file` | File | Archivo CSV con las licencias a desmontar |

### Ejemplo con cURL

```bash
curl -X POST http://localhost:3000/api/licenses/dismount \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -F "file=@licencias-a-desmontar.csv"
```

### Ejemplo de Archivo CSV para Dismount

```csv
productRef,licenseKey
OFFICE-365-1Y,OFF365-AAAA-BBBB-1111
OFFICE-365-1Y,OFF365-AAAA-BBBB-2222
WINDOWS-11-PRO,WIN11-XXXX-YYYY-4444
```

> **Nota**: La columna `instructions` no es necesaria para el desmontaje.

### Respuestas

#### Éxito (200 OK)

```json
{
  "success": true,
  "message": "Successfully dismounted 3 licenses",
  "data": {
    "dismounted": 3,
    "total": 3
  }
}
```

### Reglas de Negocio

| Estado Actual | ¿Se puede desmontar? | Razón |
|---------------|----------------------|-------|
| `AVAILABLE` | ✅ Sí | Licencia disponible en inventario |
| `RESERVED` | ❌ No | Está reservada para un cliente en lista de espera |
| `SOLD` | ❌ No | Ya fue vendida a un cliente |
| `ANNULLED` | ❌ No | Ya está desmontada |
| `RETURNED` | ❌ No | Tiene historial de devolución |

### Comportamiento

1. **Operación atómica**: Si una licencia falla, ninguna se desmonta
2. **Validación de existencia**: Todas las licencias deben existir
3. **Validación de producto**: El `productRef` debe coincidir con la licencia
4. **Validación de estado**: Solo licencias `AVAILABLE` pueden desmontarse
5. **Renombrado**: La `licenseKey` cambia a `ANULADA-{ID de licencia}`

### Ejemplo de Transformación

| Antes | ID | Después |
|-------|-----|---------|
| `OFF365-AAAA-BBBB-1111` | 42 | `ANULADA-42` |
| `WIN11-XXXX-YYYY-4444` | 156 | `ANULADA-156` |

> **Nota**: Se usa el ID de la licencia (no los últimos caracteres) para garantizar unicidad en operaciones masivas.

---

## Plantilla CSV

### Endpoint

```
GET /api/licenses/template
```

### Autenticación

- **Header**: `Authorization: Bearer <JWT_TOKEN>`
- **Rol mínimo**: `EDITOR`

### Ejemplo con cURL

```bash
curl -X GET http://localhost:3000/api/licenses/template \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -o plantilla-licencias.csv
```

### Respuesta

El servidor devuelve un archivo CSV descargable:

```csv
productRef,licenseKey,instructions
SOFT-PRO-1Y,AAA-BBB-CCC-111,https://example.com/instructions
SOFT-PRO-1Y,AAA-BBB-CCC-222,Follow setup guide at our website
```

---

## Configuración en Postman

### 1. Configurar Autenticación

1. En la pestaña **Authorization**, seleccionar **Bearer Token**
2. Pegar el JWT token obtenido del login de administrador

### 2. Configurar Upload de Archivo

1. En la pestaña **Body**, seleccionar **form-data**
2. Agregar un campo con:
   - **Key**: `file`
   - **Tipo**: Cambiar de "Text" a "File" (click en el dropdown)
   - **Value**: Seleccionar el archivo CSV

### 3. Ejemplo Visual para Upload

```
POST http://localhost:3000/api/licenses/upload

Headers:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

Body (form-data):
  Key: file (tipo: File)
  Value: [Seleccionar archivo licencias.csv]
```

### 4. Ejemplo Visual para Dismount

```
POST http://localhost:3000/api/licenses/dismount

Headers:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

Body (form-data):
  Key: file (tipo: File)
  Value: [Seleccionar archivo desmontar.csv]
```

### Colección de Postman

```json
{
  "info": {
    "name": "Licencias - Carga Masiva",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Descargar Plantilla CSV",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          }
        ],
        "url": "{{baseUrl}}/api/licenses/template"
      }
    },
    {
      "name": "Cargar Licencias (Upload)",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          }
        ],
        "body": {
          "mode": "formdata",
          "formdata": [
            {
              "key": "file",
              "type": "file",
              "src": ""
            }
          ]
        },
        "url": "{{baseUrl}}/api/licenses/upload"
      }
    },
    {
      "name": "Desmontar Licencias (Dismount)",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          }
        ],
        "body": {
          "mode": "formdata",
          "formdata": [
            {
              "key": "file",
              "type": "file",
              "src": ""
            }
          ]
        },
        "url": "{{baseUrl}}/api/licenses/dismount"
      }
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000"
    },
    {
      "key": "token",
      "value": ""
    }
  ]
}
```

---

## Errores Comunes

### Errores de Validación de Archivo

#### Archivo no proporcionado

```json
{
  "success": false,
  "message": "CSV file is required"
}
```
**Causa**: No se adjuntó ningún archivo en la solicitud.

#### Archivo vacío o inválido

```json
{
  "success": false,
  "message": "CSV file is empty or invalid"
}
```
**Causa**: El archivo está vacío o no tiene formato CSV válido.

#### Tipo de archivo incorrecto

```json
{
  "success": false,
  "message": "Only CSV files are allowed"
}
```
**Causa**: Se intentó subir un archivo que no es CSV.

#### Columnas faltantes

```json
{
  "success": false,
  "message": "Missing required columns: licenseKey"
}
```
**Causa**: El CSV no tiene las columnas requeridas (`productRef`, `licenseKey`).

#### Filas con datos vacíos

```json
{
  "success": false,
  "message": "3 rows have empty productRef or licenseKey"
}
```
**Causa**: Algunas filas tienen campos requeridos vacíos.

---

### Errores de Validación de Datos (Upload)

#### Producto no encontrado

```json
{
  "success": false,
  "message": "Products not found: PRODUCTO-INEXISTENTE, OTRO-PRODUCTO"
}
```
**Causa**: Los `productRef` especificados no existen en el sistema.

#### Producto no soporta licencias

```json
{
  "success": false,
  "message": "Products do not support licenses: PRODUCTO-FISICO. Set license_type to true first."
}
```
**Causa**: El producto existe pero no tiene `license_type = true`.

---

### Errores de Validación de Datos (Dismount)

#### Licencias no encontradas

```json
{
  "success": false,
  "message": "Licenses not found: XXX-YYY-ZZZ-999, AAA-BBB-CCC-888"
}
```
**Causa**: Las claves de licencia no existen en el sistema.

#### ProductRef no coincide

```json
{
  "success": false,
  "message": "License OFF365-AAAA-BBBB-1111 belongs to product OFFICE-365-2Y, not OFFICE-365-1Y"
}
```
**Causa**: El `productRef` en el CSV no coincide con el producto real de la licencia.

#### Estado inválido para desmontaje

```json
{
  "success": false,
  "message": "Cannot dismount licenses with invalid status: OFF365-AAAA-BBBB-1111 (SOLD), WIN11-XXXX-YYYY-2222 (RESERVED)"
}
```
**Causa**: Se intentó desmontar licencias que no están en estado `AVAILABLE`.

---

### Errores de Autenticación/Autorización

#### Token no proporcionado

```json
{
  "success": false,
  "message": "Access denied. No token provided."
}
```

#### Token inválido

```json
{
  "success": false,
  "message": "Invalid token."
}
```

#### Permisos insuficientes

```json
{
  "success": false,
  "message": "Access denied. Insufficient permissions."
}
```
**Causa para dismount**: Se requiere rol `SUPER_ADMIN`, no `EDITOR`.

---

## Diagrama de Flujo

### Upload (Carga)

```
┌─────────────────┐
│  Archivo CSV    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validar archivo │──── Error ────► 400 Bad Request
│ (formato, cols) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│Validar productos│──── Error ────► 400 Bad Request
│    existen      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validar tipo    │──── Error ────► 400 Bad Request
│ license_type    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Crear todas    │
│  las licencias  │
│ (ignorar duplic)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   201 Created   │
│ {imported: X}   │
└─────────────────┘
```

### Dismount (Desmontaje)

```
┌─────────────────┐
│  Archivo CSV    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validar archivo │──── Error ────► 400 Bad Request
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│     INICIAR TRANSACCIÓN         │
│         (SERIALIZABLE)          │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────┐
│Buscar licencias │──── No existe ──► ROLLBACK + 400
│  con bloqueo    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│Validar productRef│── No coincide ──► ROLLBACK + 400
│    coincide     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validar estado  │── No AVAILABLE ──► ROLLBACK + 400
│   AVAILABLE     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Actualizar a    │
│   ANNULLED      │
│ (ANULADA-xxxxx) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     COMMIT      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    200 OK       │
│ {dismounted: X} │
└─────────────────┘
```

---

## Notas Adicionales

1. **Idempotencia del Upload**: Puedes ejecutar el mismo CSV de carga múltiples veces sin crear duplicados (las licencias existentes se ignoran).

2. **Atomicidad del Dismount**: A diferencia del upload, el desmontaje es todo-o-nada. Si una sola licencia falla la validación, ninguna se desmonta.

3. **Auditoría**: Todas las operaciones se registran en los logs con el ID del administrador que las ejecutó.

4. **Concurrencia**: El desmontaje usa bloqueo a nivel de base de datos (SELECT FOR UPDATE) para prevenir condiciones de carrera.

5. **Límites**: El tamaño máximo del archivo es 5MB, lo que permite aproximadamente 50,000-100,000 licencias por carga dependiendo de la longitud de los datos.
