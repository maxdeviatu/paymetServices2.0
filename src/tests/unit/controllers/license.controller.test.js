const licenseController = require('../../../controllers/license.controller')
const licenseService = require('../../../services/license.service')

// Mock de las dependencias
jest.mock('../../../services/license.service')
jest.mock('../../../config/logger')
jest.mock('csv-parse/sync', () => ({
  parse: jest.fn()
}))

const csv = require('csv-parse/sync')

describe('LicenseController', () => {
  let mockReq
  let mockRes

  beforeEach(() => {
    // Limpiar todos los mocks antes de cada prueba
    jest.clearAllMocks()

    // Configurar request y response mocks
    mockReq = {
      body: {},
      params: {},
      query: {},
      admin: { id: 1 },
      file: null
    }
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      attachment: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn()
    }
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

    it('should return all licenses successfully', async () => {
      // Configurar mocks
      licenseService.getAll.mockResolvedValue(mockLicenses)

      // Ejecutar
      await licenseController.getAll(mockReq, mockRes)

      // Verificar
      expect(licenseService.getAll).toHaveBeenCalledWith({})
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockLicenses,
        count: mockLicenses.length
      })
    })

    it('should apply query filters', async () => {
      // Configurar mocks
      mockReq.query = { status: 'AVAILABLE', productRef: 'SOFT-PRO-1Y' }
      const filteredLicenses = [mockLicenses[0]]
      licenseService.getAll.mockResolvedValue(filteredLicenses)

      // Ejecutar
      await licenseController.getAll(mockReq, mockRes)

      // Verificar
      expect(licenseService.getAll).toHaveBeenCalledWith({
        status: 'AVAILABLE',
        productRef: 'SOFT-PRO-1Y'
      })
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: filteredLicenses,
        count: filteredLicenses.length
      })
    })

    it('should handle service errors', async () => {
      // Configurar mocks
      const error = new Error('Service error')
      licenseService.getAll.mockRejectedValue(error)

      // Ejecutar
      await licenseController.getAll(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Service error'
      })
    })
  })

  describe('getById', () => {
    const mockLicense = {
      id: 1,
      productRef: 'SOFT-PRO-1Y',
      licenseKey: 'AAA-BBB-CCC-111',
      status: 'AVAILABLE'
    }

    it('should return license by ID successfully', async () => {
      // Configurar mocks
      mockReq.params.id = '1'
      licenseService.getById.mockResolvedValue(mockLicense)

      // Ejecutar
      await licenseController.getById(mockReq, mockRes)

      // Verificar
      expect(licenseService.getById).toHaveBeenCalledWith('1')
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockLicense
      })
    })

    it('should return 404 if license not found', async () => {
      // Configurar mocks
      mockReq.params.id = '1'
      const error = new Error('License not found')
      licenseService.getById.mockRejectedValue(error)

      // Ejecutar
      await licenseController.getById(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'License not found'
      })
    })
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
      createdAt: new Date()
    }

    it('should create license successfully', async () => {
      // Configurar mocks
      mockReq.body = licenseData
      licenseService.create.mockResolvedValue(mockCreatedLicense)

      // Ejecutar
      await licenseController.create(mockReq, mockRes)

      // Verificar
      expect(licenseService.create).toHaveBeenCalledWith(licenseData)
      expect(mockRes.status).toHaveBeenCalledWith(201)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockCreatedLicense,
        message: 'License created successfully'
      })
    })

    it('should handle creation errors', async () => {
      // Configurar mocks
      mockReq.body = licenseData
      const error = new Error('Creation failed')
      licenseService.create.mockRejectedValue(error)

      // Ejecutar
      await licenseController.create(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Creation failed'
      })
    })
  })

  describe('update', () => {
    const updateData = {
      instructions: 'New instructions'
    }

    const mockUpdatedLicense = {
      id: 1,
      productRef: 'SOFT-PRO-1Y',
      licenseKey: 'AAA-BBB-CCC-111',
      instructions: 'New instructions',
      status: 'AVAILABLE'
    }

    it('should update license successfully', async () => {
      // Configurar mocks
      mockReq.params.id = '1'
      mockReq.body = updateData
      licenseService.update.mockResolvedValue(mockUpdatedLicense)

      // Ejecutar
      await licenseController.update(mockReq, mockRes)

      // Verificar
      expect(licenseService.update).toHaveBeenCalledWith('1', updateData)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockUpdatedLicense,
        message: 'License updated successfully'
      })
    })

    it('should return 404 if license not found', async () => {
      // Configurar mocks
      mockReq.params.id = '1'
      mockReq.body = updateData
      const error = new Error('License not found')
      licenseService.update.mockRejectedValue(error)

      // Ejecutar
      await licenseController.update(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'License not found'
      })
    })
  })

  describe('delete', () => {
    it('should delete license successfully', async () => {
      // Configurar mocks
      mockReq.params.id = '1'
      licenseService.update.mockResolvedValue({})

      // Ejecutar
      await licenseController.delete(mockReq, mockRes)

      // Verificar
      expect(licenseService.update).toHaveBeenCalledWith('1', { status: 'ANNULLED' })
      expect(mockRes.status).toHaveBeenCalledWith(204)
    })

    it('should handle delete errors', async () => {
      // Configurar mocks
      mockReq.params.id = '1'
      const error = new Error('License not found')
      licenseService.update.mockRejectedValue(error)

      // Ejecutar
      await licenseController.delete(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'License not found'
      })
    })
  })

  describe('annul', () => {
    const mockAnnulledLicense = {
      id: 1,
      licenseKey: 'ANULADA-C-111',
      status: 'ANNULLED'
    }

    it('should annul license successfully', async () => {
      // Configurar mocks
      mockReq.params.code = 'AAA-BBB-CCC-111'
      licenseService.annul.mockResolvedValue(mockAnnulledLicense)

      // Ejecutar
      await licenseController.annul(mockReq, mockRes)

      // Verificar
      expect(licenseService.annul).toHaveBeenCalledWith('AAA-BBB-CCC-111', 1)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockAnnulledLicense,
        message: 'License annulled successfully'
      })
    })

    it('should handle annul errors', async () => {
      // Configurar mocks
      mockReq.params.code = 'INVALID-KEY'
      const error = new Error('Cannot annul license')
      licenseService.annul.mockRejectedValue(error)

      // Ejecutar
      await licenseController.annul(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Cannot annul license'
      })
    })
  })

  describe('return', () => {
    const mockReturnedLicense = {
      id: 1,
      licenseKey: 'AAA-BBB-CCC-111',
      status: 'RETURNED'
    }

    it('should return license to stock successfully', async () => {
      // Configurar mocks
      mockReq.params.code = 'AAA-BBB-CCC-111'
      licenseService.returnToStock.mockResolvedValue(mockReturnedLicense)

      // Ejecutar
      await licenseController.return(mockReq, mockRes)

      // Verificar
      expect(licenseService.returnToStock).toHaveBeenCalledWith('AAA-BBB-CCC-111')
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockReturnedLicense,
        message: 'License returned to stock successfully'
      })
    })

    it('should handle return errors', async () => {
      // Configurar mocks
      mockReq.params.code = 'INVALID-KEY'
      const error = new Error('Only SOLD licenses can be returned')
      licenseService.returnToStock.mockRejectedValue(error)

      // Ejecutar
      await licenseController.return(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Only SOLD licenses can be returned'
      })
    })
  })

  describe('templateCsv', () => {
    it('should download CSV template successfully', async () => {
      // Ejecutar
      await licenseController.templateCsv(mockReq, mockRes)

      // Verificar
      expect(mockRes.attachment).toHaveBeenCalledWith('licenses-template.csv')
      expect(mockRes.type).toHaveBeenCalledWith('text/csv')
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('productRef,licenseKey,instructions')
      )
    })

    it('should handle template generation errors', async () => {
      // Configurar mocks para simular error
      mockRes.attachment.mockImplementation(() => {
        throw new Error('File system error')
      })

      // Ejecutar
      await licenseController.templateCsv(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error generating template'
      })
    })
  })

  describe('bulkUpload', () => {
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

    beforeEach(() => {
      mockReq.file = {
        originalname: 'licenses.csv',
        buffer: Buffer.from('productRef,licenseKey,instructions\\nSOFT-PRO-1Y,AAA-BBB-CCC-111,Download from site')
      }
    })

    it('should upload CSV successfully', async () => {
      // Configurar mocks
      csv.parse.mockReturnValue(csvRows)
      licenseService.bulkImport.mockResolvedValue(csvRows)

      // Ejecutar
      await licenseController.bulkUpload(mockReq, mockRes)

      // Verificar
      expect(csv.parse).toHaveBeenCalledWith(
        mockReq.file.buffer.toString('utf8'),
        {
          columns: true,
          trim: true,
          skip_empty_lines: true
        }
      )
      expect(licenseService.bulkImport).toHaveBeenCalledWith(csvRows)
      expect(mockRes.status).toHaveBeenCalledWith(201)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Successfully imported 2 licenses',
        data: {
          imported: 2,
          total: 2
        }
      })
    })

    it('should return 400 if no file provided', async () => {
      // Configurar mocks
      mockReq.file = null

      // Ejecutar
      await licenseController.bulkUpload(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'CSV file is required'
      })
    })

    it('should return 400 if CSV is empty', async () => {
      // Configurar mocks
      csv.parse.mockReturnValue([])

      // Ejecutar
      await licenseController.bulkUpload(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'CSV file is empty or invalid'
      })
    })

    it('should return 400 if required columns are missing', async () => {
      // Configurar mocks
      const invalidRows = [{ productRef: 'SOFT-PRO-1Y' }] // Missing licenseKey
      csv.parse.mockReturnValue(invalidRows)

      // Ejecutar
      await licenseController.bulkUpload(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Missing required columns: licenseKey'
      })
    })

    it('should handle bulk import errors', async () => {
      // Configurar mocks
      csv.parse.mockReturnValue(csvRows)
      const error = new Error('Bulk import failed')
      licenseService.bulkImport.mockRejectedValue(error)

      // Ejecutar
      await licenseController.bulkUpload(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Bulk import failed'
      })
    })

    it('should handle CSV parsing errors', async () => {
      // Configurar mocks
      csv.parse.mockImplementation(() => {
        throw new Error('Invalid CSV format')
      })

      // Ejecutar
      await licenseController.bulkUpload(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid CSV format'
      })
    })
  })
})