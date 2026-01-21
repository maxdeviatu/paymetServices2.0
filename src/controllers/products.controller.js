const productService = require('../services/product.service')
const logger = require('../config/logger')

/**
 * Controlador para la gestión de productos
 */
class ProductsController {
  /**
   * Crear un nuevo producto
   */
  async createProduct (req, res) {
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
  async getProducts (req, res) {
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
  async getAllProducts (req, res) {
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
  async getProductById (req, res) {
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
  async getProductByRef (req, res) {
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
  async updateProduct (req, res) {
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
  async toggleProductStatus (req, res) {
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
  async updateProductDiscount (req, res) {
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
  async deleteProduct (req, res) {
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

  /**
   * Carga masiva de productos desde CSV
   * Columnas requeridas: name, productRef, price
   * Columnas opcionales: currency, description, features, image, provider, license_type
   */
  async bulkUpload (req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere un archivo CSV'
        })
      }

      // Parsear CSV usando csv-parse/sync
      const csv = require('csv-parse/sync')
      const csvContent = req.file.buffer.toString('utf8')

      let rows
      try {
        rows = csv.parse(csvContent, {
          columns: true,
          trim: true,
          skip_empty_lines: true
        })
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: `Error al parsear el CSV: ${parseError.message}`
        })
      }

      if (rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'El archivo CSV está vacío o no tiene datos válidos'
        })
      }

      // Validar columnas requeridas
      const requiredColumns = ['name', 'productRef', 'price']
      const firstRow = rows[0]
      const missingColumns = requiredColumns.filter(col => !(col in firstRow))

      if (missingColumns.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Columnas requeridas faltantes: ${missingColumns.join(', ')}`
        })
      }

      // Llamar al servicio para importar
      const result = await productService.bulkImport(rows, req.admin?.id)

      logger.logBusiness('bulkUploadProducts.success', {
        adminId: req.admin?.id,
        filename: req.file.originalname,
        imported: result.imported,
        total: rows.length
      })

      return res.status(201).json({
        success: true,
        message: `Se importaron ${result.imported} productos exitosamente`,
        data: {
          imported: result.imported,
          total: rows.length,
          products: result.products
        }
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'bulkUploadProducts',
        filename: req.file?.originalname
      })

      return res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }
}

module.exports = new ProductsController()
