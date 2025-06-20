const productService = require('../../../services/product.service')
const { Product, Discount } = require('../../../models')

// Mock de las dependencias
jest.mock('../../../models', () => ({
  Product: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAndCountAll: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn()
  },
  Discount: {
    findOne: jest.fn()
  }
}))

describe('ProductService', () => {
  beforeEach(() => {
    // Limpiar todos los mocks antes de cada prueba
    jest.clearAllMocks()
  })

  describe('createProduct', () => {
    const productData = {
      name: 'Test Product',
      productRef: 'TEST-PROD-1',
      price: 1000,
      currency: 'USD',
      description: 'Test description',
      license_type: true
    }

    const mockCreatedProduct = {
      id: 1,
      ...productData,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    it('should create a new product successfully', async () => {
      // Configurar mocks
      Product.findOne.mockResolvedValue(null)
      Product.create.mockResolvedValue(mockCreatedProduct)

      // Ejecutar
      const result = await productService.createProduct(productData)

      // Verificar
      expect(Product.create).toHaveBeenCalledWith(productData)
      expect(result).toEqual(mockCreatedProduct)
    })

    it('should throw error if product with same reference exists', async () => {
      // Configurar mocks
      Product.findOne.mockResolvedValue({ id: 2, productRef: productData.productRef })

      // Ejecutar y verificar
      await expect(productService.createProduct(productData))
        .rejects.toThrow(`Ya existe un producto con la referencia ${productData.productRef}`)
    })
  })

  describe('getProductById', () => {
    const mockProduct = {
      id: 1,
      name: 'Test Product',
      productRef: 'TEST-PROD-1',
      price: 1000,
      license_type: true,
      isActive: true
    }

    it('should return product if found', async () => {
      // Configurar mocks
      Product.findOne.mockResolvedValue(mockProduct)

      // Ejecutar
      const result = await productService.getProductById(1)

      // Verificar
      expect(Product.findOne).toHaveBeenCalledWith({
        where: { id: 1, isActive: true },
        include: [{ model: Discount, as: 'discount' }]
      })
      expect(result).toEqual(mockProduct)
    })

    it('should throw error if product not found', async () => {
      // Configurar mocks
      Product.findOne.mockResolvedValue(null)

      // Ejecutar y verificar
      await expect(productService.getProductById(1))
        .rejects.toThrow('Producto no encontrado')
    })
  })

  describe('listProducts', () => {
    const mockProducts = [
      {
        id: 1,
        name: 'Test Product 1',
        productRef: 'TEST-PROD-1',
        price: 1000,
        license_type: true,
        isActive: true
      },
      {
        id: 2,
        name: 'Test Product 2',
        productRef: 'TEST-PROD-2',
        price: 2000,
        license_type: false,
        isActive: true
      }
    ]

    it('should return paginated products', async () => {
      // Configurar mocks
      Product.findAndCountAll.mockResolvedValue({
        count: 2,
        rows: mockProducts
      })

      // Ejecutar
      const result = await productService.listProducts({ page: 1, limit: 20 })

      // Verificar
      expect(Product.findAndCountAll).toHaveBeenCalledWith({
        where: { isActive: true },
        include: [{ model: Discount, as: 'discount' }],
        offset: 0,
        limit: 20,
        order: [['createdAt', 'DESC']]
      })
      expect(result.products).toEqual(mockProducts)
      expect(result.pagination).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        pages: 1
      })
    })

    it('should include inactive products when specified', async () => {
      // Configurar mocks
      Product.findAndCountAll.mockResolvedValue({
        count: 2,
        rows: mockProducts
      })

      // Ejecutar
      await productService.listProducts({ includeInactive: true, page: 1, limit: 20 })

      // Verificar
      expect(Product.findAndCountAll).toHaveBeenCalledWith({
        where: {},
        include: [{ model: Discount, as: 'discount' }],
        offset: 0,
        limit: 20,
        order: [['createdAt', 'DESC']]
      })
    })
  })

  describe('updateProduct', () => {
    const mockProduct = {
      id: 1,
      name: 'Test Product',
      productRef: 'TEST-PROD-1',
      price: 1000,
      license_type: true,
      isActive: true,
      update: jest.fn()
    }

    it('should update product successfully', async () => {
      // Configurar mocks
      Product.findOne.mockResolvedValue(mockProduct)
      const updatedData = { name: 'Updated Product', license_type: false }
      mockProduct.update.mockResolvedValue({ ...mockProduct, ...updatedData })

      // Ejecutar
      const result = await productService.updateProduct(1, updatedData)

      // Verificar
      expect(mockProduct.update).toHaveBeenCalledWith(updatedData)
      expect(result.name).toBe('Updated Product')
      expect(result.license_type).toBe(false)
    })

    it('should throw error if product not found', async () => {
      // Configurar mocks
      Product.findOne.mockResolvedValue(null)

      // Ejecutar y verificar
      await expect(productService.updateProduct(1, { name: 'Updated' }))
        .rejects.toThrow('Producto no encontrado')
    })
  })
})
