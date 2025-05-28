const { Admin } = require('../models')
const { Op } = require('sequelize')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { JWT } = require('../config')
const logger = require('../config/logger')

/**
 * Servicio para la gestión de administradores
 */
class AdminService {
  /**
   * Crear un nuevo administrador
   * @param {Object} adminData - Datos del administrador
   * @returns {Promise<Admin>} Administrador creado
   */
  async createAdmin(adminData) {
    try {
      logger.logBusiness('createAdmin', { email: adminData.email })
      
      // Verificar si ya existe un administrador con el mismo email
      const existingAdmin = await Admin.findOne({
        where: { email: adminData.email }
      })

      if (existingAdmin) {
        const error = new Error(`Ya existe un administrador con el email ${adminData.email}`)
        logger.logError(error, { email: adminData.email })
        throw error
      }

      // Crear el administrador
      const admin = await Admin.create(adminData)
      logger.logBusiness('createAdmin.success', { id: admin.id, email: admin.email })
      return admin
    } catch (error) {
      logger.logError(error, { operation: 'createAdmin', email: adminData.email })
      throw error
    }
  }

  /**
   * Obtener un administrador por ID
   * @param {number} id - ID del administrador
   * @returns {Promise<Admin>} Administrador encontrado
   */
  async getAdminById(id) {
    const admin = await Admin.findByPk(id)

    if (!admin) {
      throw new Error('Administrador no encontrado')
    }

    return admin
  }

  /**
   * Listar administradores con paginación
   * @param {Object} options - Opciones de filtrado y paginación
   * @param {boolean} options.onlyActive - Solo administradores activos
   * @param {number} options.page - Número de página
   * @param {number} options.limit - Límite de resultados por página
   * @returns {Promise<Object>} Objeto con administradores y metadatos de paginación
   */
  async listAdmins({ onlyActive = false, page = 1, limit = 20 }) {
    try {
      logger.logBusiness('listAdmins', { onlyActive, page, limit })
      
      const offset = (page - 1) * limit
      const where = onlyActive ? { isActive: true } : {}

      const { count, rows } = await Admin.findAndCountAll({
        where,
        attributes: { exclude: ['passwordHash'] },
        offset,
        limit,
        order: [['createdAt', 'DESC']]
      })

      logger.logBusiness('listAdmins.success', { 
        total: count, 
        page, 
        limit, 
        returned: rows.length 
      })

      return {
        admins: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      }
    } catch (error) {
      logger.logError(error, { operation: 'listAdmins', onlyActive, page, limit })
      throw error
    }
  }

  /**
   * Actualizar un administrador
   * @param {number} id - ID del administrador
   * @param {Object} adminData - Datos a actualizar
   * @returns {Promise<Admin>} Administrador actualizado
   */
  async updateAdmin(id, adminData) {
    const admin = await this.getAdminById(id)

    // Si se está cambiando el email, verificar que no exista otro igual
    if (adminData.email && adminData.email !== admin.email) {
      const existingAdmin = await Admin.findOne({
        where: { 
          email: adminData.email,
          id: { [Op.ne]: id }
        }
      })

      if (existingAdmin) {
        throw new Error(`Ya existe un administrador con el email ${adminData.email}`)
      }
    }

    // Actualizar el administrador
    await admin.update(adminData)
    
    // Excluir passwordHash de la respuesta
    const result = admin.toJSON()
    delete result.passwordHash
    
    return result
  }

  /**
   * Cambiar el estado de un administrador (activo/inactivo)
   * @param {number} id - ID del administrador
   * @returns {Promise<Admin>} Administrador actualizado
   */
  async toggleAdminStatus(id) {
    const admin = await this.getAdminById(id)
    await admin.update({ isActive: !admin.isActive })
    
    // Excluir passwordHash de la respuesta
    const result = admin.toJSON()
    delete result.passwordHash
    
    return result
  }

  /**
   * Eliminar un administrador
   * @param {number} id - ID del administrador
   * @returns {Promise<boolean>} true si se eliminó correctamente
   */
  async deleteAdmin(id) {
    const admin = await this.getAdminById(id)
    await admin.destroy()
    return true
  }

  /**
   * Autenticar un administrador
   * @param {string} email - Email del administrador
   * @param {string} password - Contraseña del administrador
   * @returns {Promise<Object>} Objeto con el token y datos del administrador
   */
  async login(email, password) {
    try {
      logger.logBusiness('login', { email })
      
      // Buscar el administrador por email
      const admin = await Admin.findOne({ where: { email, isActive: true } })
      if (!admin) {
        const error = new Error('Credenciales inválidas')
        logger.logError(error, { email, reason: 'admin_not_found' })
        throw error
      }

      // Verificar la contraseña
      const isPasswordValid = await admin.validatePassword(password)
      if (!isPasswordValid) {
        const error = new Error('Credenciales inválidas')
        logger.logError(error, { email, reason: 'invalid_password' })
        throw error
      }

      // Generar token JWT
      const token = jwt.sign(
        { id: admin.id, email: admin.email, role: admin.role },
        JWT.secret,
        { expiresIn: JWT.expiresIn }
      )

      // Excluir passwordHash de la respuesta
      const adminData = admin.toJSON()
      delete adminData.passwordHash

      logger.logBusiness('login.success', { id: admin.id, email: admin.email, role: admin.role })
      return {
        token,
        admin: adminData
      }
    } catch (error) {
      logger.logError(error, { operation: 'login', email })
      throw error
    }
  }

  /**
   * Restablecer contraseña de un administrador
   * @param {number} id - ID del administrador
   * @param {string} newPassword - Nueva contraseña
   * @returns {Promise<boolean>} true si se cambió correctamente
   */
  async resetPassword(id, newPassword) {
    const admin = await this.getAdminById(id)
    
    // Hashear la nueva contraseña
    const passwordHash = await bcrypt.hash(newPassword, 10)
    
    // Actualizar el administrador
    await admin.update({ passwordHash })
    
    return true
  }
}

module.exports = new AdminService()
