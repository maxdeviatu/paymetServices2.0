const jwt = require('jsonwebtoken')
const { authenticate, authenticateUser, authenticateAny } = require('../../../middlewares/auth')
const { Admin, User } = require('../../../models')
const { JWT } = require('../../../config')

// Mock de las dependencias
jest.mock('../../../models', () => ({
  Admin: {
    findByPk: jest.fn()
  },
  User: {
    findByPk: jest.fn()
  }
}))

jest.mock('jsonwebtoken')

describe('Auth Middleware', () => {
  let mockReq
  let mockRes
  let mockNext

  beforeEach(() => {
    // Limpiar todos los mocks antes de cada prueba
    jest.clearAllMocks()

    // Configurar request, response y next mocks
    mockReq = {
      headers: {}
    }
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    }
    mockNext = jest.fn()
  })

  describe('authenticate', () => {
    const mockAdmin = {
      id: 1,
      name: 'Admin',
      email: 'admin@example.com',
      role: 'ADMIN',
      isActive: true
    }

    it('should authenticate admin successfully', async () => {
      // Configurar mocks
      mockReq.headers.authorization = 'Bearer valid-token'
      jwt.verify.mockReturnValue({ id: 1, type: 'admin' })
      Admin.findByPk.mockResolvedValue(mockAdmin)

      // Ejecutar
      await authenticate(mockReq, mockRes, mockNext)

      // Verificar
      expect(jwt.verify).toHaveBeenCalledWith('valid-token', JWT.secret)
      expect(Admin.findByPk).toHaveBeenCalledWith(1)
      expect(mockReq.user).toEqual({
        id: mockAdmin.id,
        name: mockAdmin.name,
        email: mockAdmin.email,
        role: mockAdmin.role,
        type: 'admin'
      })
      expect(mockNext).toHaveBeenCalled()
    })

    it('should return 401 if no token provided', async () => {
      // Ejecutar
      await authenticate(mockReq, mockRes, mockNext)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Acceso no autorizado. Token no proporcionado.'
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should return 401 if admin not found or inactive', async () => {
      // Configurar mocks
      mockReq.headers.authorization = 'Bearer valid-token'
      jwt.verify.mockReturnValue({ id: 1, type: 'admin' })
      Admin.findByPk.mockResolvedValue(null)

      // Ejecutar
      await authenticate(mockReq, mockRes, mockNext)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Acceso no autorizado. Administrador no válido o inactivo.'
      })
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('authenticateUser', () => {
    const mockUser = {
      id: 1,
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com'
    }

    it('should authenticate user successfully', async () => {
      // Configurar mocks
      mockReq.headers.authorization = 'Bearer valid-token'
      jwt.verify.mockReturnValue({ id: 1, type: 'user' })
      User.findByPk.mockResolvedValue(mockUser)

      // Ejecutar
      await authenticateUser(mockReq, mockRes, mockNext)

      // Verificar
      expect(jwt.verify).toHaveBeenCalledWith('valid-token', JWT.secret)
      expect(User.findByPk).toHaveBeenCalledWith(1)
      expect(mockReq.user).toEqual({
        id: mockUser.id,
        firstName: mockUser.first_name,
        lastName: mockUser.last_name,
        email: mockUser.email,
        type: 'user'
      })
      expect(mockNext).toHaveBeenCalled()
    })

    it('should return 401 if token type is not user', async () => {
      // Configurar mocks
      mockReq.headers.authorization = 'Bearer valid-token'
      jwt.verify.mockReturnValue({ id: 1, type: 'admin' })

      // Ejecutar
      await authenticateUser(mockReq, mockRes, mockNext)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Acceso no autorizado. Token no válido para usuarios.'
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should return 401 if user not found', async () => {
      // Configurar mocks
      mockReq.headers.authorization = 'Bearer valid-token'
      jwt.verify.mockReturnValue({ id: 1, type: 'user' })
      User.findByPk.mockResolvedValue(null)

      // Ejecutar
      await authenticateUser(mockReq, mockRes, mockNext)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Acceso no autorizado. Usuario no válido.'
      })
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('authenticateAny', () => {
    const mockAdmin = {
      id: 1,
      name: 'Admin',
      email: 'admin@example.com',
      role: 'ADMIN',
      isActive: true
    }

    const mockUser = {
      id: 1,
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com'
    }

    it('should authenticate admin successfully', async () => {
      // Configurar mocks
      mockReq.headers.authorization = 'Bearer valid-token'
      jwt.verify.mockReturnValue({ id: 1, type: 'admin' })
      Admin.findByPk.mockResolvedValue(mockAdmin)

      // Ejecutar
      await authenticateAny(mockReq, mockRes, mockNext)

      // Verificar
      expect(jwt.verify).toHaveBeenCalledWith('valid-token', JWT.secret)
      expect(Admin.findByPk).toHaveBeenCalledWith(1)
      expect(mockReq.user).toEqual({
        id: mockAdmin.id,
        name: mockAdmin.name,
        email: mockAdmin.email,
        role: mockAdmin.role,
        type: 'admin'
      })
      expect(mockNext).toHaveBeenCalled()
    })

    it('should authenticate user successfully', async () => {
      // Configurar mocks
      mockReq.headers.authorization = 'Bearer valid-token'
      jwt.verify.mockReturnValue({ id: 1, type: 'user' })
      User.findByPk.mockResolvedValue(mockUser)

      // Ejecutar
      await authenticateAny(mockReq, mockRes, mockNext)

      // Verificar
      expect(jwt.verify).toHaveBeenCalledWith('valid-token', JWT.secret)
      expect(User.findByPk).toHaveBeenCalledWith(1)
      expect(mockReq.user).toEqual({
        id: mockUser.id,
        firstName: mockUser.first_name,
        lastName: mockUser.last_name,
        email: mockUser.email,
        type: 'user'
      })
      expect(mockNext).toHaveBeenCalled()
    })

    it('should return 401 if no token provided', async () => {
      // Ejecutar
      await authenticateAny(mockReq, mockRes, mockNext)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Acceso no autorizado. Token no proporcionado.'
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should return 401 if user not found', async () => {
      // Configurar mocks
      mockReq.headers.authorization = 'Bearer valid-token'
      jwt.verify.mockReturnValue({ id: 1, type: 'user' })
      User.findByPk.mockResolvedValue(null)

      // Ejecutar
      await authenticateAny(mockReq, mockRes, mockNext)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Acceso no autorizado. Usuario no válido.'
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should return 401 if admin not found or inactive', async () => {
      // Configurar mocks
      mockReq.headers.authorization = 'Bearer valid-token'
      jwt.verify.mockReturnValue({ id: 1, type: 'admin' })
      Admin.findByPk.mockResolvedValue(null)

      // Ejecutar
      await authenticateAny(mockReq, mockRes, mockNext)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Acceso no autorizado. Administrador no válido o inactivo.'
      })
      expect(mockNext).not.toHaveBeenCalled()
    })
  })
})
