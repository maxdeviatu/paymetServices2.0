const productService = require('../services/product.service')

/**
 * Controlador para la gestión de productos
 */
class ProductsController {
  /**
   * Crear un nuevo producto
   */
  async createProduct(req, res) {
    try {
      const product = await productService.createProduct(req.body)
      
      return res.status(201).json({
        success: true,
        data: product,
        message: 'Producto creado exitosamente'
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Obtener todos los productos (público, solo activos)
   */
  async getProducts(req, res) {
    try {
      const page = parseInt(req.query.page) || 1
      const limit = parseInt(req.query.limit) || 20
      
      const result = await productService.listProducts({
        includeInactive: false,
        page,
        limit
      })
      
      return res.status(200).json({
        success: true,
        data: result.products,
        pagination: result.pagination
      })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Obtener todos los productos (admin, incluye inactivos)
   */
  async getAllProducts(req, res) {
    try {
      const page = parseInt(req.query.page) || 1
      const limit = parseInt(req.query.limit) || 20
      
      const result = await productService.listProducts({
        includeInactive: true,
        page,
        limit
      })
      
      return res.status(200).json({
        success: true,
        data: result.products,
        pagination: result.pagination
      })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Obtener un producto por ID
   */
  async getProductById(req, res) {
    try {
      const { id } = req.params
      const product = await productService.getProductById(id)
      
      return res.status(200).json({
        success: true,
        data: product
      })
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Obtener un producto por referencia
   */
  async getProductByRef(req, res) {
    try {
      const { productRef } = req.params
      const product = await productService.getProductByRef(productRef)
      
      return res.status(200).json({
        success: true,
        data: product
      })
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Actualizar un producto
   */
  async updateProduct(req, res) {
    try {
      const { id } = req.params
      const product = await productService.updateProduct(id, req.body)
      
      return res.status(200).json({
        success: true,
        data: product,
        message: 'Producto actualizado exitosamente'
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Cambiar el estado de un producto (activo/inactivo)
   */
  async toggleProductStatus(req, res) {
    try {
      const { id } = req.params
      const product = await productService.toggleProductStatus(id)
      
      return res.status(200).json({
        success: true,
        data: product,
        message: `Producto ${product.isActive ? 'activado' : 'desactivado'} exitosamente`
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Asignar o actualizar un descuento a un producto
   */
  async updateProductDiscount(req, res) {
    try {
      const { id } = req.params
      const { discountId } = req.body
      
      const product = await productService.updateProductDiscount(id, discountId)
      
      return res.status(200).json({
        success: true,
        data: product,
        message: discountId 
          ? 'Descuento asignado exitosamente' 
          : 'Descuento removido exitosamente'
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Eliminar un producto
   */
  async deleteProduct(req, res) {
    try {
      const { id } = req.params
      await productService.deleteProduct(id)
      
      return res.status(200).json({
        success: true,
        message: 'Producto eliminado exitosamente'
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }
}

module.exports = new ProductsController()
