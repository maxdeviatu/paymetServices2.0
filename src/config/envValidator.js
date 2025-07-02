const logger = require('./logger')

/**
 * Validador de variables de entorno
 * Verifica que todas las variables críticas estén configuradas correctamente
 */
class EnvironmentValidator {
  constructor () {
    // Definir variables requeridas por categoría
    this.requiredVars = {
      // Variables críticas del servidor
      server: {
        PORT: {
          required: true,
          type: 'number',
          default: '3000',
          description: 'Puerto donde correrá el servidor'
        },
        NODE_ENV: {
          required: true,
          type: 'string',
          default: 'development',
          enum: ['development', 'production', 'test'],
          description: 'Ambiente de ejecución'
        }
      },

      // Variables críticas de base de datos
      database: {
        DB_HOST: {
          required: true,
          type: 'string',
          description: 'Host de la base de datos PostgreSQL'
        },
        DB_PORT: {
          required: true,
          type: 'number',
          default: '5432',
          description: 'Puerto de la base de datos PostgreSQL'
        },
        DB_NAME: {
          required: true,
          type: 'string',
          description: 'Nombre de la base de datos'
        },
        DB_USER: {
          required: true,
          type: 'string',
          description: 'Usuario de la base de datos'
        },
        DB_PASS: {
          required: true,
          type: 'string',
          description: 'Contraseña de la base de datos'
        }
      },

      // Variables críticas de JWT
      jwt: {
        JWT_SECRET: {
          required: true,
          type: 'string',
          minLength: 32,
          description: 'Clave secreta para firmar JWT (mínimo 32 caracteres)'
        },
        JWT_EXPIRES_IN: {
          required: true,
          type: 'string',
          default: '24h',
          description: 'Tiempo de expiración de los tokens JWT'
        }
      },

      // Variables críticas de Super Admin
      admin: {
        SUPER_ADMIN_EMAIL: {
          required: true,
          type: 'email',
          description: 'Email del super administrador'
        },
        SUPER_ADMIN_PASSWORD: {
          required: true,
          type: 'string',
          minLength: 8,
          description: 'Contraseña del super administrador (mínimo 8 caracteres)'
        }
      },

      // Variables críticas de Cobre
      cobre: {
        COBRE_BASE_URL: {
          required: true,
          type: 'url',
          default: 'https://api.cobre.co',
          description: 'URL base de la API de Cobre'
        },
        COBRE_USER_ID: {
          required: true,
          type: 'string',
          pattern: /^cli_/,
          description: 'User ID de Cobre (debe empezar con cli_)'
        },
        COBRE_SECRET: {
          required: true,
          type: 'string',
          minLength: 8,
          description: 'Secret de Cobre'
        }
      },

      // Variables críticas de Webhooks
      webhooks: {
        COBRE_WEBHOOK_URL: {
          required: true,
          type: 'url',
          pattern: /^https:\/\//,
          description: 'URL donde Cobre enviará webhooks (debe ser HTTPS)'
        },
        COBRE_WEBHOOK_SECRET: {
          required: true,
          type: 'string',
          minLength: 10,
          maxLength: 64,
          description: 'Clave secreta para verificar webhooks (10-64 caracteres)'
        }
      },

      // Variables críticas de facturación (Siigo)
      invoicing: {
        SIIGO_API_URL: {
          required: true,
          type: 'url',
          default: 'https://api.siigo.co',
          description: 'URL base de la API de Siigo'
        },
        SIIGO_USERNAME: {
          required: true,
          type: 'string',
          description: 'Usuario de autenticación para Siigo'
        },
        SIIGO_ACCESS_KEY: {
          required: true,
          type: 'string',
          minLength: 10,
          description: 'Clave de acceso para Siigo'
        },
        SIIGO_PARTNER_ID: {
          required: true,
          type: 'string',
          description: 'ID del partner en Siigo'
        },
        SIIGO_SALES_DOCUMENT_ID: {
          required: true,
          type: 'number',
          description: 'ID del documento de venta en Siigo'
        },
        SIIGO_SELLER_ID: {
          required: true,
          type: 'number',
          description: 'ID del vendedor en Siigo'
        },
        SIIGO_PAYMENT_TYPE_ID: {
          required: true,
          type: 'number',
          description: 'ID del tipo de pago en Siigo'
        },
        INVOICE_PROVIDER: {
          required: false,
          type: 'string',
          default: 'siigo',
          enum: ['siigo', 'mock'],
          description: 'Proveedor de facturación por defecto'
        },
        INVOICE_DELAY_BETWEEN_MS: {
          required: false,
          type: 'number',
          default: '60000',
          description: 'Delay en milisegundos entre facturas (defecto: 1 minuto)'
        }
      },

      // Variables opcionales pero recomendadas
      optional: {
        LOG_LEVEL: {
          required: false,
          type: 'string',
          default: 'info',
          enum: ['error', 'warn', 'info', 'debug'],
          description: 'Nivel de logging'
        },
        CORS_ORIGIN: {
          required: false,
          type: 'string',
          default: '*',
          description: 'Origen permitido para CORS'
        },
        PAYMENT_SUCCESS_URL: {
          required: false,
          type: 'url',
          description: 'URL de redirección después del pago exitoso'
        },
        COMPANY_NAME: {
          required: false,
          type: 'string',
          default: 'Innovate Learning',
          description: 'Nombre de la empresa (aparece en checkouts)'
        }
      }
    }

    this.errors = []
    this.warnings = []
  }

