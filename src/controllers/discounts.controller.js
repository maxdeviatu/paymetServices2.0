const discountService = require('../services/discount.service')

/**
 * Controlador para la gestión de descuentos
 */
class DiscountsController {
  /**
   * Crear un nuevo descuento
   */
  async createDiscount (req, res) {
    try {
      const discount = await discountService.createDiscount(req.body)

      return res.status(201).json({
        success: true,
        data: discount,
        message: 'Descuento creado exitosamente'
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Obtener todos los descuentos
   */
  async getDiscounts (req, res) {
    try {
      const page = parseInt(req.query.page) || 1
      const limit = parseInt(req.query.limit) || 20
      const onlyActive = req.query.active === 'true'
      const onlyValid = req.query.valid === 'true'

      const result = await discountService.listDiscounts({
        onlyActive,
        onlyValid,
        page,
        limit
      })

      return res.status(200).json({
        success: true,
        data: result.discounts,
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
   * Obtener un descuento por ID
   */
  async getDiscountById (req, res) {
    try {
      const { id } = req.params
      const discount = await discountService.getDiscountById(id)

      return res.status(200).json({
        success: true,
        data: discount
      })
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Actualizar un descuento
   */
  async updateDiscount (req, res) {
    try {
      const { id } = req.params
      const discount = await discountService.updateDiscount(id, req.body)

      return res.status(200).json({
        success: true,
        data: discount,
        message: 'Descuento actualizado exitosamente'
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Cambiar el estado de un descuento (activo/inactivo)
   */
  async toggleDiscountStatus (req, res) {
    try {
      const { id } = req.params
      const discount = await discountService.toggleDiscountStatus(id)

      return res.status(200).json({
        success: true,
        data: discount,
        message: `Descuento ${discount.isActive ? 'activado' : 'desactivado'} exitosamente`
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }
}

module.exports = new DiscountsController()
