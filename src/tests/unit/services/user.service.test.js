const userService = require('../../../services/user.service')
const { User } = require('../../../models')
const jwt = require('jsonwebtoken')
const { Op } = require('sequelize')
const { JWT } = require('../../../config')

// Mock de las dependencias
jest.mock('../../../models', () => ({
  User: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAndCountAll: jest.fn()
  }
}))

jest.mock('../../../config/logger')
jest.mock('../../../utils/pseudoMailer')

describe('UserService', () => {
  beforeEach(() => {
    // Limpiar todos los mocks antes de cada prueba
    jest.clearAllMocks()
  })

  describe('createUser', () => {
    const userData = {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      document_type: 'CC',
      document_number: '12345678',
      consent_accepted: true
    }

    const mockCreatedUser = {
      id: 1,
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    it('should create a new user successfully', async () => {
      // Configurar mocks
      User.findOne.mockResolvedValueOnce(null) // No existe usuario con el email
      User.findOne.mockResolvedValueOnce(null) // No existe usuario con el documento
      User.create.mockResolvedValue(mockCreatedUser)

      // Ejecutar
      const result = await userService.createUser(userData)

      // Verificar
      expect(User.findOne).toHaveBeenCalledTimes(2)
      expect(User.findOne).toHaveBeenNthCalledWith(1, { where: { email: userData.email } })
      expect(User.findOne).toHaveBeenNthCalledWith(2, {
        where: {
          document_type: userData.document_type,
          document_number: userData.document_number
        }
      })
      expect(User.create).toHaveBeenCalledWith(userData)
      expect(result).toEqual(mockCreatedUser)
    })

    it('should throw error if user with same email exists', async () => {
      // Configurar mocks
      User.findOne.mockResolvedValue({ id: 1, email: userData.email })

      // Ejecutar y verificar
      await expect(userService.createUser(userData))
        .rejects.toThrow(`Ya existe un usuario con el email ${userData.email}`)
    })

    it('should throw error if user with same document exists', async () => {
      // Configurar mocks
      User.findOne.mockResolvedValueOnce(null) // No existe usuario con el email
      User.findOne.mockResolvedValueOnce({ id: 2 }) // Existe usuario con el documento

      // Ejecutar y verificar
      await expect(userService.createUser(userData))
        .rejects.toThrow(`Ya existe un usuario con el documento ${userData.document_type} ${userData.document_number}`)
    })
  })

  describe('getUserById', () => {
    const mockUser = {
      id: 1,
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com'
    }

    it('should return user if found', async () => {
      // Configurar mocks
      User.findByPk.mockResolvedValue(mockUser)

      // Ejecutar
      const result = await userService.getUserById(1)

      // Verificar
      expect(User.findByPk).toHaveBeenCalledWith(1)
      expect(result).toEqual(mockUser)
    })

    it('should throw error if user not found', async () => {
      // Configurar mocks
      User.findByPk.mockResolvedValue(null)

      // Ejecutar y verificar
      await expect(userService.getUserById(1))
        .rejects.toThrow('Usuario no encontrado')
    })
  })

  describe('getUserByEmail', () => {
    const mockUser = {
      id: 1,
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com'
    }

    it('should return user if found', async () => {
      // Configurar mocks
      User.findOne.mockResolvedValue(mockUser)

      // Ejecutar
      const result = await userService.getUserByEmail('john@example.com')

      // Verificar
      expect(User.findOne).toHaveBeenCalledWith({
        where: { email: 'john@example.com' }
      })
      expect(result).toEqual(mockUser)
    })

    it('should throw error if user not found', async () => {
      // Configurar mocks
      User.findOne.mockResolvedValue(null)

      // Ejecutar y verificar
      await expect(userService.getUserByEmail('john@example.com'))
        .rejects.toThrow('Usuario no encontrado')
    })
  })

  describe('updateUser', () => {
    const mockUser = {
      id: 1,
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      update: jest.fn(),
      reload: jest.fn()
    }

    it('should update user successfully', async () => {
      // Configurar mocks
      User.findByPk.mockResolvedValue(mockUser)

      // Simular que el objeto se actualiza in-situ
      mockUser.update.mockImplementation((data) => {
        Object.assign(mockUser, data)
        return Promise.resolve(mockUser)
      })

      // Ejecutar
      const result = await userService.updateUser(1, { first_name: 'Johnny' })

      // Verificar
      expect(User.findByPk).toHaveBeenCalledWith(1)
      expect(mockUser.update).toHaveBeenCalledWith({ first_name: 'Johnny' })
      expect(result.first_name).toBe('Johnny')
      expect(result).toBe(mockUser) // Debería ser el mismo objeto
    })

    it('should throw error if user not found', async () => {
      // Configurar mocks
      User.findByPk.mockResolvedValue(null)

      // Ejecutar y verificar
      await expect(userService.updateUser(1, { first_name: 'Johnny' }))
        .rejects.toThrow('Usuario no encontrado')
    })
  })

  describe('generateUserToken', () => {
    const mockUser = {
      id: 1,
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com'
    }

    it('should generate valid JWT token', () => {
      // Ejecutar
      const token = userService.generateUserToken(mockUser)

      // Verificar
      expect(typeof token).toBe('string')

      // Decodificar el token para verificar el payload
      const decoded = jwt.verify(token, JWT.secret)
      expect(decoded.id).toBe(mockUser.id)
      expect(decoded.type).toBe('user')
      expect(decoded.email).toBe(mockUser.email)
    })
  })

  describe('userExistsByEmail', () => {
    it('should return true if user exists', async () => {
      // Configurar mocks
      User.findOne.mockResolvedValue({ id: 1 })

      // Ejecutar
      const result = await userService.userExistsByEmail('john@example.com')

      // Verificar
      expect(User.findOne).toHaveBeenCalledWith({
        where: { email: 'john@example.com' }
      })
      expect(result).toBe(true)
    })

    it('should return false if user does not exist', async () => {
      // Configurar mocks
      User.findOne.mockResolvedValue(null)

      // Ejecutar
      const result = await userService.userExistsByEmail('john@example.com')

      // Verificar
      expect(result).toBe(false)
    })
  })

  describe('listUsers', () => {
    const mockUsers = [
      {
        id: 1,
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        document_type: 'CC',
        document_number: '12345678'
      },
      {
        id: 2,
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        document_type: 'CC',
        document_number: '87654321'
      }
    ]

    it('should return paginated users', async () => {
      // Configurar mocks
      User.findAndCountAll.mockResolvedValue({
        count: 2,
        rows: mockUsers
      })

      // Ejecutar
      const result = await userService.listUsers({ page: 1, limit: 10 })

      // Verificar
      expect(User.findAndCountAll).toHaveBeenCalledWith({
        where: {},
        offset: 0,
        limit: 10,
        order: [['createdAt', 'DESC']],
        attributes: { exclude: [] }
      })
      expect(result).toEqual({
        users: mockUsers,
        pagination: {
          total: 2,
          page: 1,
          limit: 10,
          pages: 1
        }
      })
    })

    it('should apply search filter', async () => {
      // Configurar mocks
      User.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [mockUsers[0]]
      })

      // Ejecutar
      const result = await userService.listUsers({
        page: 1,
        limit: 10,
        search: 'John'
      })

      // Verificar
      expect(User.findAndCountAll).toHaveBeenCalledWith({
        where: {
          [Op.or]: [
            { first_name: { [Op.iLike]: '%John%' } },
            { last_name: { [Op.iLike]: '%John%' } },
            { email: { [Op.iLike]: '%John%' } },
            { document_number: { [Op.iLike]: '%John%' } }
          ]
        },
        offset: 0,
        limit: 10,
        order: [['createdAt', 'DESC']],
        attributes: { exclude: [] }
      })
      expect(result.users).toEqual([mockUsers[0]])
    })
  })
})