  /**
   * Valida todas las variables de entorno
   * @returns {Object} Resultado de la validación
   */
  validate () {
    this.errors = []
    this.warnings = []

    logger.info('🔍 Validando variables de entorno...')

    // Validar cada categoría
    Object.entries(this.requiredVars).forEach(([category, vars]) => {
      this.validateCategory(category, vars)
    })

    // Generar reporte
    const isValid = this.errors.length === 0
    const report = this.generateReport()

    if (isValid) {
      logger.info('✅ Validación de variables de entorno completada exitosamente')
      if (this.warnings.length > 0) {
        logger.warn(`⚠️ Se encontraron ${this.warnings.length} advertencia(s)`)
      }
    } else {
      logger.error(`❌ Validación de variables de entorno falló con ${this.errors.length} error(es)`)
    }

    return {
      isValid,
      errors: this.errors,
      warnings: this.warnings,
      report
    }
  }

  /**
   * Valida una categoría de variables
   * @param {string} categoryName - Nombre de la categoría
   * @param {Object} vars - Variables de la categoría
   */
  validateCategory (categoryName, vars) {
    const categoryDisplayName = this.getCategoryDisplayName(categoryName)
    logger.info(`📋 Validando ${categoryDisplayName}...`)

    let categoryErrors = 0
    let categoryWarnings = 0

    Object.entries(vars).forEach(([varName, config]) => {
      const result = this.validateVariable(varName, config)

      if (result.error) {
        this.errors.push({
          category: categoryName,
          variable: varName,
          error: result.error,
          config
        })
        categoryErrors++
      }

      if (result.warning) {
        this.warnings.push({
          category: categoryName,
          variable: varName,
          warning: result.warning,
          config
        })
        categoryWarnings++
      }
    })

    // Log del resultado de la categoría
    if (categoryErrors === 0 && categoryWarnings === 0) {
      logger.info(`   ✅ ${categoryDisplayName}: Todas las variables configuradas correctamente`)
    } else {
      if (categoryErrors > 0) {
        logger.error(`   ❌ ${categoryDisplayName}: ${categoryErrors} error(es)`)
      }
      if (categoryWarnings > 0) {
        logger.warn(`   ⚠️ ${categoryDisplayName}: ${categoryWarnings} advertencia(s)`)
      }
    }
  }

  /**
   * Valida una variable individual
   * @param {string} varName - Nombre de la variable
   * @param {Object} config - Configuración de la variable
   * @returns {Object} Resultado de la validación
   */
  validateVariable (varName, config) {
    const value = process.env[varName]
    const result = { error: null, warning: null }

    // Verificar si es requerida
    if (config.required && (!value || value.trim() === '')) {
      result.error = `Variable requerida '${varName}' no está configurada`
      return result
    }

    // Si no está configurada pero no es requerida, usar default si existe
    if (!value && config.default) {
      process.env[varName] = config.default
      result.warning = `Variable '${varName}' no configurada, usando valor por defecto: '${config.default}'`
      return result
    }

    // Si no hay valor, no validar más
    if (!value) {
      return result
    }

    // Validar tipo
    if (config.type) {
      const typeValidation = this.validateType(varName, value, config.type)
      if (typeValidation.error) {
        result.error = typeValidation.error
        return result
      }
    }

    // Validar enum
    if (config.enum && !config.enum.includes(value)) {
      result.error = `Variable '${varName}' debe ser uno de: ${config.enum.join(', ')}. Valor actual: '${value}'`
      return result
    }

    // Validar patrón
    if (config.pattern && !config.pattern.test(value)) {
      result.error = `Variable '${varName}' no cumple con el patrón requerido. Valor: '${value}'`
      return result
    }

    // Validar longitud mínima
    if (config.minLength && value.length < config.minLength) {
      result.error = `Variable '${varName}' debe tener al menos ${config.minLength} caracteres. Longitud actual: ${value.length}`
      return result
    }

    // Validar longitud máxima
    if (config.maxLength && value.length > config.maxLength) {
      result.error = `Variable '${varName}' debe tener máximo ${config.maxLength} caracteres. Longitud actual: ${value.length}`
      return result
    }

    return result
  }

