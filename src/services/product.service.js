const { Product, Discount } = require('../models')
const { Op } = require('sequelize')
const logger = require('../config/logger')
const TransactionManager = require('../utils/transactionManager')

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

  /**
   * Importar productos masivamente desde CSV
   * @param {Array} rows - Filas del CSV parseado
   * @param {number} adminId - ID del admin que realiza la operación
   * @returns {Promise<Object>} Resultado de la importación
   */
  async bulkImport (rows, adminId) {
    try {
      logger.logBusiness('bulkImportProducts.start', {
        rowCount: rows.length,
        adminId
      })

      // 1. Filtrar filas válidas (name, productRef y price no vacíos)
      const validRows = rows.filter(row => {
        return row.name &&
               row.name.trim() !== '' &&
               row.productRef &&
               row.productRef.trim() !== '' &&
               row.price &&
               row.price.toString().trim() !== ''
      })

      if (validRows.length === 0) {
        throw new Error('No se encontraron filas válidas. Todas las filas deben tener name, productRef y price.')
      }

      if (validRows.length !== rows.length) {
        const emptyRows = rows.length - validRows.length
        throw new Error(`${emptyRows} fila(s) tienen name, productRef o price vacíos`)
      }

      // 2. Verificar productRef no duplicados en el CSV
      const productRefs = validRows.map(row => row.productRef.trim())
      const uniqueRefs = [...new Set(productRefs)]

      if (uniqueRefs.length !== productRefs.length) {
        const duplicates = productRefs.filter((ref, index) => productRefs.indexOf(ref) !== index)
        throw new Error(`Referencias duplicadas en el CSV: ${[...new Set(duplicates)].join(', ')}`)
      }

      // 3. Verificar que no existan en la BD
      const existingProducts = await Product.findAll({
        where: { productRef: uniqueRefs },
        attributes: ['productRef']
      })

      if (existingProducts.length > 0) {
        const existingRefs = existingProducts.map(p => p.productRef)
        throw new Error(`Las siguientes referencias ya existen en la base de datos: ${existingRefs.join(', ')}`)
      }

      // 4. Validar y preparar datos
      const productsToCreate = validRows.map((row, index) => {
        // Validar price es número
        const price = parseInt(row.price, 10)
        if (isNaN(price) || price < 0) {
          throw new Error(`Fila ${index + 2}: El precio debe ser un número entero mayor o igual a 0`)
        }

        // Validar currency si está presente
        const validCurrencies = ['USD', 'EUR', 'COP', 'MXN']
        const currency = row.currency?.trim()?.toUpperCase() || 'COP'
        if (!validCurrencies.includes(currency)) {
          throw new Error(`Fila ${index + 2}: Moneda inválida '${row.currency}'. Use: ${validCurrencies.join(', ')}`)
        }

        // Parsear license_type
        let licenseType = false
        if (row.license_type) {
          const lt = row.license_type.toString().trim().toLowerCase()
          licenseType = lt === 'true' || lt === '1' || lt === 'yes' || lt === 'si'
        }

        // Validar image es URL si está presente
        if (row.image && row.image.trim() !== '') {
          try {
            const validatedUrl = new URL(row.image.trim())
            if (!['http:', 'https:'].includes(validatedUrl.protocol)) {
              throw new Error('Protocolo no válido')
            }
          } catch {
            throw new Error(`Fila ${index + 2}: La imagen debe ser una URL válida (http/https)`)
          }
        }

        return {
          name: row.name.trim(),
          productRef: row.productRef.trim(),
          price,
          currency,
          description: row.description?.trim() || null,
          features: row.features?.trim() || null,
          image: row.image?.trim() || null,
          provider: row.provider?.trim() || null,
          license_type: licenseType,
          isActive: true
        }
      })

      // 5. Crear productos en transacción atómica
      // individualHooks: true es necesario para que se ejecute el hook beforeValidate que genera el slug
      const createdProducts = await TransactionManager.executeBulkTransaction(async (t) => {
        const products = await Product.bulkCreate(productsToCreate, {
          transaction: t,
          returning: true,
          individualHooks: true
        })

        logger.logBusiness('bulkImportProducts.created', {
          count: products.length,
          adminId
        })

        return products
      })

      logger.logBusiness('bulkImportProducts.success', {
        imported: createdProducts.length,
        adminId
      })

      return {
        imported: createdProducts.length,
        products: createdProducts.map(p => ({
          id: p.id,
          name: p.name,
          productRef: p.productRef,
          price: p.price,
          currency: p.currency
        }))
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'bulkImportProducts',
        rowCount: rows.length,
        adminId
      })
      throw error
    }
  }
}

module.exports = new ProductService()
