# Guía de Carga Masiva de Productos

Esta guía describe cómo utilizar el sistema de carga masiva de productos mediante archivos CSV.

## Descripción General

El endpoint de carga masiva permite importar múltiples productos a la base de datos de forma simultánea mediante un archivo CSV. Esto es útil cuando se necesita agregar un catálogo completo de productos sin tener que crearlos uno por uno.

## Requisitos de Acceso

| Requisito | Valor |
|-----------|-------|
| **Endpoint** | `POST /api/products/upload` |
| **Autenticación** | JWT Bearer Token |
| **Rol mínimo** | `EDITOR` |
| **Tipo de contenido** | `multipart/form-data` |
| **Nombre del campo** | `file` |
| **Tamaño máximo** | 5 MB |
| **Formato** | CSV (text/csv) |

## Estructura del Archivo CSV

### Archivo de Ejemplo

Se incluye un archivo de ejemplo en esta misma carpeta: [`products-template.csv`](./products-template.csv)

### Columnas del CSV

El archivo CSV debe contener las siguientes columnas en la primera fila (encabezados):

| Columna | Requerida | Tipo | Descripción |
|---------|:---------:|------|-------------|
| `name` | **Sí** | String | Nombre del producto |
| `productRef` | **Sí** | String | Referencia única (ISBN, SKU, código interno) |
| `price` | **Sí** | Integer | Precio del producto (en la unidad mínima de la moneda) |
| `currency` | No | String | Código de moneda (USD, EUR, COP, MXN). Default: COP |
| `description` | No | String | Descripción detallada del producto |
| `features` | No | String | Características o especificaciones del producto |
| `image` | No | URL | URL de la imagen del producto |
| `provider` | No | String | Nombre del proveedor o fabricante |
| `license_type` | No | Boolean | Indica si es un producto de licencias digitales |

---

## Descripción Detallada de Campos

### `name` (Requerido)

**Propósito en la tabla:** Nombre visible del producto que se mostrará a los usuarios.

**Características:**
- No puede estar vacío
- Se utiliza automáticamente para generar el `slug` del producto (URL amigable)
- Ejemplo: `"StartUp Student Book - Split A Level 1 (A1)"`

**Recomendaciones:**
- Use nombres descriptivos y únicos
- Incluya información relevante como nivel, edición o versión
- Evite caracteres especiales innecesarios

---

### `productRef` (Requerido)

**Propósito en la tabla:** Identificador único del producto en el sistema. Se usa para referenciar el producto en órdenes, licencias y transacciones.

**Características:**
- **Debe ser único** - No puede repetirse en el CSV ni existir previamente en la base de datos
- Se utiliza como clave de referencia en todo el sistema
- Típicamente es un ISBN, SKU o código interno

**Ejemplos válidos:**
- ISBN: `9780137379583`
- SKU: `PROD-001-2024`
- Código interno: `startup-level-1-a`

**Errores comunes:**
- Referencias duplicadas en el mismo CSV
- Referencias que ya existen en la base de datos

---

### `price` (Requerido)

**Propósito en la tabla:** Precio base del producto antes de descuentos.

**Características:**
- Debe ser un número entero >= 0
- Representa el precio en la **unidad mínima de la moneda**:
  - COP: centavos (100 = $1 COP, aunque normalmente COP no usa decimales)
  - USD: centavos (100 = $1.00 USD)
  - EUR: centavos (100 = €1.00 EUR)
- Un valor de `0` indica producto gratuito o precio por definir

**Ejemplos:**
| Valor en CSV | Moneda | Precio real |
|--------------|--------|-------------|
| `150000` | COP | $150,000 COP |
| `9999` | USD | $99.99 USD |
| `0` | COP | Gratuito / Por definir |

---

### `currency` (Opcional)

**Propósito en la tabla:** Define la moneda en la que está expresado el precio.

**Valores permitidos:**
| Código | Moneda |
|--------|--------|
| `COP` | Peso Colombiano (default) |
| `USD` | Dólar Estadounidense |
| `EUR` | Euro |
| `MXN` | Peso Mexicano |

**Default:** `COP` si no se especifica.

---

### `description` (Opcional)

**Propósito en la tabla:** Descripción extendida del producto que se muestra en la página de detalle.

**Características:**
- Campo de texto libre
- Puede contener múltiples líneas si se encierra entre comillas
- Útil para SEO y para informar al cliente

**Ejemplo:**
```
"StartUp Student Book w/ mobile app & MyEnglishLab - Split A Level 1 (A1)"
```

---

### `features` (Opcional)

**Propósito en la tabla:** Lista de características, especificaciones o contenido del producto.

**Características:**
- Campo de texto libre
- Ideal para listar componentes incluidos
- Se puede usar formato de lista separada por comas

**Ejemplo:**
```
"Libro físico, Acceso a app móvil, MyEnglishLab incluido, Material descargable"
```

---

### `image` (Opcional)

**Propósito en la tabla:** URL de la imagen principal del producto.

