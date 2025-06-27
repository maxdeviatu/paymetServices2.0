const { Product, License, sequelize } = require('../models')
const logger = require('../config/logger')
const TransactionManager = require('../utils/transactionManager')

async function generateLicenseKey (productRef) {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `${productRef}-${timestamp}-${random}`.toUpperCase()
}

async function initializeProducts () {
  return await TransactionManager.executeBulkTransaction(async (t) => {
    logger.info('🚀 Iniciando carga de productos y licencias...')

    // Producto 1: Curso Básico
    const cursoBasico = await Product.create({
      name: 'Curso Básico de Programación',
      productRef: 'CURSO-BASICO',
      price: 100000, // 1,000 COP
      currency: 'COP',
      description: 'Curso introductorio de programación para principiantes',
      features: 'Acceso a videos, ejercicios prácticos, certificado de finalización',
      license_type: true,
      isActive: true
    }, { transaction: t })

    logger.info('✅ Producto creado:', cursoBasico.productRef)

    // Crear 3 licencias para el curso básico
    for (let i = 0; i < 3; i++) {
      const licenseKey = await generateLicenseKey(cursoBasico.productRef)
      await License.create({
        productRef: cursoBasico.productRef,
        licenseKey,
        status: 'AVAILABLE',
        instructions: 'Accede a la plataforma con tu email y usa este código para activar tu licencia'
      }, { transaction: t })
    }

    logger.info('✅ Licencias creadas para:', cursoBasico.productRef)

    // Producto 2: Curso Avanzado
    const cursoAvanzado = await Product.create({
      name: 'Curso Avanzado de Desarrollo Web',
      productRef: 'CURSO-AVANZADO',
      price: 150000, // 1,500 COP
      currency: 'COP',
      description: 'Curso avanzado de desarrollo web con las últimas tecnologías',
      features: 'Acceso a videos, proyectos prácticos, mentoría personalizada, certificado de finalización',
      license_type: true,
      isActive: true
    }, { transaction: t })

    logger.info('✅ Producto creado:', cursoAvanzado.productRef)

    // Crear 3 licencias para el curso avanzado
    for (let i = 0; i < 3; i++) {
      const licenseKey = await generateLicenseKey(cursoAvanzado.productRef)
      await License.create({
        productRef: cursoAvanzado.productRef,
        licenseKey,
        status: 'AVAILABLE',
        instructions: 'Accede a la plataforma con tu email y usa este código para activar tu licencia'
      }, { transaction: t })
    }

    logger.info('✅ Licencias creadas para:', cursoAvanzado.productRef)

    // Producto 3: Software Pro (SIN STOCK - Para probar lista de espera)
    const softwarePro = await Product.create({
      name: 'Software Pro - Licencia Anual',
      productRef: 'SOFT-PRO-1Y',
      price: 29900, // 299 USD
      currency: 'USD',
      description: 'Licencia anual para Software Pro con todas las funcionalidades premium',
      features: 'Acceso completo a todas las funcionalidades, soporte prioritario, actualizaciones gratuitas',
      license_type: true,
      isActive: true
    }, { transaction: t })

    logger.info('✅ Producto creado:', softwarePro.productRef)

    // Crear 2 licencias VENDIDAS para Software Pro (sin stock disponible)
    for (let i = 0; i < 2; i++) {
      const licenseKey = await generateLicenseKey(softwarePro.productRef)
      await License.create({
        productRef: softwarePro.productRef,
        licenseKey,
        status: 'SOLD',
        orderId: 999 + i, // Orden ficticia para simular venta
        soldAt: new Date(),
        instructions: 'Descarga el software desde nuestra página web y usa este código para activar tu licencia'
      }, { transaction: t })
    }

    logger.info('✅ Licencias VENDIDAS creadas para:', softwarePro.productRef)
    logger.info('📋 NOTA: Este producto está SIN STOCK para probar el sistema de lista de espera')

    logger.info('🎉 Inicialización completada exitosamente!')

    // Mostrar resumen
    const products = await Product.findAll({
      include: [{
        model: License,
        as: 'licenses'
      }]
    })

    products.forEach(product => {
      logger.info(`\n📦 Producto: ${product.name}`)
      logger.info(`   Referencia: ${product.productRef}`)
      logger.info(`   Precio: ${product.price} ${product.currency}`)
      logger.info(`   Licencias totales: ${product.licenses.length}`)
      
      const available = product.licenses.filter(l => l.status === 'AVAILABLE').length
      const sold = product.licenses.filter(l => l.status === 'SOLD').length
      
      logger.info(`   Licencias disponibles: ${available}`)
      logger.info(`   Licencias vendidas: ${sold}`)
      
      if (available === 0 && sold > 0) {
        logger.info(`   ⚠️  PRODUCTO SIN STOCK - Ideal para probar lista de espera`)
      }
      
      product.licenses.forEach(license => {
        logger.info(`   - ${license.licenseKey} (${license.status})`)
      })
    })

    logger.info('\n🧪 PARA PROBAR LISTA DE ESPERA:')
    logger.info('1. Crear una orden para el producto SOFT-PRO-1Y')
    logger.info('2. El sistema automáticamente lo agregará a la lista de espera')
    logger.info('3. Usar POST /api/waitlist/reserve para reservar licencias')
    logger.info('4. El job automático procesará las licencias cada 30 segundos')
  }, { recordsCount: 11 }) // 3 productos + 8 licencias
}

// Ejecutar el script
initializeProducts()
  .then(() => {
    logger.info('✨ Script ejecutado correctamente')
    process.exit(0)
  })
  .catch(error => {
    logger.error('❌ Error en la ejecución del script:', error)
    process.exit(1)
  })
