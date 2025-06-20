const usersController = require('../../../controllers/users.controller')
const userService = require('../../../services/user.service')
const otpService = require('../../../services/otp.service')
const { DOCUMENT_TYPES } = require('../../../models')

// Mock de las dependencias
jest.mock('../../../services/user.service')
jest.mock('../../../services/otp.service')
jest.mock('../../../config/logger')

describe('UsersController', () => {
  let mockReq
  let mockRes

  beforeEach(() => {
    // Limpiar todos los mocks antes de cada prueba
    jest.clearAllMocks()

    // Configurar request y response mocks
    mockReq = {
      body: {},
      user: { id: 1 }
    }
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    }
  })

  describe('createUser', () => {
    const validUserData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      documentType: 'CC',
      documentNumber: '12345678',
      consentAccepted: true,
      birthDate: '1990-01-01',
      phone: '+57123456789'
    }

    const mockCreatedUser = {
      id: 1,
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      document_type: 'CC',
      document_number: '12345678',
      consent_accepted: true,
      createdAt: new Date()
    }

    it('should create user successfully', async () => {
      // Configurar mocks
      mockReq.body = validUserData
      userService.createUser.mockResolvedValue(mockCreatedUser)

      // Ejecutar
      await usersController.createUser(mockReq, mockRes)

      // Verificar
      expect(userService.createUser).toHaveBeenCalledWith({
        first_name: validUserData.firstName,
        last_name: validUserData.lastName,
        email: validUserData.email.toLowerCase(),
        document_type: validUserData.documentType,
        document_number: validUserData.documentNumber,
        birth_date: validUserData.birthDate || null,
        phone: validUserData.phone,
        consent_accepted: validUserData.consentAccepted
      })
      expect(mockRes.status).toHaveBeenCalledWith(201)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Usuario creado exitosamente',
        data: {
          id: mockCreatedUser.id,
          firstName: mockCreatedUser.first_name,
          lastName: mockCreatedUser.last_name,
          email: mockCreatedUser.email,
          documentType: mockCreatedUser.document_type,
          documentNumber: mockCreatedUser.document_number,
          consentAccepted: mockCreatedUser.consent_accepted,
          createdAt: mockCreatedUser.createdAt
        }
      })
    })

    it('should return 400 if required fields are missing', async () => {
      // Configurar mocks
      mockReq.body = {
        firstName: 'John',
        lastName: 'Doe'
        // Faltan campos requeridos
      }

      // Ejecutar
      await usersController.createUser(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Faltan campos requeridos: firstName, lastName, email, documentType, documentNumber'
      })
    })

    it('should return 400 if document type is invalid', async () => {
      // Configurar mocks
      mockReq.body = {
        ...validUserData,
        documentType: 'INVALID'
      }

      // Ejecutar
      await usersController.createUser(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: `Tipo de documento inválido. Debe ser uno de: ${DOCUMENT_TYPES.join(', ')}`
      })
    })

    it('should return 400 if consent is not accepted', async () => {
      // Configurar mocks
      mockReq.body = {
        ...validUserData,
        consentAccepted: false
      }

      // Ejecutar
      await usersController.createUser(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Debe aceptar el consentimiento para crear la cuenta'
      })
    })
  })

  describe('requestOtp', () => {
    it('should request OTP successfully', async () => {
      // Configurar mocks
      mockReq.body = { email: 'john@example.com' }
      userService.userExistsByEmail.mockResolvedValue(true)
      otpService.requestOtp.mockResolvedValue({
        success: true,
        message: 'Código OTP enviado correctamente',
        expiresAt: new Date()
      })

      // Ejecutar
      await usersController.requestOtp(mockReq, mockRes)

      // Verificar
      expect(userService.userExistsByEmail).toHaveBeenCalledWith('john@example.com')
      expect(otpService.requestOtp).toHaveBeenCalledWith('john@example.com')
      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Código OTP enviado correctamente',
        data: {
          expiresAt: expect.any(Date)
        }
      })
    })

    it('should return 404 if user does not exist', async () => {
      // Configurar mocks
      mockReq.body = { email: 'john@example.com' }
      userService.userExistsByEmail.mockResolvedValue(false)

      // Ejecutar
      await usersController.requestOtp(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'No existe un usuario registrado con este email'
      })
    })
  })

  describe('verifyOtp', () => {
    const mockUser = {
      id: 1,
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      document_type: 'CC',
      document_number: '12345678'
    }

    it('should verify OTP and return token', async () => {
      // Configurar mocks
      mockReq.body = {
        email: 'john@example.com',
        code: '123456'
      }
      otpService.verifyOtp.mockResolvedValue({
        success: true,
        message: 'Código OTP verificado correctamente'
      })
      userService.getUserByEmail.mockResolvedValue(mockUser)
      userService.generateUserToken.mockReturnValue('mock-token')

      // Ejecutar
      await usersController.verifyOtp(mockReq, mockRes)

      // Verificar
      expect(otpService.verifyOtp).toHaveBeenCalledWith('john@example.com', '123456')
      expect(userService.getUserByEmail).toHaveBeenCalledWith('john@example.com')
      expect(userService.generateUserToken).toHaveBeenCalledWith(mockUser)
      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Autenticación exitosa',
        data: {
          token: 'mock-token',
          user: {
            id: mockUser.id,
            firstName: mockUser.first_name,
            lastName: mockUser.last_name,
            email: mockUser.email,
            documentType: mockUser.document_type,
            documentNumber: mockUser.document_number
          }
        }
      })
    })

    it('should return 400 if OTP verification fails', async () => {
      // Configurar mocks
      mockReq.body = {
        email: 'john@example.com',
        code: '123456'
      }
      otpService.verifyOtp.mockResolvedValue({
        success: false,
        message: 'Código OTP inválido o expirado'
      })

      // Ejecutar
      await usersController.verifyOtp(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Código OTP inválido o expirado'
      })
    })
  })

  describe('getUserProfile', () => {
    const mockUser = {
      id: 1,
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      document_type: 'CC',
      document_number: '12345678',
      consent_accepted: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    it('should return user profile', async () => {
      // Configurar mocks
      userService.getUserById.mockResolvedValue(mockUser)

      // Ejecutar
      await usersController.getUserProfile(mockReq, mockRes)

      // Verificar
      expect(userService.getUserById).toHaveBeenCalledWith(1)
      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          id: mockUser.id,
          firstName: mockUser.first_name,
          lastName: mockUser.last_name,
          email: mockUser.email,
          documentType: mockUser.document_type,
          documentNumber: mockUser.document_number,
          consentAccepted: mockUser.consent_accepted,
          createdAt: mockUser.createdAt,
          updatedAt: mockUser.updatedAt
        }
      })
    })
  })

  describe('updateUserProfile', () => {
    const mockUser = {
      id: 1,
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      document_type: 'CC',
      document_number: '12345678',
      updatedAt: new Date()
    }

    it('should update user profile successfully', async () => {
      // Configurar mocks
      mockReq.body = {
        firstName: 'Johnny',
        lastName: 'Doe'
      }
      userService.updateUser.mockResolvedValue({
        ...mockUser,
        first_name: 'Johnny'
      })

      // Ejecutar
      await usersController.updateUserProfile(mockReq, mockRes)

      // Verificar
      expect(userService.updateUser).toHaveBeenCalledWith(1, {
        first_name: 'Johnny',
        last_name: 'Doe'
      })
      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Perfil actualizado exitosamente',
        data: {
          id: mockUser.id,
          firstName: 'Johnny',
          lastName: mockUser.last_name,
          email: mockUser.email,
          documentType: mockUser.document_type,
          documentNumber: mockUser.document_number,
          updatedAt: mockUser.updatedAt
        }
      })
    })

    it('should return 400 if no fields to update', async () => {
      // Configurar mocks
      mockReq.body = {}

      // Ejecutar
      await usersController.updateUserProfile(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'No se proporcionaron campos para actualizar'
      })
    })
  })
})
