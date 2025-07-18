const licenseChangeService = require('../../../services/licenseChange.service')
const { License, Order, Product, User } = require('../../../models')
const TransactionManager = require('../../../utils/transactionManager')
const emailService = require('../../../services/email')

// Mock dependencies
jest.mock('../../../models')
jest.mock('../../../utils/transactionManager')
jest.mock('../../../services/email')

describe('LicenseChangeService', () => {
  let mockTransaction

  beforeEach(() => {
    mockTransaction = {
      LOCK: { UPDATE: 'UPDATE' }
    }

    TransactionManager.executeInventoryTransaction.mockImplementation(async (callback) => {
      return await callback(mockTransaction)
    })

    // Reset all mocks
    jest.clearAllMocks()
  })

  describe('changeLicense', () => {
    const validParams = {
      licenseKey: 'AAA-BBB-CCC-111',
      customerDocumentNumber: '12345678',
      newProductRef: 'SOFT-PRO-2Y'
    }

    const mockLicense = {
      id: 1,
      licenseKey: 'AAA-BBB-CCC-111',
      productRef: 'SOFT-PRO-1Y',
      status: 'SOLD',
      orderId: 1,
      update: jest.fn().mockResolvedValue(true)
    }

    const mockNewLicense = {
      id: 2,
      licenseKey: 'DDD-EEE-FFF-222',
      productRef: 'SOFT-PRO-2Y',
      status: 'AVAILABLE',
      orderId: null,
      instructions: 'Nuevas instrucciones',
      update: jest.fn().mockResolvedValue(true)
    }

    const mockCustomer = {
      id: 1,
      first_name: 'Juan',
      last_name: 'Pérez',
      email: 'juan@test.com',
      document_number: '12345678'
    }

    const mockOrder = {
      id: 1,
      status: 'COMPLETED',
      productRef: 'SOFT-PRO-1Y',
      shippingInfo: {},
      product: { name: 'Software Pro 1 Año' },
      update: jest.fn().mockResolvedValue(true)
    }

    const mockOldProduct = {
      productRef: 'SOFT-PRO-1Y',
      name: 'Software Pro 1 Año',
      price: 99900,
      isActive: true,
      license_type: true
    }

    const mockNewProduct = {
      productRef: 'SOFT-PRO-2Y',
      name: 'Software Pro 2 Años',
      price: 99900,
      isActive: true,
      license_type: true
    }

    it('should change license successfully', async () => {
      // Mock the async email method
      emailService.sendLicenseChangeEmail.mockResolvedValue({
        success: true,
        messageId: 'mock-message-id'
      })

      // Setup proper mock sequence
      License.findOne
        .mockResolvedValueOnce(mockLicense) // findAndValidateLicense
        .mockResolvedValueOnce(mockNewLicense) // findAvailableLicenseForNewProduct

      Order.findByPk
        .mockResolvedValueOnce({ ...mockOrder, customer: mockCustomer }) // findAndValidateCustomer
        .mockResolvedValueOnce({ ...mockOrder, product: mockOldProduct }) // findAndValidateOrder

      Product.findOne
        .mockResolvedValueOnce(mockNewProduct) // findAndValidateNewProduct
        .mockResolvedValueOnce(mockOldProduct) // price validation

      // Execute
      const result = await licenseChangeService.changeLicense(
        validParams.licenseKey,
        validParams.customerDocumentNumber,
        validParams.newProductRef,
        1 // adminId
      )

      // Verify
      expect(result.success).toBe(true)
      expect(result.oldLicense.licenseKey).toBe('AAA-BBB-CCC-111')
      expect(result.newLicense.licenseKey).toBe('DDD-EEE-FFF-222')
      expect(result.order.productRef).toBe('SOFT-PRO-2Y')
      expect(result.customer.documentNumber).toBe('12345678')
      expect(result.changeInfo.adminId).toBe(1)

      // Verify license updates were called correctly
      expect(mockLicense.update).toHaveBeenCalledWith({
        status: 'AVAILABLE',
        orderId: null,
        soldAt: null,
        reservedAt: null
      }, { transaction: mockTransaction })

      expect(mockNewLicense.update).toHaveBeenCalledWith({
        status: 'SOLD',
        orderId: 1,
        soldAt: expect.any(Date)
      }, { transaction: mockTransaction })
    })

    it('should throw error if license not found', async () => {
      License.findOne.mockResolvedValue(null)

      await expect(licenseChangeService.changeLicense(
        validParams.licenseKey,
        validParams.customerDocumentNumber,
        validParams.newProductRef,
        1
      )).rejects.toThrow('Licencia no encontrada')
    })

    it('should throw error if license is not SOLD', async () => {
      const availableLicense = { ...mockLicense, status: 'AVAILABLE' }
      License.findOne.mockResolvedValue(availableLicense)

      await expect(licenseChangeService.changeLicense(
        validParams.licenseKey,
        validParams.customerDocumentNumber,
        validParams.newProductRef,
        1
      )).rejects.toThrow('Solo se pueden cambiar licencias que estén vendidas (SOLD)')
    })

    it('should throw error if customer document does not match', async () => {
      License.findOne.mockResolvedValue(mockLicense)
      Order.findByPk.mockResolvedValue({
        ...mockOrder,
        customer: { ...mockCustomer, document_number: '87654321' }
      })

      await expect(licenseChangeService.changeLicense(
        validParams.licenseKey,
        validParams.customerDocumentNumber,
        validParams.newProductRef,
        1
      )).rejects.toThrow('El número de documento no coincide con el propietario de la licencia')
    })

    it('should throw error if trying to change to same product', async () => {
      License.findOne.mockResolvedValue(mockLicense)
      Order.findByPk.mockResolvedValue({ ...mockOrder, customer: mockCustomer })

      await expect(licenseChangeService.changeLicense(
        validParams.licenseKey,
        validParams.customerDocumentNumber,
        'SOFT-PRO-1Y', // Same as current product
        1
      )).rejects.toThrow('No se puede cambiar a la misma referencia de producto')
    })

    it('should throw error if new product not found', async () => {
      License.findOne.mockResolvedValue(mockLicense)
      Order.findByPk.mockResolvedValue({ ...mockOrder, customer: mockCustomer })
      Product.findOne.mockResolvedValue(null) // new product not found

      await expect(licenseChangeService.changeLicense(
        validParams.licenseKey,
        validParams.customerDocumentNumber,
        validParams.newProductRef,
        1
      )).rejects.toThrow('Producto con referencia SOFT-PRO-2Y no encontrado')
    })

    it('should throw error if new product is not active', async () => {
      License.findOne.mockResolvedValue(mockLicense)
      Order.findByPk.mockResolvedValue({ ...mockOrder, customer: mockCustomer })
      Product.findOne.mockResolvedValue({ ...mockNewProduct, isActive: false })

      await expect(licenseChangeService.changeLicense(
        validParams.licenseKey,
        validParams.customerDocumentNumber,
        validParams.newProductRef,
        1
      )).rejects.toThrow('El producto SOFT-PRO-2Y no está disponible')
    })

    it('should throw error if new product does not support licenses', async () => {
      License.findOne.mockResolvedValue(mockLicense)
      Order.findByPk.mockResolvedValue({ ...mockOrder, customer: mockCustomer })
      Product.findOne.mockResolvedValue({ ...mockNewProduct, license_type: false })

      await expect(licenseChangeService.changeLicense(
        validParams.licenseKey,
        validParams.customerDocumentNumber,
        validParams.newProductRef,
        1
      )).rejects.toThrow('El producto SOFT-PRO-2Y no soporta licencias')
    })

    it('should throw error if current product does not exist', async () => {
      License.findOne.mockResolvedValue(mockLicense)
      Order.findByPk.mockResolvedValue({ ...mockOrder, customer: mockCustomer })
      Product.findOne
        .mockResolvedValueOnce(mockNewProduct) // new product
        .mockResolvedValueOnce(null) // current product not found

      await expect(licenseChangeService.changeLicense(
        validParams.licenseKey,
        validParams.customerDocumentNumber,
        validParams.newProductRef,
        1
      )).rejects.toThrow('El producto actual SOFT-PRO-1Y no existe')
    })

    it('should throw error if prices do not match', async () => {
      License.findOne.mockResolvedValue(mockLicense)
      Order.findByPk.mockResolvedValue({ ...mockOrder, customer: mockCustomer })
      Product.findOne
        .mockResolvedValueOnce({ ...mockNewProduct, price: 199900 }) // new product with different price
        .mockResolvedValueOnce({ ...mockOldProduct, price: 99900 }) // old product

      await expect(licenseChangeService.changeLicense(
        validParams.licenseKey,
        validParams.customerDocumentNumber,
        validParams.newProductRef,
        1
      )).rejects.toThrow('Los precios no coinciden. Producto actual: 99900, Nuevo producto: 199900')
    })

    it('should throw error if order is not completed', async () => {
      License.findOne.mockResolvedValue(mockLicense)
      Order.findByPk
        .mockResolvedValueOnce({ ...mockOrder, customer: mockCustomer })
        .mockResolvedValueOnce({ ...mockOrder, status: 'PENDING' })

      Product.findOne
        .mockResolvedValueOnce(mockNewProduct)
        .mockResolvedValueOnce(mockOldProduct)

      await expect(licenseChangeService.changeLicense(
        validParams.licenseKey,
        validParams.customerDocumentNumber,
        validParams.newProductRef,
        1
      )).rejects.toThrow('Solo se pueden cambiar licencias de órdenes completadas')
    })

    it('should throw error if no available license for new product', async () => {
      License.findOne
        .mockResolvedValueOnce(mockLicense) // findAndValidateLicense
        .mockResolvedValueOnce(null) // findAvailableLicenseForNewProduct

      Order.findByPk
        .mockResolvedValueOnce({ ...mockOrder, customer: mockCustomer })
        .mockResolvedValueOnce({ ...mockOrder, product: mockOldProduct })

      Product.findOne
        .mockResolvedValueOnce(mockNewProduct)
        .mockResolvedValueOnce(mockOldProduct)

      await expect(licenseChangeService.changeLicense(
        validParams.licenseKey,
        validParams.customerDocumentNumber,
        validParams.newProductRef,
        1
      )).rejects.toThrow('No hay licencias disponibles para el producto SOFT-PRO-2Y')
    })

    it('should throw error if new license is not available after lock', async () => {
      License.findOne
        .mockResolvedValueOnce(mockLicense) // findAndValidateLicense
        .mockResolvedValueOnce({ ...mockNewLicense, orderId: 999 }) // license already taken

      Order.findByPk
        .mockResolvedValueOnce({ ...mockOrder, customer: mockCustomer })
        .mockResolvedValueOnce({ ...mockOrder, product: mockOldProduct })

      Product.findOne
        .mockResolvedValueOnce(mockNewProduct)
        .mockResolvedValueOnce(mockOldProduct)

      await expect(licenseChangeService.changeLicense(
        validParams.licenseKey,
        validParams.customerDocumentNumber,
        validParams.newProductRef,
        1
      )).rejects.toThrow('La licencia seleccionada ya no está disponible')
    })
  })

  describe('validateInput', () => {
    it('should throw error if licenseKey is missing', () => {
      expect(() => {
        licenseChangeService.validateInput('', '12345678', 'SOFT-PRO-2Y')
      }).toThrow('licenseKey es requerido y debe ser una cadena de texto')
    })

    it('should throw error if customerDocumentNumber is missing', () => {
      expect(() => {
        licenseChangeService.validateInput('AAA-BBB-CCC-111', '', 'SOFT-PRO-2Y')
      }).toThrow('customerDocumentNumber es requerido y debe ser una cadena de texto')
    })

    it('should throw error if newProductRef is missing', () => {
      expect(() => {
        licenseChangeService.validateInput('AAA-BBB-CCC-111', '12345678', '')
      }).toThrow('newProductRef es requerido y debe ser una cadena de texto')
    })

    it('should throw error if licenseKey has invalid format', () => {
      expect(() => {
        licenseChangeService.validateInput('aaa-bbb-ccc-111', '12345678', 'SOFT-PRO-2Y')
      }).toThrow('Formato de licenseKey inválido')
    })

    it('should throw error if customerDocumentNumber has invalid format', () => {
      expect(() => {
        licenseChangeService.validateInput('AAA-BBB-CCC-111', '12345678!', 'SOFT-PRO-2Y')
      }).toThrow('El número de documento debe ser numérico con 8-12 dígitos')
    })

    it('should throw error if newProductRef has invalid format', () => {
      expect(() => {
        licenseChangeService.validateInput('AAA-BBB-CCC-111', '12345678', 'soft-pro-2y')
      }).toThrow('Formato de newProductRef inválido')
    })

    it('should pass validation with valid inputs', () => {
      expect(() => {
        licenseChangeService.validateInput('AAA-BBB-CCC-111', '12345678', 'SOFT-PRO-2Y')
      }).not.toThrow()
    })
  })
})