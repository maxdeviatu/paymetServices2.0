# Integración Productos y Licencias

## Descripción General

El sistema de payment-services2.0 implementa una integración robusta entre productos y licencias digitales, permitiendo gestionar inventarios de licencias de software, cursos digitales, y otros productos que requieren claves de activación.

## Arquitectura de la Integración

### Relación Base de Datos
```sql
-- Tabla productos
products: {
  id: SERIAL PRIMARY KEY,
  product_ref: VARCHAR UNIQUE,  -- Clave de vinculación
  license_type: BOOLEAN,        -- Habilita gestión de licencias
  -- otros campos...
}

-- Tabla licencias
licenses: {
  id: SERIAL PRIMARY KEY,
  product_ref: VARCHAR,         -- FK hacia products.product_ref
  license_key: VARCHAR UNIQUE,
  status: ENUM('AVAILABLE', 'RESERVED', 'SOLD', 'ANNULLED', 'RETURNED'),
  -- otros campos...
}
```

### Validaciones de Integridad

#### Creación de Licencias
- ✅ Verifica que el producto existe (`product_ref` válido)
- ✅ Verifica que `license_type: true` en el producto
- ❌ Falla si el producto no soporta licencias

#### Importación Masiva CSV
- ✅ Valida todos los `product_ref` del CSV
- ✅ Verifica que todos los productos tengan `license_type: true`
- ❌ Falla si algún producto no existe o no soporta licencias

## Casos de Uso

### 1. Producto Digital con Inventario de Licencias

#### Paso 1: Crear Producto
```http
POST /api/products
Content-Type: application/json
Authorization: Bearer <EDITOR_TOKEN>

{
  "name": "Software Contable Pro - Licencia Anual",
  "productRef": "SOFT-CONTABLE-PRO-1Y",
  "price": 29900,
  "currency": "USD",
  "license_type": true,
  "description": "Licencia anual para Software Contable Pro con soporte incluido",
  "features": "Facturación ilimitada, Reportes avanzados, Soporte 24/7",
  "provider": "TechSoft Inc"
}
```

#### Paso 2: Importar Licencias Masivamente
```http
POST /api/licenses/upload
Content-Type: multipart/form-data
Authorization: Bearer <EDITOR_TOKEN>

file: licenses.csv
```

**Contenido del CSV:**
```csv
productRef,licenseKey,instructions
SOFT-CONTABLE-PRO-1Y,SCP-2024-001-AAA,Descargar desde https://example.com/download?key=SCP-2024-001-AAA
SOFT-CONTABLE-PRO-1Y,SCP-2024-001-BBB,Descargar desde https://example.com/download?key=SCP-2024-001-BBB
SOFT-CONTABLE-PRO-1Y,SCP-2024-001-CCC,Descargar desde https://example.com/download?key=SCP-2024-001-CCC
```

#### Paso 3: Gestionar Inventario
```http
GET /api/licenses?productRef=SOFT-CONTABLE-PRO-1Y&status=AVAILABLE
Authorization: Bearer <READ_ONLY_TOKEN>
```

### 2. Producto de Servicio (Sin Licencias)

#### Crear Producto de Servicio
```http
POST /api/products
Content-Type: application/json
Authorization: Bearer <EDITOR_TOKEN>

{
  "name": "Consultoría en Implementación ERP",
  "productRef": "CONSULT-ERP-IMPL",
  "price": 150000,
  "currency": "USD",
  "license_type": false,
  "description": "Servicio de consultoría para implementación de ERP",
  "provider": "Consulting Corp"
}
```

#### Intento de Crear Licencia (Fallará)
```http
POST /api/licenses
Content-Type: application/json
Authorization: Bearer <EDITOR_TOKEN>

{
  "productRef": "CONSULT-ERP-IMPL",
  "licenseKey": "INVALID-KEY-123",
  "instructions": "No aplica para servicios"
}
```

**Respuesta (Error):**
```json
{
  "success": false,
  "message": "Product CONSULT-ERP-IMPL does not support licenses. Set license_type to true first."
}
```

## Estados del Ciclo de Vida

