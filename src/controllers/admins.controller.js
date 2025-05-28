const adminService = require('../services/admin.service')

/**
 * Controlador para la gestión de administradores
 */
class AdminsController {
  /**
   * Autenticar un administrador
   */
  async login(req, res) {
    try {
      const { email, password } = req.body
      const result = await adminService.login(email, password)
      
      return res.status(200).json({
        success: true,
        data: result,
        message: 'Autenticación exitosa'
      })
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Crear un nuevo administrador
   */
  async createAdmin(req, res) {
    try {
      const admin = await adminService.createAdmin(req.body)
      
      // Excluir passwordHash de la respuesta
      const adminData = admin.toJSON()
      delete adminData.passwordHash
      
      return res.status(201).json({
        success: true,
        data: adminData,
        message: 'Administrador creado exitosamente'
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Obtener todos los administradores
   */
  async getAdmins(req, res) {
    try {
      const page = parseInt(req.query.page) || 1
      const limit = parseInt(req.query.limit) || 20
      const onlyActive = req.query.active === 'true'
      
      const result = await adminService.listAdmins({
        onlyActive,
        page,
        limit
      })
      
      return res.status(200).json({
        success: true,
        data: result.admins,
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
   * Obtener un administrador por ID
   */
  async getAdminById(req, res) {
    try {
      const { id } = req.params
      const admin = await adminService.getAdminById(id)
      
      // Excluir passwordHash de la respuesta
      const adminData = admin.toJSON()
      delete adminData.passwordHash
      
      return res.status(200).json({
        success: true,
        data: adminData
      })
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Actualizar un administrador
   */
  async updateAdmin(req, res) {
    try {
      const { id } = req.params
      const admin = await adminService.updateAdmin(id, req.body)
      
      return res.status(200).json({
        success: true,
        data: admin,
        message: 'Administrador actualizado exitosamente'
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Restablecer contraseña de un administrador
   */
  async resetPassword(req, res) {
    try {
      const { id } = req.params
      const { newPassword } = req.body
      
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'La nueva contraseña debe tener al menos 6 caracteres'
        })
      }
      
      await adminService.resetPassword(id, newPassword)
      
      return res.status(200).json({
        success: true,
        message: 'Contraseña restablecida exitosamente'
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }

  /**
   * Eliminar un administrador
   */
  async deleteAdmin(req, res) {
    try {
      const { id } = req.params
      
      // No permitir que un admin se elimine a sí mismo
      if (req.user.id.toString() === id) {
        return res.status(400).json({
          success: false,
          message: 'No puedes eliminar tu propia cuenta de administrador'
        })
      }
      
      await adminService.deleteAdmin(id)
      
      return res.status(200).json({
        success: true,
        message: 'Administrador eliminado exitosamente'
      })
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      })
    }
  }
}

module.exports = new AdminsController()
