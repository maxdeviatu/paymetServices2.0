const { Product, Discount } = require('../models')
const { Op } = require('sequelize')
const logger = require('../config/logger')

/**
 * Servicio para la gestión de productos
 */
class ProductService {
  /**
   * Crear un nuevo producto
   * @param {Object} productData - Datos del producto
   * @returns {Promise<Product>} Producto creado
   */
  async createProduct (productData) {
    try {
      logger.logBusiness('createProduct', {
        name: productData.name,
        productRef: productData.productRef
      })

      // Verificar si ya existe un producto con la misma referencia
      const existingProduct = await Product.findOne({
        where: { productRef: productData.productRef }
      })

      if (existingProduct) {
        const error = new Error(`Ya existe un producto con la referencia ${productData.productRef}`)
        logger.logError(error, { productRef: productData.productRef })
        throw error
      }

      // Crear el producto
      const product = await Product.create(productData)
      logger.logBusiness('createProduct.success', {
        id: product.id,
        name: product.name,
        productRef: product.productRef
      })
      return product
    } catch (error) {
      logger.logError(error, {
        operation: 'createProduct',
        productRef: productData.productRef
      })
      throw error
    }
  }

  /**
   * Obtener un producto por ID
   * @param {number} id - ID del producto
   * @param {boolean} includeInactive - Incluir productos inactivos
   * @returns {Promise<Product>} Producto encontrado
   */
  async getProductById (id, includeInactive = false) {
    const where = { id }

    if (!includeInactive) {
      where.isActive = true
    }

    const product = await Product.findOne({
      where,
      include: [
        { model: Discount, as: 'discount' }
      ]
    })

    if (!product) {
      throw new Error('Producto no encontrado')
    }

    return product
  }

  /**
   * Obtener un producto por referencia
   * @param {string} productRef - Referencia del producto
   * @param {boolean} includeInactive - Incluir productos inactivos
   * @returns {Promise<Product>} Producto encontrado
   */
  async getProductByRef (productRef, includeInactive = false) {
    const where = { productRef }

    if (!includeInactive) {
      where.isActive = true
    }

    const product = await Product.findOne({
      where,
      include: [
        { model: Discount, as: 'discount' }
      ]
    })

    if (!product) {
      throw new Error('Producto no encontrado')
    }

    return product
  }

  /**
   * Listar productos con paginación
   * @param {Object} options - Opciones de filtrado y paginación
   * @param {boolean} options.includeInactive - Incluir productos inactivos
   * @param {number} options.page - Número de página
   * @param {number} options.limit - Límite de resultados por página
   * @returns {Promise<Object>} Objeto con productos y metadatos de paginación
   */
  async listProducts ({ includeInactive = false, page = 1, limit = 20 }) {
    try {
      logger.logBusiness('listProducts', { includeInactive, page, limit })

      // Limitar a 100 como máximo si es público
      if (!includeInactive && limit > 100) {
        limit = 100
      }

      const offset = (page - 1) * limit
      const where = includeInactive ? {} : { isActive: true }

      const { count, rows } = await Product.findAndCountAll({
        where,
        include: [
          { model: Discount, as: 'discount' }
        ],
        offset,
        limit,
        order: [['createdAt', 'DESC']]
      })

      logger.logBusiness('listProducts.success', {
        total: count,
        page,
        limit,
        returned: rows.length
      })

      return {
        products: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'listProducts',
        includeInactive,
        page,
        limit
      })
      throw error
    }
  }

  /**
   * Actualizar un producto
   * @param {number} id - ID del producto
   * @param {Object} productData - Datos a actualizar
   * @returns {Promise<Product>} Producto actualizado
   */
  async updateProduct (id, productData) {
    const product = await this.getProductById(id, true)

    // Si se está cambiando la referencia, verificar que no exista otra igual
    if (productData.productRef && productData.productRef !== product.productRef) {
      const existingProduct = await Product.findOne({
        where: {
          productRef: productData.productRef,
          id: { [Op.ne]: id }
        }
      })

      if (existingProduct) {
        throw new Error(`Ya existe un producto con la referencia ${productData.productRef}`)
      }
    }

    // Actualizar el producto
    const updatedProduct = await product.update(productData)
    return updatedProduct
  }

  /**
   * Cambiar el estado de un producto (activo/inactivo)
   * @param {number} id - ID del producto
   * @returns {Promise<Product>} Producto actualizado
   */
  async toggleProductStatus (id) {
    const product = await this.getProductById(id, true)
    await product.update({ isActive: !product.isActive })
    return product
  }

  /**
   * Asignar o actualizar un descuento a un producto
   * @param {number} id - ID del producto
   * @param {number} discountId - ID del descuento
   * @returns {Promise<Product>} Producto actualizado
   */
  async updateProductDiscount (id, discountId) {
    const product = await this.getProductById(id, true)

    // Si discountId es null, eliminar el descuento
    if (discountId === null) {
      await product.update({
        discountId: null,
        hasDiscount: false
      })
      return product
    }

    // Verificar que el descuento existe y está activo
    const discount = await Discount.findOne({
      where: {
        id: discountId,
        isActive: true,
        startDate: { [Op.lte]: new Date() },
        endDate: { [Op.gte]: new Date() }
      }
    })

    if (!discount) {
      throw new Error('El descuento no existe, no está activo o no está vigente')
    }

    // Asignar el descuento al producto
    await product.update({
      discountId,
      hasDiscount: true
    })

    return this.getProductById(id, true)
  }

  /**
   * Eliminar un producto
   * @param {number} id - ID del producto
   * @returns {Promise<boolean>} true si se eliminó correctamente
   */
  async deleteProduct (id) {
    const product = await this.getProductById(id, true)
    await product.destroy()
    return true
  }
}

module.exports = new ProductService()
