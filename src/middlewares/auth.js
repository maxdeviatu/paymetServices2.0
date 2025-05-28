const jwt = require('jsonwebtoken')
const { JWT } = require('../config')
const { Admin } = require('../models/admin.model')

/**
 * Middleware de autenticación
 * Verifica el token JWT y adjunta el usuario al objeto req
 */
const authenticate = async (req, res, next) => {
  try {
    // Obtener el token del header
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Acceso no autorizado. Token no proporcionado.'
      })
    }

    // Verificar el token
    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT.secret)

    // Buscar el usuario en la BD
    const admin = await Admin.findByPk(decoded.id)
    if (!admin || !admin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Acceso no autorizado. Usuario no válido o inactivo.'
      })
    }

    // Adjuntar el usuario al objeto req
    req.user = {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role
    }

    next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido o expirado.'
    })
  }
}

module.exports = {
  authenticate
}
