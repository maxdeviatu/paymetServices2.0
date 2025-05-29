const userService = require('../services/user.service')
const otpService = require('../services/otp.service')
const logger = require('../config/logger')
const { DOCUMENT_TYPES } = require('../models')

/**
 * Controlador para la gestión de usuarios
 */
class UsersController {
  /**
   * Crear un nuevo usuario
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async createUser(req, res) {
    try {
      const {
        firstName,
        lastName,
        phone,
        email,
        documentType,
        documentNumber,
        birthDate,
        consentAccepted
      } = req.body

      // Validaciones básicas
      if (!firstName || !lastName || !email || !documentType || !documentNumber) {
        return res.status(400).json({
          success: false,
          message: 'Faltan campos requeridos: firstName, lastName, email, documentType, documentNumber'
        })
      }

      if (!DOCUMENT_TYPES.includes(documentType)) {
        return res.status(400).json({
          success: false,
          message: `Tipo de documento inválido. Debe ser uno de: ${DOCUMENT_TYPES.join(', ')}`
        })
      }

      if (!consentAccepted) {
        return res.status(400).json({
          success: false,
          message: 'Debe aceptar el consentimiento para crear la cuenta'
        })
      }

      const userData = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone?.trim(),
        email: email.toLowerCase().trim(),
        document_type: documentType,
        document_number: documentNumber.trim(),
        birth_date: birthDate || null,
        consent_accepted: consentAccepted
      }

      const user = await userService.createUser(userData)

      res.status(201).json({
        success: true,
        message: 'Usuario creado exitosamente',
        data: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          phone: user.phone,
          documentType: user.document_type,
          documentNumber: user.document_number,
          birthDate: user.birth_date,
          consentAccepted: user.consent_accepted,
          createdAt: user.createdAt
        }
      })
    } catch (error) {
      logger.logError(error, { 
        operation: 'createUser',
        email: req.body.email 
      })
      
      res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Solicitar código OTP
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async requestOtp(req, res) {
    try {
      const { email } = req.body

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'El email es requerido'
        })
      }

      const normalizedEmail = email.toLowerCase().trim()

      // Verificar que el usuario existe
      const userExists = await userService.userExistsByEmail(normalizedEmail)
      if (!userExists) {
        return res.status(404).json({
          success: false,
          message: 'No existe un usuario registrado con este email'
        })
      }

      const result = await otpService.requestOtp(normalizedEmail)

      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          expiresAt: result.expiresAt
        }
      })
    } catch (error) {
      logger.logError(error, { 
        operation: 'requestOtp',
        email: req.body.email 
      })
      
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      })
    }
  }

  /**
   * Verificar código OTP y generar token
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async verifyOtp(req, res) {
    try {
      const { email, code } = req.body

      if (!email || !code) {
        return res.status(400).json({
          success: false,
          message: 'Email y código son requeridos'
        })
      }

      const normalizedEmail = email.toLowerCase().trim()

      // Verificar el código OTP
      const otpResult = await otpService.verifyOtp(normalizedEmail, code)

      if (!otpResult.success) {
        return res.status(400).json({
          success: false,
          message: otpResult.message
        })
      }

      // Obtener el usuario
      const user = await userService.getUserByEmail(normalizedEmail)

      // Generar token JWT
      const token = userService.generateUserToken(user)

      res.status(200).json({
        success: true,
        message: 'Autenticación exitosa',
        data: {
          token,
          user: {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            phone: user.phone,
            documentType: user.document_type,
            documentNumber: user.document_number,
            birthDate: user.birth_date
          }
        }
      })
    } catch (error) {
      logger.logError(error, { 
        operation: 'verifyOtp',
        email: req.body.email 
      })
      
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      })
    }
  }

  /**
   * Obtener datos del usuario autenticado
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getUserProfile(req, res) {
    try {
      const userId = req.user.id
      const user = await userService.getUserById(userId)

      res.status(200).json({
        success: true,
        data: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          phone: user.phone,
          documentType: user.document_type,
          documentNumber: user.document_number,
          birthDate: user.birth_date,
          consentAccepted: user.consent_accepted,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      })
    } catch (error) {
      logger.logError(error, { 
        operation: 'getUserProfile',
        userId: req.user.id 
      })
      
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      })
    }
  }

  /**
   * Actualizar datos del usuario autenticado
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async updateUserProfile(req, res) {
    try {
      const userId = req.user.id
      const {
        firstName,
        lastName,
        phone,
        birthDate
      } = req.body

      // Solo permitir actualizar ciertos campos
      const updateData = {}
      
      if (firstName !== undefined) updateData.first_name = firstName.trim()
      if (lastName !== undefined) updateData.last_name = lastName.trim()
      if (phone !== undefined) updateData.phone = phone?.trim() || null
      if (birthDate !== undefined) updateData.birth_date = birthDate || null

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No se proporcionaron campos para actualizar'
        })
      }

      const user = await userService.updateUser(userId, updateData)

      res.status(200).json({
        success: true,
        message: 'Perfil actualizado exitosamente',
        data: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          phone: user.phone,
          documentType: user.document_type,
          documentNumber: user.document_number,
          birthDate: user.birth_date,
          updatedAt: user.updatedAt
        }
      })
    } catch (error) {
      logger.logError(error, { 
        operation: 'updateUserProfile',
        userId: req.user.id 
      })
      
      res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }
}

module.exports = new UsersController() 