const licenseService = require('../../../services/license.service')
const { License, Product, sequelize } = require('../../../models')

// Mock de las dependencias
jest.mock('../../../models', () => ({
  License: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    bulkCreate: jest.fn()
  },
  Product: {
    findOne: jest.fn(),
    findAll: jest.fn()
  },
  sequelize: {
    transaction: jest.fn()
  }
}))

jest.mock('../../../config/logger')

describe('LicenseService', () => {
  beforeEach(() => {
    // Limpiar todos los mocks antes de cada prueba
    jest.clearAllMocks()
  })

  describe('create', () => {
    const licenseData = {
      productRef: 'SOFT-PRO-1Y',
      licenseKey: 'AAA-BBB-CCC-111',
      instructions: 'Download from https://example.com'
    }

    const mockCreatedLicense = {
      id: 1,
      ...licenseData,
      status: 'AVAILABLE',
      createdAt: new Date(),
      updatedAt: new Date()
    }

    it('should create a new license successfully', async () => {
      // Configurar mocks
      const mockProduct = {
        productRef: 'SOFT-PRO-1Y',
        license_type: true
      }
      Product.findOne.mockResolvedValue(mockProduct)
      License.create.mockResolvedValue(mockCreatedLicense)

      // Ejecutar
      const result = await licenseService.create(licenseData)

      // Verificar
      expect(Product.findOne).toHaveBeenCalledWith({
        where: { productRef: licenseData.productRef }
      })
      expect(License.create).toHaveBeenCalledWith(licenseData)
      expect(result).toEqual(mockCreatedLicense)
    })

    it('should throw error if product not found', async () => {
      // Configurar mocks
      Product.findOne.mockResolvedValue(null)

      // Ejecutar y verificar
      await expect(licenseService.create(licenseData))
        .rejects.toThrow('Product with reference SOFT-PRO-1Y not found')
    })

    it('should throw error if product does not support licenses', async () => {
      // Configurar mocks
      const mockProduct = {
        productRef: 'SOFT-PRO-1Y',
        license_type: false
      }
      Product.findOne.mockResolvedValue(mockProduct)

      // Ejecutar y verificar
      await expect(licenseService.create(licenseData))
        .rejects.toThrow('Product SOFT-PRO-1Y does not support licenses. Set license_type to true first.')
    })

    it('should throw error if license creation fails', async () => {
      // Configurar mocks
      const mockProduct = {
        productRef: 'SOFT-PRO-1Y',
        license_type: true
      }
      Product.findOne.mockResolvedValue(mockProduct)
      const error = new Error('Database error')
      License.create.mockRejectedValue(error)

      // Ejecutar y verificar
      await expect(licenseService.create(licenseData))
        .rejects.toThrow('Database error')
    })
  })

  describe('update', () => {
    const mockLicense = {
      id: 1,
      productRef: 'SOFT-PRO-1Y',
      licenseKey: 'AAA-BBB-CCC-111',
      status: 'AVAILABLE',
      update: jest.fn()
    }

    it('should update license successfully', async () => {
      // Configurar mocks
      License.findByPk.mockResolvedValue(mockLicense)
      const updatedData = { instructions: 'New instructions' }
      mockLicense.update.mockResolvedValue({ ...mockLicense, ...updatedData })

      // Ejecutar
      const result = await licenseService.update(1, updatedData)

      // Verificar
      expect(License.findByPk).toHaveBeenCalledWith(1)
      expect(mockLicense.update).toHaveBeenCalledWith(updatedData)
      expect(result.instructions).toBe('New instructions')
    })

    it('should throw error if license not found', async () => {
      // Configurar mocks
      License.findByPk.mockResolvedValue(null)

      // Ejecutar y verificar
      await expect(licenseService.update(1, { instructions: 'New' }))
        .rejects.toThrow('License not found')
    })

    it('should not allow changing licenseKey for SOLD license', async () => {
      // Configurar mocks
      const soldLicense = {
        ...mockLicense,
        status: 'SOLD',
        update: jest.fn()
      }
      License.findByPk.mockResolvedValue(soldLicense)
      soldLicense.update.mockResolvedValue(soldLicense)

      // Ejecutar
      const updateData = { licenseKey: 'NEW-KEY-123', instructions: 'New instructions' }
      await licenseService.update(1, updateData)

      // Verificar que no se pasó licenseKey al update
      expect(soldLicense.update).toHaveBeenCalledWith({ instructions: 'New instructions' })
    })
  })

  describe('annul', () => {
    const mockTransaction = {
      LOCK: { UPDATE: 'UPDATE' }
    }

    const mockLicense = {
      id: 1,
      licenseKey: 'AAA-BBB-CCC-111',
      status: 'AVAILABLE',
      update: jest.fn()
    }

    it('should annul license successfully', async () => {
      // Configurar mocks
      sequelize.transaction.mockImplementation(async (callback) => {
        return await callback(mockTransaction)
      })
      License.findOne.mockResolvedValue(mockLicense)
      const annulledLicense = {
        ...mockLicense,
        licenseKey: 'ANULADA-C-111',
        status: 'ANNULLED',
        orderId: null,
        reservedAt: null
      }
      mockLicense.update.mockResolvedValue(annulledLicense)

      // Ejecutar
      const result = await licenseService.annul('AAA-BBB-CCC-111', 1)

      // Verificar
      expect(License.findOne).toHaveBeenCalledWith({
        where: { licenseKey: 'AAA-BBB-CCC-111' },
        lock: mockTransaction.LOCK.UPDATE,
        transaction: mockTransaction
      })
      expect(mockLicense.update).toHaveBeenCalledWith({
        licenseKey: 'ANULADA-C-111',
        status: 'ANNULLED',
        orderId: null,
        reservedAt: null
      }, { transaction: mockTransaction })
      expect(result).toEqual(annulledLicense)
    })

    it('should throw error if license not found', async () => {
      // Configurar mocks
      sequelize.transaction.mockImplementation(async (callback) => {
        return await callback(mockTransaction)
      })
      License.findOne.mockResolvedValue(null)

      // Ejecutar y verificar
      await expect(licenseService.annul('INVALID-KEY', 1))
        .rejects.toThrow('Cannot annul: License not found or already sold')
    })

    it('should throw error if license is already SOLD', async () => {
      // Configurar mocks
      sequelize.transaction.mockImplementation(async (callback) => {
        return await callback(mockTransaction)
      })
      const soldLicense = { ...mockLicense, status: 'SOLD' }
      License.findOne.mockResolvedValue(soldLicense)

      // Ejecutar y verificar
      await expect(licenseService.annul('AAA-BBB-CCC-111', 1))
        .rejects.toThrow('Cannot annul: License not found or already sold')
    })
  })

  describe('returnToStock', () => {
    const mockTransaction = {
      LOCK: { UPDATE: 'UPDATE' }
    }

    const mockSoldLicense = {
      id: 1,
      licenseKey: 'AAA-BBB-CCC-111',
      status: 'SOLD',
      orderId: 123,
      soldAt: new Date(),
      update: jest.fn()
    }

    it('should return license to stock successfully', async () => {
      // Configurar mocks
      sequelize.transaction.mockImplementation(async (callback) => {
        return await callback(mockTransaction)
      })
      License.findOne.mockResolvedValue(mockSoldLicense)
      const returnedLicense = {
        ...mockSoldLicense,
        status: 'RETURNED',
        orderId: null,
        soldAt: null,
        reservedAt: expect.any(Date)
      }
      mockSoldLicense.update.mockResolvedValue(returnedLicense)

      // Ejecutar
      const result = await licenseService.returnToStock('AAA-BBB-CCC-111')

      // Verificar
      expect(License.findOne).toHaveBeenCalledWith({
        where: { licenseKey: 'AAA-BBB-CCC-111' },
        lock: mockTransaction.LOCK.UPDATE,
        transaction: mockTransaction
      })
      expect(mockSoldLicense.update).toHaveBeenCalledWith({
        status: 'RETURNED',
        orderId: null,
        soldAt: null,
        reservedAt: expect.any(Date)
      }, { transaction: mockTransaction })
      expect(result).toEqual(returnedLicense)
    })

    it('should throw error if license is not SOLD', async () => {
      // Configurar mocks
      sequelize.transaction.mockImplementation(async (callback) => {
        return await callback(mockTransaction)
      })
      const availableLicense = { ...mockSoldLicense, status: 'AVAILABLE' }
      License.findOne.mockResolvedValue(availableLicense)

      // Ejecutar y verificar
      await expect(licenseService.returnToStock('AAA-BBB-CCC-111'))
        .rejects.toThrow('Only SOLD licenses can be returned to stock')
    })

    it('should throw error if license not found', async () => {
      // Configurar mocks
      sequelize.transaction.mockImplementation(async (callback) => {
        return await callback(mockTransaction)
      })
      License.findOne.mockResolvedValue(null)

      // Ejecutar y verificar
      await expect(licenseService.returnToStock('INVALID-KEY'))
        .rejects.toThrow('Only SOLD licenses can be returned to stock')
    })
  })

  describe('bulkImport', () => {
    const csvRows = [
      {
        productRef: 'SOFT-PRO-1Y',
        licenseKey: 'AAA-BBB-CCC-111',
        instructions: 'Download from site'
      },
      {
        productRef: 'SOFT-PRO-1Y',
        licenseKey: 'AAA-BBB-CCC-222',
        instructions: 'Follow setup guide'
      }
    ]

    it('should import licenses successfully', async () => {
      // Configurar mocks
      const mockProducts = [
        { productRef: 'SOFT-PRO-1Y', license_type: true }
      ]
      Product.findAll.mockResolvedValue(mockProducts)
      const mockResult = csvRows.map((row, index) => ({ id: index + 1, ...row }))
      License.bulkCreate.mockResolvedValue(mockResult)

      // Ejecutar
      const result = await licenseService.bulkImport(csvRows)

      // Verificar
      expect(Product.findAll).toHaveBeenCalledWith({
        where: { productRef: ['SOFT-PRO-1Y'] },
        attributes: ['productRef', 'license_type']
      })
      expect(License.bulkCreate).toHaveBeenCalledWith(csvRows, {
        ignoreDuplicates: true
      })
      expect(result).toEqual(mockResult)
    })

    it('should throw error if products not found', async () => {
      // Configurar mocks
      Product.findAll.mockResolvedValue([]) // No products found

      // Ejecutar y verificar
      await expect(licenseService.bulkImport(csvRows))
        .rejects.toThrow('Products not found: SOFT-PRO-1Y')
    })

    it('should throw error if products do not support licenses', async () => {
      // Configurar mocks
      const mockProducts = [
        { productRef: 'SOFT-PRO-1Y', license_type: false }
      ]
      Product.findAll.mockResolvedValue(mockProducts)

      // Ejecutar y verificar
      await expect(licenseService.bulkImport(csvRows))
        .rejects.toThrow('Products do not support licenses: SOFT-PRO-1Y. Set license_type to true first.')
    })

    it('should handle bulk import errors', async () => {
      // Configurar mocks
      const mockProducts = [
        { productRef: 'SOFT-PRO-1Y', license_type: true }
      ]
      Product.findAll.mockResolvedValue(mockProducts)
      const error = new Error('Bulk create failed')
      License.bulkCreate.mockRejectedValue(error)

      // Ejecutar y verificar
      await expect(licenseService.bulkImport(csvRows))
        .rejects.toThrow('Bulk create failed')
    })
  })

  describe('getAll', () => {
    const mockLicenses = [
      {
        id: 1,
        productRef: 'SOFT-PRO-1Y',
        licenseKey: 'AAA-BBB-CCC-111',
        status: 'AVAILABLE'
      },
      {
        id: 2,
        productRef: 'SOFT-PRO-1Y',
        licenseKey: 'AAA-BBB-CCC-222',
        status: 'SOLD'
      }
    ]

    it('should return all licenses without filters', async () => {
      // Configurar mocks
      License.findAll.mockResolvedValue(mockLicenses)

      // Ejecutar
      const result = await licenseService.getAll()

      // Verificar
      expect(License.findAll).toHaveBeenCalledWith({
        where: {},
        include: ['Product'],
        order: [['createdAt', 'DESC']]
      })
      expect(result).toEqual(mockLicenses)
    })

    it('should return filtered licenses', async () => {
      // Configurar mocks
      const filteredLicenses = [mockLicenses[0]]
      License.findAll.mockResolvedValue(filteredLicenses)

      // Ejecutar
      const result = await licenseService.getAll({ status: 'AVAILABLE' })

      // Verificar
      expect(License.findAll).toHaveBeenCalledWith({
        where: { status: 'AVAILABLE' },
        include: ['Product'],
        order: [['createdAt', 'DESC']]
      })
      expect(result).toEqual(filteredLicenses)
    })
  })

  describe('getById', () => {
    const mockLicense = {
      id: 1,
      productRef: 'SOFT-PRO-1Y',
      licenseKey: 'AAA-BBB-CCC-111',
      status: 'AVAILABLE'
    }

    it('should return license if found', async () => {
      // Configurar mocks
      License.findByPk.mockResolvedValue(mockLicense)

      // Ejecutar
      const result = await licenseService.getById(1)

      // Verificar
      expect(License.findByPk).toHaveBeenCalledWith(1, {
        include: ['Product']
      })
      expect(result).toEqual(mockLicense)
    })

    it('should throw error if license not found', async () => {
      // Configurar mocks
      License.findByPk.mockResolvedValue(null)

      // Ejecutar y verificar
      await expect(licenseService.getById(1))
        .rejects.toThrow('License not found')
    })
  })
})