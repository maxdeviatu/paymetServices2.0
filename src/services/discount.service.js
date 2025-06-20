const { Discount, Product } = require('../models')
const { Op } = require('sequelize')
const logger = require('../config/logger')

/**
 * Servicio para la gestión de descuentos
 */
class DiscountService {
  /**
   * Crear un nuevo descuento
   * @param {Object} discountData - Datos del descuento
   * @returns {Promise<Discount>} Descuento creado
   */
  async createDiscount (discountData) {
    try {
      logger.logBusiness('createDiscount', {
        name: discountData.name,
        amount: discountData.amount,
        startDate: discountData.startDate,
        endDate: discountData.endDate
      })

      // Validar fechas
      if (new Date(discountData.startDate) >= new Date(discountData.endDate)) {
        const error = new Error('La fecha de inicio debe ser anterior a la fecha de fin')
        logger.logError(error, {
          startDate: discountData.startDate,
          endDate: discountData.endDate
        })
        throw error
      }

      const discount = await Discount.create(discountData)
      logger.logBusiness('createDiscount.success', {
        id: discount.id,
        name: discount.name
      })
      return discount
    } catch (error) {
      logger.logError(error, {
        operation: 'createDiscount',
        discountData
      })
      throw error
    }
  }

  /**
   * Obtener un descuento por ID
   * @param {number} id - ID del descuento
   * @returns {Promise<Discount>} Descuento encontrado
   */
  async getDiscountById (id) {
    try {
      logger.logBusiness('getDiscountById', { id })

      const discount = await Discount.findByPk(id, {
        include: [{ model: Product, as: 'products' }]
      })

      if (!discount) {
        const error = new Error(`Descuento con ID ${id} no encontrado`)
        logger.logError(error, { id })
        throw error
      }

      logger.logBusiness('getDiscountById.success', {
        id: discount.id,
        name: discount.name
      })
      return discount
    } catch (error) {
      logger.logError(error, { operation: 'getDiscountById', id })
      throw error
    }
  }

  /**
   * Listar descuentos con paginación
   * @param {Object} options - Opciones de filtrado y paginación
   * @param {boolean} options.onlyActive - Solo descuentos activos
   * @param {boolean} options.onlyValid - Solo descuentos vigentes
   * @param {number} options.page - Número de página
   * @param {number} options.limit - Límite de resultados por página
   * @returns {Promise<Object>} Objeto con descuentos y metadatos de paginación
   */
  async listDiscounts ({ onlyActive = false, onlyValid = false, page = 1, limit = 20 }) {
    try {
      logger.logBusiness('listDiscounts', { onlyActive, onlyValid, page, limit })

      const offset = (page - 1) * limit
      let where = {}

      if (onlyActive) {
        where.isActive = true
      }

      if (onlyValid) {
        const today = new Date()
        where = {
          ...where,
          startDate: { [Op.lte]: today },
          endDate: { [Op.gte]: today }
        }
      }

      const { count, rows } = await Discount.findAndCountAll({
        where,
        include: [{ model: Product, as: 'products' }],
        offset,
        limit,
        order: [['createdAt', 'DESC']]
      })

      logger.logBusiness('listDiscounts.success', {
        total: count,
        page,
        limit,
        returned: rows.length
      })

      return {
        discounts: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      }
    } catch (error) {
      logger.logError(error, {
        operation: 'listDiscounts',
        onlyActive,
        onlyValid,
        page,
        limit
      })
      throw error
    }
  }

  /**
   * Actualizar un descuento
   * @param {number} id - ID del descuento
   * @param {Object} discountData - Datos a actualizar
   * @returns {Promise<Discount>} Descuento actualizado
   */
  async updateDiscount (id, discountData) {
    try {
      logger.logBusiness('updateDiscount', { id, discountData })

      const discount = await this.getDiscountById(id)

      // Si se están actualizando las fechas, validar
      if (discountData.startDate || discountData.endDate) {
        const startDate = new Date(discountData.startDate || discount.startDate)
        const endDate = new Date(discountData.endDate || discount.endDate)

        if (startDate >= endDate) {
          const error = new Error('La fecha de inicio debe ser anterior a la fecha de fin')
          logger.logError(error, {
            startDate,
            endDate
          })
          throw error
        }
      }

      await discount.update(discountData)
      logger.logBusiness('updateDiscount.success', {
        id: discount.id,
        name: discount.name
      })
      return discount
    } catch (error) {
      logger.logError(error, {
        operation: 'updateDiscount',
        id,
        discountData
      })
      throw error
    }
  }

  /**
   * Cambiar el estado de un descuento (activo/inactivo)
   * @param {number} id - ID del descuento
   * @returns {Promise<Discount>} Descuento actualizado
   */
  async toggleDiscountStatus (id) {
    try {
      logger.logBusiness('toggleDiscountStatus', { id })

      const discount = await this.getDiscountById(id)
      await discount.update({ isActive: !discount.isActive })

      // Si el descuento se desactiva, quitar la asociación de todos los productos
      if (!discount.isActive) {
        await Product.update(
          { hasDiscount: false, discountId: null },
          { where: { discountId: id } }
        )
      }

      logger.logBusiness('toggleDiscountStatus.success', {
        id: discount.id,
        name: discount.name,
        isActive: discount.isActive
      })
      return discount
    } catch (error) {
      logger.logError(error, { operation: 'toggleDiscountStatus', id })
      throw error
    }
  }

  /**
   * Verificar si un descuento está vigente y activo
   * @param {number} id - ID del descuento
   * @returns {Promise<boolean>} true si el descuento está vigente y activo
   */
  async isDiscountValidAndActive (id) {
    const today = new Date()
    const discount = await Discount.findOne({
      where: {
        id,
        isActive: true,
        startDate: { [Op.lte]: today },
        endDate: { [Op.gte]: today }
      }
    })

    return !!discount
  }

  /**
   * Eliminar un descuento
   * @param {number} id - ID del descuento
   * @returns {Promise<boolean>} true si se eliminó correctamente
   */
  async deleteDiscount (id) {
    try {
      logger.logBusiness('deleteDiscount', { id })

      const discount = await this.getDiscountById(id)
      await discount.destroy()

      logger.logBusiness('deleteDiscount.success', { id })
      return true
    } catch (error) {
      logger.logError(error, { operation: 'deleteDiscount', id })
      throw error
    }
  }
}

module.exports = new DiscountService()
