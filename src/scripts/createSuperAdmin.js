const { Admin } = require('../models/admin.model')
const logger = require('../config/logger')

async function createSuperAdmin() {
  try {
    const superAdmin = await Admin.findOne({
      where: { email: 'superadmin@example.com' }
    })

    if (!superAdmin) {
      await Admin.create({
        name: 'Super Admin',
        email: 'superadmin@innovatelearning.com.co',
        passwordHash: 'Innovate@202025',
        role: 'SUPER_ADMIN',
        isActive: true
      })
      logger.info('Super administrador creado exitosamente')
    } else {
      logger.info('Super administrador ya existe')
    }
  } catch (error) {
    logger.error('Error al crear el super administrador:', error)
    throw error
  }
}

// Si el script se ejecuta directamente
if (require.main === module) {
  createSuperAdmin()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}

module.exports = { createSuperAdmin } 