  /**
   * Valida el tipo de una variable
   * @param {string} varName - Nombre de la variable
   * @param {string} value - Valor de la variable
   * @param {string} type - Tipo esperado
   * @returns {Object} Resultado de la validación
   */
  validateType (varName, value, type) {
    const result = { error: null }

    switch (type) {
      case 'number':
        if (isNaN(Number(value))) {
          result.error = `Variable '${varName}' debe ser un número. Valor actual: '${value}'`
        }
        break

      case 'url':
        try {
          new URL(value)
        } catch {
          result.error = `Variable '${varName}' debe ser una URL válida. Valor actual: '${value}'`
        }
        break

      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(value)) {
          result.error = `Variable '${varName}' debe ser un email válido. Valor actual: '${value}'`
        }
        break

      case 'string':
        // String es válido por defecto
        break

      default:
        result.error = `Tipo desconocido '${type}' para variable '${varName}'`
    }

    return result
  }

  /**
   * Genera un reporte detallado de la validación
   * @returns {Object} Reporte
   */
  generateReport () {
    const report = {
      summary: {
        total: 0,
        configured: 0,
        missing: 0,
        errors: this.errors.length,
        warnings: this.warnings.length
      },
      categories: {},
      missingRequired: [],
      recommendations: []
    }

    // Calcular estadísticas por categoría
    Object.entries(this.requiredVars).forEach(([categoryName, vars]) => {
      const categoryReport = {
        total: Object.keys(vars).length,
        configured: 0,
        missing: 0,
        errors: 0,
        warnings: 0
      }

      Object.entries(vars).forEach(([varName, config]) => {
        report.summary.total++

        const value = process.env[varName]
        const hasValue = value && value.trim() !== ''

        if (hasValue) {
          categoryReport.configured++
          report.summary.configured++
        } else {
          categoryReport.missing++
          report.summary.missing++

          if (config.required) {
            report.missingRequired.push({
              variable: varName,
              category: categoryName,
              description: config.description
            })
          }
        }

        // Contar errores y warnings por categoría
        const categoryErrors = this.errors.filter(e => e.category === categoryName && e.variable === varName)
        const categoryWarnings = this.warnings.filter(w => w.category === categoryName && w.variable === varName)

        categoryReport.errors += categoryErrors.length
        categoryReport.warnings += categoryWarnings.length
      })

      report.categories[categoryName] = categoryReport
    })

    // Generar recomendaciones
    this.generateRecommendations(report)

    return report
  }

  /**
   * Genera recomendaciones basadas en el estado actual
   * @param {Object} report - Reporte actual
   */
  generateRecommendations (report) {
    // Recomendaciones para variables faltantes críticas
    if (report.missingRequired.length > 0) {
      report.recommendations.push({
        type: 'error',
        title: 'Variables críticas faltantes',
        message: `Configure las siguientes variables requeridas: ${report.missingRequired.map(v => v.variable).join(', ')}`,
        action: 'Revisar .env.example y configurar las variables faltantes'
      })
    }

    // Recomendaciones de seguridad
    const jwtSecret = process.env.JWT_SECRET
    if (jwtSecret && jwtSecret.length < 64) {
      report.recommendations.push({
        type: 'warning',
        title: 'Seguridad de JWT',
        message: 'JWT_SECRET debería tener al menos 64 caracteres para mayor seguridad',
        action: 'Generar una clave más larga y compleja'
      })
    }

    // Recomendaciones de producción
    if (process.env.NODE_ENV === 'production') {
      if (process.env.CORS_ORIGIN === '*') {
        report.recommendations.push({
          type: 'warning',
          title: 'Seguridad CORS',
          message: 'En producción, CORS_ORIGIN no debería ser "*"',
          action: 'Configurar dominios específicos permitidos'
        })
      }

      if (process.env.LOG_LEVEL === 'debug') {
        report.recommendations.push({
          type: 'info',
          title: 'Nivel de logging',
          message: 'En producción, considera usar LOG_LEVEL=info o warn',
          action: 'Cambiar LOG_LEVEL para optimizar rendimiento'
        })
      }
    }
  }

  /**
   * Obtiene el nombre de visualización de una categoría
   * @param {string} categoryName - Nombre interno de la categoría
   * @returns {string} Nombre de visualización
   */
  getCategoryDisplayName (categoryName) {
    const displayNames = {
      server: 'Configuración del Servidor',
      database: 'Configuración de Base de Datos',
      jwt: 'Configuración JWT',
      admin: 'Configuración de Super Admin',
      cobre: 'Configuración de Cobre',
      webhooks: 'Configuración de Webhooks',
      optional: 'Configuración Opcional'
    }

    return displayNames[categoryName] || categoryName
  }

  /**
   * Imprime un reporte detallado en consola
   * @param {Object} report - Reporte a imprimir
   */
  printDetailedReport (report) {
    console.log('\n' + '='.repeat(80))
    console.log('🔍 REPORTE DETALLADO DE VARIABLES DE ENTORNO')
    console.log('='.repeat(80))

    // Resumen general
    console.log('\n📊 RESUMEN GENERAL:')
    console.log(`   Total de variables: ${report.summary.total}`)
    console.log(`   ✅ Configuradas: ${report.summary.configured}`)
    console.log(`   ❌ Faltantes: ${report.summary.missing}`)
    console.log(`   🔥 Errores: ${report.summary.errors}`)
    console.log(`   ⚠️ Advertencias: ${report.summary.warnings}`)

    // Detalles por categoría
    console.log('\n📋 DETALLES POR CATEGORÍA:')
    Object.entries(report.categories).forEach(([category, stats]) => {
      const displayName = this.getCategoryDisplayName(category)
      const status = stats.errors > 0 ? '❌' : stats.warnings > 0 ? '⚠️' : '✅'

      console.log(`\n   ${status} ${displayName}:`)
      console.log(`      Configuradas: ${stats.configured}/${stats.total}`)
      if (stats.errors > 0) console.log(`      Errores: ${stats.errors}`)
      if (stats.warnings > 0) console.log(`      Advertencias: ${stats.warnings}`)
    })

    // Variables faltantes críticas
    if (report.missingRequired.length > 0) {
      console.log('\n🔥 VARIABLES CRÍTICAS FALTANTES:')
      report.missingRequired.forEach(missing => {
        console.log(`   ❌ ${missing.variable}: ${missing.description}`)
      })
    }

    // Errores detallados
    if (this.errors.length > 0) {
      console.log('\n🔥 ERRORES DETALLADOS:')
      this.errors.forEach(error => {
        console.log(`   ❌ ${error.variable}: ${error.error}`)
      })
    }

    // Advertencias detalladas
    if (this.warnings.length > 0) {
      console.log('\n⚠️ ADVERTENCIAS:')
      this.warnings.forEach(warning => {
        console.log(`   ⚠️ ${warning.variable}: ${warning.warning}`)
      })
    }

    // Recomendaciones
    if (report.recommendations.length > 0) {
      console.log('\n💡 RECOMENDACIONES:')
      report.recommendations.forEach(rec => {
        const icon = rec.type === 'error' ? '🔥' : rec.type === 'warning' ? '⚠️' : 'ℹ️'
        console.log(`   ${icon} ${rec.title}: ${rec.message}`)
        console.log(`      → ${rec.action}`)
      })
    }

    console.log('\n' + '='.repeat(80))
  }

  /**
   * Valida y falla el proceso si hay errores críticos
   * @param {boolean} exitOnError - Si debe salir del proceso en caso de error
   * @returns {boolean} true si la validación es exitosa
   */
  validateAndExit (exitOnError = true) {
    const result = this.validate()

    if (!result.isValid) {
      this.printDetailedReport(result.report)

      if (exitOnError) {
        console.error('\n❌ La aplicación no puede iniciarse debido a errores de configuración.')
        console.error('📖 Consulta .env.example para obtener la configuración correcta.')
        process.exit(1)
      }
    }

    return result.isValid
  }
}

module.exports = EnvironmentValidator
