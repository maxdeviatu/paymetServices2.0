#!/usr/bin/env node

/**
 * Script para crear la tabla de facturas
 * Crea la tabla si no existe en la base de datos
 */

const { sequelize } = require('../src/models/db')
const Invoice = require('../src/models/invoice.model')
const logger = require('../src/config/logger')

async function createInvoicesTable () {
  try {
    logger.info('🚀 Iniciando creación de tabla de facturas...')

    // Verificar conexión a la base de datos
    await sequelize.authenticate()
    logger.info('✅ Conexión a la base de datos establecida')

    // Sincronizar modelo de facturas
    await Invoice.sync({ alter: true })
    logger.info('✅ Tabla de facturas creada/actualizada exitosamente')

    // Verificar que la tabla existe
    const tableExists = await sequelize.getQueryInterface().showAllTables()
    const invoicesTableExists = tableExists.includes('invoices')

    if (invoicesTableExists) {
      logger.info('✅ Verificación: Tabla "invoices" existe en la base de datos')

      // Mostrar estructura de la tabla
      const tableDescription = await sequelize.getQueryInterface().describeTable('invoices')
      logger.info('📋 Estructura de la tabla "invoices":')
      Object.entries(tableDescription).forEach(([column, details]) => {
        logger.info(`   - ${column}: ${details.type} ${details.allowNull ? '(nullable)' : '(not null)'}`)
      })
    } else {
      logger.error('❌ Error: La tabla "invoices" no fue creada')
      process.exit(1)
    }

    logger.info('🎉 Script completado exitosamente')
  } catch (error) {
    logger.error('❌ Error creando tabla de facturas:', {
      message: error.message,
      stack: error.stack
    })
    process.exit(1)
  } finally {
    // Cerrar conexión
    await sequelize.close()
    logger.info('🔒 Conexión a la base de datos cerrada')
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  createInvoicesTable()
}

module.exports = createInvoicesTable