**Características:**
- Debe ser una URL válida (http:// o https://)
- Se valida el formato de URL durante la importación
- Si está vacío, el producto se creará sin imagen

**Ejemplo:**
```
https://cdn.example.com/products/startup-level-1.jpg
```

**Errores comunes:**
- URLs malformadas
- Rutas locales en lugar de URLs completas

---

### `provider` (Opcional)

**Propósito en la tabla:** Nombre del proveedor, editorial o fabricante del producto.

**Características:**
- Campo de texto libre
- Útil para filtrar o agrupar productos por proveedor

**Ejemplos:**
- `Pearson`
- `McGraw-Hill`
- `Microsoft`

---

### `license_type` (Opcional)

**Propósito en la tabla:** Indica si el producto es de tipo "licencia digital" y debe integrarse con el sistema de gestión de licencias.

**Características:**
- Tipo booleano
- Si es `true`, el producto aparecerá en el módulo de licencias
- Si es `false` o está vacío, se trata como producto físico o servicio

**Valores aceptados:**
| Valor en CSV | Interpretación |
|--------------|----------------|
| `true`, `1`, `yes`, `si` | Es producto de licencias |
| `false`, `0`, `no`, vacío | No es producto de licencias |

**Cuándo usar `true`:**
- Productos que requieren asignación de claves de licencia
- Software con códigos de activación
- Accesos digitales con llaves únicas

---

## Formato del Archivo CSV

### Reglas de Formato

1. **Separador:** Coma (`,`)
2. **Codificación:** UTF-8
3. **Primera fila:** Debe contener los nombres de las columnas (encabezados)
4. **Valores con comas:** Encerrar entre comillas dobles (`"valor, con coma"`)
5. **Comillas en valores:** Usar doble comilla para escapar (`"valor con ""comillas"" internas"`)

### Ejemplo de CSV Correcto

```csv
name,productRef,price,currency,description,features,image,provider,license_type
"StartUp Student Book - Split A Level 1 (A1)","9780137379583",0,COP,"StartUp Student Book w/ mobile app & MyEnglishLab - Split A Level 1 (A1)",,,,true
"StartUp Student Book - Split B Level 1 (A1)","9780137379590",0,COP,"StartUp Student Book w/ mobile app & MyEnglishLab - Split B Level 1 (A1)",,,,true
```

---

## Cómo Realizar la Carga

### Usando cURL

```bash
curl -X POST \
  https://api.example.com/api/products/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/ruta/al/archivo.csv"
```

### Usando Postman

1. Crear nueva petición `POST`
2. URL: `https://api.example.com/api/products/upload`
3. En Headers: `Authorization: Bearer YOUR_JWT_TOKEN`
4. En Body: Seleccionar `form-data`
5. Agregar campo `file` de tipo `File`
6. Seleccionar el archivo CSV
7. Enviar

### Respuesta Exitosa

```json
{
  "success": true,
  "message": "Se importaron 7 productos exitosamente",
  "data": {
    "imported": 7,
    "total": 7,
    "products": [
      {
        "id": 25,
        "name": "StartUp Student Book - Split A Level 1 (A1)",
        "productRef": "9780137379583",
        "price": 0,
        "currency": "COP"
      }
      // ... más productos
    ]
  }
}
```

---

## Errores Comunes y Soluciones

### Error: "Columnas requeridas faltantes"

```json
{
  "success": false,
  "message": "Columnas requeridas faltantes: productRef, price"
}
```

**Causa:** El archivo CSV no tiene las columnas obligatorias en el encabezado.

**Solución:** Verificar que la primera línea contenga exactamente: `name,productRef,price`

---

### Error: "Referencias duplicadas en el CSV"

```json
{
  "success": false,
  "message": "Referencias duplicadas en el CSV: 9780137379583, 9780137379590"
}
```

**Causa:** El mismo `productRef` aparece más de una vez en el archivo.

**Solución:** Revisar el CSV y eliminar las filas duplicadas.

---

### Error: "Las siguientes referencias ya existen en la base de datos"

```json
{
  "success": false,
  "message": "Las siguientes referencias ya existen en la base de datos: 9780137379583"
}
```

**Causa:** Se intenta importar productos con referencias que ya están registradas.

**Solución:** 
- Eliminar del CSV los productos que ya existen
- O actualizar los productos existentes mediante el endpoint individual `PUT /api/products/:id`

---

### Error: "El precio debe ser un número entero mayor o igual a 0"

```json
{
  "success": false,
  "message": "Fila 3: El precio debe ser un número entero mayor o igual a 0"
}
```

**Causa:** El valor de `price` no es un número válido.

**Solución:** Verificar que el precio sea un número entero sin decimales ni caracteres especiales.

---

### Error: "La imagen debe ser una URL válida"

```json
{
  "success": false,
  "message": "Fila 5: La imagen debe ser una URL válida"
}
```

**Causa:** El campo `image` contiene un valor que no es una URL válida.

**Solución:** 
- Usar URLs completas: `https://example.com/image.jpg`
- O dejar el campo vacío si no hay imagen

---

## Campos Automáticos

Los siguientes campos se generan automáticamente y **no deben incluirse en el CSV**:

| Campo | Descripción |
|-------|-------------|
| `id` | Identificador único autoincremental |
| `slug` | URL amigable generada desde el `name` |
| `isActive` | Se establece en `true` por defecto |
| `hasDiscount` | Se establece en `false` por defecto |
| `discountId` | Se establece en `null` por defecto |
| `createdAt` | Fecha de creación automática |
| `updatedAt` | Fecha de actualización automática |

---

## Buenas Prácticas

1. **Validar antes de subir:** Abra el CSV en Excel o Google Sheets y verifique que los datos se vean correctamente en columnas separadas.

2. **Hacer backup:** Antes de cargas masivas, asegúrese de tener un respaldo de la base de datos.

3. **Probar con pocos registros:** Primero pruebe con 2-3 productos para verificar que el formato es correcto.

4. **Usar UTF-8:** Guarde el archivo con codificación UTF-8 para evitar problemas con caracteres especiales (tildes, ñ, etc.).

5. **Revisar referencias:** Asegúrese de que los `productRef` sean únicos y sigan un patrón consistente.

---

## Archivos en esta Carpeta

| Archivo | Descripción |
|---------|-------------|
| `README.md` | Esta documentación |
| `products-template.csv` | Archivo de ejemplo con datos reales |
