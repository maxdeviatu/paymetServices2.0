const { User } = require('../models')
const { Op } = require('sequelize')
const logger = require('../config/logger')
const pseudoMailer = require('../utils/pseudoMailer')
const jwt = require('jsonwebtoken')
const { JWT } = require('../config')

/**
 * Servicio para la gestión de usuarios (clientes)
 */
class UserService {
  /**
   * Crear un nuevo usuario
   * @param {Object} userData - Datos del usuario
   * @returns {Promise<User>} Usuario creado
   */
  async createUser (userData) {
    try {
      logger.logBusiness('createUser', {
        email: userData.email,
        document_type: userData.document_type,
        document_number: userData.document_number
      })

      // Verificar si ya existe un usuario con el mismo email
      const existingUserByEmail = await User.findOne({
        where: { email: userData.email }
      })

      if (existingUserByEmail) {
        const error = new Error(`Ya existe un usuario con el email ${userData.email}`)
        logger.logError(error, { email: userData.email })
        throw error
      }

      // Verificar si ya existe un usuario con el mismo documento
      const existingUserByDocument = await User.findOne({
        where: {
          document_type: userData.document_type,
          document_number: userData.document_number
        }
      })

      if (existingUserByDocument) {
        const error = new Error(`Ya existe un usuario con el documento ${userData.document_type} ${userData.document_number}`)
        logger.logError(error, {
          document_type: userData.document_type,
          document_number: userData.document_number
        })
        throw error
      }

      // Crear el usuario
      const user = await User.create(userData)

      // Enviar correo de bienvenida
      try {
        await pseudoMailer.sendWelcome(user.email, user.first_name)
      } catch (error) {
        logger.warn('Error al enviar correo de bienvenida', {
          userId: user.id,
          email: user.email
        })
      }

      logger.logBusiness('createUser.success', {
        id: user.id,
        email: user.email,
        first_name: user.first_name
      })

      return user
    } catch (error) {
      logger.logError(error, {
        operation: 'createUser',
        email: userData.email
      })
      throw error
    }
  }

  /**
   * Obtener un usuario por ID
   * @param {number} id - ID del usuario
   * @returns {Promise<User>} Usuario encontrado
   */
  async getUserById (id) {
    try {
      const user = await User.findByPk(id)

      if (!user) {
        throw new Error('Usuario no encontrado')
      }

      return user
    } catch (error) {
      logger.logError(error, {
        operation: 'getUserById',
        userId: id
      })
      throw error
    }
  }

  /**
   * Obtener un usuario por email
   * @param {string} email - Email del usuario
   * @returns {Promise<User>} Usuario encontrado
   */
  async getUserByEmail (email) {
    try {
      const user = await User.findOne({
        where: { email }
      })

      if (!user) {
        throw new Error('Usuario no encontrado')
      }

      return user
    } catch (error) {
      logger.logError(error, {
        operation: 'getUserByEmail',
        email
      })
      throw error
    }
  }

  /**
   * Actualizar datos de un usuario
   * @param {number} id - ID del usuario
   * @param {Object} userData - Datos a actualizar
   * @returns {Promise<User>} Usuario actualizado
   */
  async updateUser (id, userData) {
    try {
      const user = await this.getUserById(id)

      // Si se está cambiando el email, verificar que no exista otro usuario con el mismo
      if (userData.email && userData.email !== user.email) {
        const existingUser = await User.findOne({
          where: {
            email: userData.email,
            id: { [Op.ne]: id }
          }
        })

        if (existingUser) {
          throw new Error(`Ya existe un usuario con el email ${userData.email}`)
        }
      }

      // Si se está cambiando el documento, verificar que no exista otro usuario con el mismo
      if ((userData.document_type || userData.document_number) &&
          (userData.document_type !== user.document_type || userData.document_number !== user.document_number)) {
        const document_type = userData.document_type || user.document_type
        const document_number = userData.document_number || user.document_number

        const existingUser = await User.findOne({
          where: {
            document_type,
            document_number,
            id: { [Op.ne]: id }
          }
        })

        if (existingUser) {
          throw new Error(`Ya existe un usuario con el documento ${document_type} ${document_number}`)
        }
      }

      // Actualizar el usuario
      await user.update(userData)

      logger.logBusiness('updateUser.success', {
        id: user.id,
        email: user.email
      })

      return user
    } catch (error) {
      logger.logError(error, {
        operation: 'updateUser',
        userId: id
      })
      throw error
    }
  }

  /**
   * Generar token JWT para un usuario
   * @param {User} user - Usuario para generar el token
   * @returns {string} Token JWT
   */
  generateUserToken (user) {
    const payload = {
      id: user.id,
      email: user.email,
      type: 'user'
    }

    return jwt.sign(payload, JWT.secret, { expiresIn: '30m' })
  }

  /**
   * Verificar si un email corresponde a un usuario registrado
   * @param {string} email - Email a verificar
   * @returns {Promise<boolean>} true si el usuario existe
   */
  async userExistsByEmail (email) {
    try {
      const user = await User.findOne({
        where: { email }
      })
      return !!user
    } catch (error) {
      logger.logError(error, {
        operation: 'userExistsByEmail',
        email
      })
      return false
    }
  }

  /**
   * Listar usuarios con paginación (para uso administrativo)
   * @param {Object} options - Opciones de filtrado y paginación
   * @returns {Promise<Object>} Objeto con usuarios y metadatos de paginación
   */
  async listUsers ({ page = 1, limit = 20, search = '' }) {
    try {
      logger.logBusiness('listUsers', { page, limit, search })

      const offset = (page - 1) * limit
      const where = {}

      // Si hay búsqueda, filtrar por nombre, email o documento
      if (search) {
        where[Op.or] = [
          { first_name: { [Op.iLike]: `%${search}%` } },
          { last_name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { document_number: { [Op.iLike]: `%${search}%` } }
        ]
      }

      const { count, rows } = await User.findAndCountAll({
        where,
        offset,
        limit,
        order: [['createdAt', 'DESC']],
        attributes: { exclude: [] } // Incluir todos los campos
      })

      logger.logBusiness('listUsers.success', {
        total: count,
        page,
        limit,
        returned: rows.length
      })

      return {
        users: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'listUsers',
        page,
        limit
      })
      throw error
    }
  }
}

module.exports = new UserService()
