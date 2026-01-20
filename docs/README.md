# 📚 Documentación del Sistema de Pagos

Bienvenido a la documentación técnica del sistema de pagos de Innovate Learning. Esta carpeta contiene toda la información necesaria para entender, mantener y desarrollar el sistema.

## 📋 Índice de Documentación

### **⚠️ Documentos Consolidados - Fuente de Verdad**

Estos documentos han sido **validados exhaustivamente contra el código fuente** y son la única referencia confiable para desarrolladores:

- **[WEBHOOKS_COMPLETE.md](./WEBHOOKS_COMPLETE.md)** ⭐ - Documentación completa y consolidada del sistema de webhooks
  - ✅ Validado contra código fuente
  - ✅ Única fuente de verdad para webhooks
  - ✅ Referencia autorizada para desarrolladores externos

- **[TRANSACTIONS_COMPLETE.md](./TRANSACTIONS_COMPLETE.md)** ⭐ - Documentación completa del sistema de transacciones, TransactionManager y verificación de estado
  - ✅ Validado contra código fuente
  - ✅ Única fuente de verdad para transacciones
  - ✅ Referencia autorizada para desarrolladores externos

### **📚 Documentación General**

Los siguientes documentos proporcionan información general y pueden no estar completamente actualizados. Para detalles técnicos exactos, consulte los documentos consolidados arriba:

- `sistema-pagos.md` - Visión general del sistema de pagos
- `api-ordenes-transacciones.md` - Guía de testing con Postman
- `cobre-integration.md` - Integración con Cobre
- `epayco-integration.md` - Integración con ePayco
- `licencias-carga-masiva.md` - Carga masiva de licencias
- `productos.md` - Gestión de productos
- `descuentos.md` - Sistema de descuentos
- `usuarios.md` - Gestión de usuarios
- `administradores.md` - Gestión de administradores
- `autenticacion.md` - Sistema de autenticación
- `AUTHENTICATION_SECURITY.md` - Seguridad y autenticación
- `email-queue-system.md` - Sistema de cola de emails
- `email-retry-job.md` - Reintentos de emails
- `lista-espera.md` - Sistema de lista de espera
- `revive-order-endpoint.md` - Endpoint de reactivación de órdenes
- `setup-integration.md` - Configuración de integraciones
- `productos-licencias-integracion.md` - Integración productos-licencias
- `cambio-licencias.md` - Cambio de licencias

### **✅ Validación de Documentación**

- **[DOCUMENTACION_VALIDACION.md](./DOCUMENTACION_VALIDACION.md)** - Criterios de validación y estado de los documentos consolidados

### **🏗️ Arquitectura del Sistema**
- **[README.md](../README.md)** - Documentación general del proyecto
- **[VARIABLES_ENTORNO.md](../VARIABLES_ENTORNO.md)** - Configuración de variables de entorno

### **🔧 Desarrollo y Mantenimiento**
- **[CLAUDE.md](../CLAUDE.md)** - Notas de desarrollo y decisiones técnicas

## 🎯 Sistema de Webhooks - Resumen Ejecutivo

### **¿Qué es?**
El sistema de webhooks es el componente central que procesa las notificaciones de pago en tiempo real enviadas por los proveedores de pagos (ePayco y Cobre).

### **¿Por qué es importante?**
- ✅ **Sincronización en tiempo real** entre proveedores y sistema interno
- ✅ **Prevención de duplicados** mediante sistema de idempotencia
- ✅ **Manejo inteligente** de cambios de estado de transacciones
- ✅ **Compatibilidad** con múltiples proveedores de pago

### **Proveedores Soportados:**
1. **ePayco** - Múltiples webhooks por transacción
2. **Cobre** - Un webhook por transacción

## 🚀 Casos de Uso Principales

### **1. Transacción Exitosa (ePayco)**
```
PENDING → PAID → Licencia reservada → Email enviado
```

### **2. Transacción Fallida (Cobre)**
```
PENDING → FAILED → Orden cancelada
```

### **3. Webhook Duplicado (ePayco)**
```
PAID → PAID → Detectado como duplicado → Saltado
```

## 🔍 Características Técnicas

### **Sistema de Idempotencia:**
- **Objetivo**: Prevenir procesamiento duplicado
- **Implementación**: Basada en `provider` + `externalRef`
- **Beneficio**: Evita errores de restricción única

### **Performance:**
- **ePayco**: 40-60ms por webhook
- **Cobre**: 20-30ms por webhook
- **Eventos duplicados**: 5-10ms (solo verificación)

### **Logging:**
- **Niveles**: INFO, WARN, ERROR
- **Métricas**: Tiempo de procesamiento, eventos procesados, fallos
- **Debugging**: Información detallada para troubleshooting

## 🛠️ Mantenimiento y Troubleshooting

### **Problemas Comunes:**
1. **Webhook no se procesa** → Verificar restricciones únicas
2. **Transacción no se actualiza** → Revisar TransactionHandler
3. **Errores de sintaxis** → Verificar declaración de variables

### **Monitoreo:**
- **Logs en tiempo real**: `pm2 logs payment-service`
- **Métricas de rendimiento**: Tiempo de procesamiento por proveedor
- **Alertas**: Errores críticos y fallos de procesamiento

## 📖 Cómo Usar Esta Documentación

### **Para Desarrolladores:**
1. Comenzar con **[WEBHOOKS_COMPLETE.md](./WEBHOOKS_COMPLETE.md)** para entender el sistema completo
2. Revisar la sección de arquitectura y flujos de procesamiento
3. Consultar troubleshooting para resolver problemas

### **Para DevOps:**
1. Revisar **[VARIABLES_ENTORNO.md](../VARIABLES_ENTORNO.md)** para configuración
2. Monitorear logs y métricas de rendimiento
3. Implementar alertas para fallos críticos

### **Para Producto:**
1. Entender casos de uso en **[WEBHOOKS_COMPLETE.md](./WEBHOOKS_COMPLETE.md)**
2. Revisar flujos de procesamiento y endpoints
3. Identificar puntos de mejora en la experiencia

## 🔄 Actualizaciones Recientes

### **15 de Agosto de 2025:**
- ✅ **Implementado sistema de idempotencia** para ePayco
- ✅ **Corregidos errores** de restricción única
- ✅ **Mantenida compatibilidad** con Cobre
- ✅ **Mejorado logging** para debugging
- ✅ **Documentación completa** del sistema

### **Cambios Técnicos:**
- **WebhookService**: Lógica de duplicados con cambio de estado
- **Idempotencia**: Basada en `externalRef` en lugar de `eventId`
- **Compatibilidad**: Arrays para Cobre, contadores para ePayco

## 📞 Soporte y Contacto

### **Para Problemas Técnicos:**
- Revisar logs: `pm2 logs payment-service`
- Consultar troubleshooting en **[WEBHOOKS_COMPLETE.md](./WEBHOOKS_COMPLETE.md)**
- Verificar configuración en **[VARIABLES_ENTORNO.md](../VARIABLES_ENTORNO.md)**

### **Para Mejoras y Nuevas Funcionalidades:**
- Documentar en **[CLAUDE.md](../CLAUDE.md)**
- Crear issues con casos de uso detallados
- Proponer mejoras en la arquitectura

---

*Documentación generada el 15 de Agosto de 2025*
*Sistema de webhooks completamente funcional para ePayco y Cobre*







