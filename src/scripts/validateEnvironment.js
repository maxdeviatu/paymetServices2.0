// Cargar variables de entorno antes que nada
require('dotenv').config()

const EnvironmentValidator = require('../config/envValidator')

/**
 * Script para validar variables de entorno de forma independiente
 * Útil para verificar configuración antes de deployar
 */
async function validateEnvironment () {
  try {
    console.log('🔧 VALIDADOR DE VARIABLES DE ENTORNO')
    console.log('==========================================\n')

    const validator = new EnvironmentValidator()
    const result = validator.validate()

    // Siempre mostrar el reporte detallado
    validator.printDetailedReport(result.report)

    if (result.isValid) {
      console.log('\n🎉 CONFIGURACIÓN VÁLIDA')
      console.log('✅ El sistema puede iniciarse correctamente')

      if (result.warnings.length > 0) {
        console.log(`\n⚠️ NOTA: Hay ${result.warnings.length} advertencia(s) que deberías revisar`)
      }

      process.exit(0)
    } else {
      console.log('\n❌ CONFIGURACIÓN INVÁLIDA')
      console.log('💥 El sistema NO puede iniciarse')
      console.log('\n📋 PASOS SIGUIENTES:')
      console.log('1. Revisar los errores mostrados arriba')
      console.log('2. Consultar VARIABLES_ENTORNO.md para guía detallada')
      console.log('3. Copiar .env.example a .env si es necesario')
      console.log('4. Configurar las variables faltantes')
      console.log('5. Ejecutar este script nuevamente')

      process.exit(1)
    }
  } catch (error) {
    console.error('💥 Error ejecutando validación:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  validateEnvironment()
}

module.exports = { validateEnvironment }
