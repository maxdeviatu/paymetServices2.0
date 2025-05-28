const { Admin } = require('../models/admin.model')
const logger = require('../config/logger')
require('dotenv').config()

async function createSuperAdmin() {
  try {
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD

    if (!superAdminEmail || !superAdminPassword) {
      throw new Error('Las variables de entorno SUPER_ADMIN_EMAIL y SUPER_ADMIN_PASSWORD son requeridas')
    }

    const superAdmin = await Admin.findOne({
      where: { email: superAdminEmail }
    })

    if (!superAdmin) {
      await Admin.create({
        name: 'Super Admin',
        email: superAdminEmail,
        passwordHash: superAdminPassword,
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