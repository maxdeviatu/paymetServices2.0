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
      logger.info(`   Licencias disponibles: ${product.licenses.length}`)
      product.licenses.forEach(license => {
        logger.info(`   - ${license.licenseKey} (${license.status})`)
      })
    })
  }, { recordsCount: 8 }) // 2 productos + 6 licencias
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
