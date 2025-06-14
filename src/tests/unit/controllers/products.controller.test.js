const productsController = require('../../../controllers/products.controller')
const productService = require('../../../services/product.service')

// Mock del servicio
jest.mock('../../../services/product.service')

describe('ProductsController', () => {
  let mockReq
  let mockRes

  beforeEach(() => {
    // Limpiar todos los mocks antes de cada prueba
    jest.clearAllMocks()

    // Configurar mocks de request y response
    mockReq = {
      params: {},
      query: {},
      body: {}
    }
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    }
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

    it('should create product successfully', async () => {
      // Configurar mocks
      mockReq.body = productData
      productService.createProduct.mockResolvedValue(mockCreatedProduct)

      // Ejecutar
      await productsController.createProduct(mockReq, mockRes)

      // Verificar
      expect(productService.createProduct).toHaveBeenCalledWith(productData)
      expect(mockRes.status).toHaveBeenCalledWith(201)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockCreatedProduct,
        message: 'Producto creado exitosamente'
      })
    })

    it('should handle creation errors', async () => {
      // Configurar mocks
      mockReq.body = productData
      const error = new Error('Creation failed')
      productService.createProduct.mockRejectedValue(error)

      // Ejecutar
      await productsController.createProduct(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Creation failed'
      })
    })
  })

  describe('getProducts', () => {
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
      mockReq.query = { page: '1', limit: '20' }
      productService.listProducts.mockResolvedValue({
        products: mockProducts,
        pagination: {
          total: 2,
          page: 1,
          limit: 20,
          pages: 1
        }
      })

      // Ejecutar
      await productsController.getProducts(mockReq, mockRes)

      // Verificar
      expect(productService.listProducts).toHaveBeenCalledWith({
        includeInactive: false,
        page: 1,
        limit: 20
      })
      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockProducts,
        pagination: {
          total: 2,
          page: 1,
          limit: 20,
          pages: 1
        }
      })
    })

    it('should handle service errors', async () => {
      // Configurar mocks
      mockReq.query = { page: '1', limit: '20' }
      const error = new Error('Service error')
      productService.listProducts.mockRejectedValue(error)

      // Ejecutar
      await productsController.getProducts(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Service error'
      })
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

    it('should return product by ID successfully', async () => {
      // Configurar mocks
      mockReq.params.id = '1'
      productService.getProductById.mockResolvedValue(mockProduct)

      // Ejecutar
      await productsController.getProductById(mockReq, mockRes)

      // Verificar
      expect(productService.getProductById).toHaveBeenCalledWith('1')
      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockProduct
      })
    })

    it('should return 404 if product not found', async () => {
      // Configurar mocks
      mockReq.params.id = '1'
      const error = new Error('Producto no encontrado')
      productService.getProductById.mockRejectedValue(error)

      // Ejecutar
      await productsController.getProductById(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Producto no encontrado'
      })
    })
  })

  describe('getProductByRef', () => {
    const mockProduct = {
      id: 1,
      name: 'Test Product',
      productRef: 'TEST-PROD-1',
      price: 1000,
      license_type: true,
      isActive: true
    }

    it('should return product by reference successfully', async () => {
      // Configurar mocks
      mockReq.params.productRef = 'TEST-PROD-1'
      productService.getProductByRef.mockResolvedValue(mockProduct)

      // Ejecutar
      await productsController.getProductByRef(mockReq, mockRes)

      // Verificar
      expect(productService.getProductByRef).toHaveBeenCalledWith('TEST-PROD-1')
      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: mockProduct
      })
    })

    it('should return 404 if product not found', async () => {
      // Configurar mocks
      mockReq.params.productRef = 'TEST-PROD-1'
      const error = new Error('Producto no encontrado')
      productService.getProductByRef.mockRejectedValue(error)

      // Ejecutar
      await productsController.getProductByRef(mockReq, mockRes)

      // Verificar
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Producto no encontrado'
      })
    })
  })
}) 