### Estados de Licencias
1. **AVAILABLE**: Licencia lista para asignar
2. **RESERVED**: Temporalmente reservada (carrito de compras)
3. **SOLD**: Vendida y entregada al cliente
4. **ANNULLED**: Anulada por problemas/devoluciones
5. **RETURNED**: Devuelta al inventario desde estado SOLD

### Transiciones Permitidas
```
AVAILABLE → RESERVED → SOLD
AVAILABLE → SOLD (venta directa)
SOLD → RETURNED (devolución)
ANY_STATE → ANNULLED (anulación admin)
```

## Operaciones Administrativas

### Anular Licencia
```http
POST /api/licenses/SCP-2024-001-AAA/annul
Authorization: Bearer <SUPER_ADMIN_TOKEN>
```
- Cambia `license_key` a formato `ANULADA-{last5}`
- Estado a `ANNULLED`
- Limpia `orderId` y `reservedAt`

### Devolver Licencia al Inventario
```http
POST /api/licenses/SCP-2024-001-BBB/return
Authorization: Bearer <SUPER_ADMIN_TOKEN>
```
- Solo licencias en estado `SOLD`
- Estado a `RETURNED`
- Limpia `orderId` y `soldAt`
- Establece `reservedAt` a fecha actual

## Validaciones de Negocio

### Reglas para Productos
- `productRef` debe ser único en toda la tabla
- `license_type` no se puede cambiar si existen licencias activas
- Productos con `license_type: false` no aparecen en filtros de licencias

### Reglas para Licencias
- `licenseKey` debe ser único globalmente
- No se puede cambiar `licenseKey` de licencias SOLD
- `productRef` debe corresponder a producto con `license_type: true`

## Consultas Útiles

### Productos con Inventario de Licencias
```http
GET /api/products?license_type=true
```

### Licencias Disponibles por Producto
```http
GET /api/licenses?productRef=SOFT-CONTABLE-PRO-1Y&status=AVAILABLE
```

### Reporte de Inventario
```http
GET /api/licenses?groupBy=status
```

## Logging y Trazabilidad

### Eventos Registrados
- Creación de producto con `license_type: true`
- Importación masiva de licencias
- Cambios de estado de licencias
- Validaciones fallidas de integración

### Formato de Logs
```json
{
  "timestamp": "2024-03-14T10:15:30.123Z",
  "level": "info",
  "message": "Business Operation [createLicense]",
  "productRef": "SOFT-CONTABLE-PRO-1Y",
  "licenseKey": "SCP-2024-001-AAA",
  "status": "AVAILABLE"
}
```

## Mejores Prácticas

### Para Desarrolladores
1. **Validar siempre** `license_type` antes de operaciones de licencias
2. **Usar transacciones** para operaciones que afecten múltiples licencias
3. **Implementar retry logic** para operaciones concurrentes
4. **Loggear todas las operaciones** con contexto de negocio

### Para Administradores
1. **Configurar productos** con `license_type: true` antes de importar licencias
2. **Usar CSV template** para importaciones masivas
3. **Monitorear logs** para detectar problemas de integración
4. **Realizar backups** antes de operaciones masivas

## Solución de Problemas

### Error: "Product does not support licenses"
- **Causa**: `license_type: false` en el producto
- **Solución**: Actualizar producto con `license_type: true`

### Error: "Product not found"
- **Causa**: `productRef` no existe en tabla products
- **Solución**: Verificar `productRef` o crear el producto

### Error: "Only SOLD licenses can be returned"
- **Causa**: Intentar devolver licencia que no está SOLD
- **Solución**: Verificar estado actual de la licencia

## Performance y Escalabilidad

### Índices Recomendados
```sql
CREATE INDEX idx_licenses_product_ref ON licenses(product_ref);
CREATE INDEX idx_licenses_status ON licenses(status);
CREATE INDEX idx_products_license_type ON products(license_type);
```

### Optimizaciones
- Paginación en consultas de licencias
- Bulk operations para importaciones grandes
- Cache de productos con `license_type: true`
- Conexión pool para operaciones concurrentes