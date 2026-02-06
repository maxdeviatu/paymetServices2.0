const jwt = require('jsonwebtoken')
const { JWT } = require('../config')
const { Admin, User } = require('../models')
const logger = require('../config/logger')

/**
 * Middleware de autenticación para administradores
 * Verifica el token JWT y adjunta el administrador al objeto req
 */
const authenticate = async (req, res, next) => {
  try {
    // DEBUG: Log de la petición entrante
    logger.debug('AUTH DEBUG [authenticate]:', {
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl,
      hasAuthHeader: !!req.headers.authorization,
      authHeaderPreview: req.headers.authorization ? req.headers.authorization.substring(0, 50) + '...' : 'NO HEADER',
      allHeaders: Object.keys(req.headers)
    })

    // Obtener el token del header
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.debug('AUTH DEBUG [authenticate]: Token no proporcionado o formato incorrecto', {
        authHeader: authHeader || 'undefined',
        startsWithBearer: authHeader ? authHeader.startsWith('Bearer ') : false
      })
      return res.status(401).json({
        success: false,
        message: 'Acceso no autorizado. Token no proporcionado.'
      })
    }

    // Verificar el token
    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT.secret)

    // Buscar el administrador en la BD
    const admin = await Admin.findByPk(decoded.id)
    if (!admin || !admin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Acceso no autorizado. Administrador no válido o inactivo.'
      })
    }

    // Adjuntar el administrador al objeto req
    req.user = {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      type: 'admin'
    }

    next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido o expirado.'
    })
  }
}

/**
 * Middleware de autenticación para usuarios (clientes)
 * Verifica el token JWT y adjunta el usuario al objeto req
 */
const authenticateUser = async (req, res, next) => {
  try {
    // DEBUG: Log de la petición entrante
    logger.debug('AUTH DEBUG [authenticateUser]:', {
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl,
      hasAuthHeader: !!req.headers.authorization,
      authHeaderPreview: req.headers.authorization ? req.headers.authorization.substring(0, 50) + '...' : 'NO HEADER'
    })

    // Obtener el token del header
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.debug('AUTH DEBUG [authenticateUser]: Token no proporcionado')
      return res.status(401).json({
        success: false,
        message: 'Acceso no autorizado. Token no proporcionado.'
      })
    }

    // Verificar el token
    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT.secret)

    logger.debug('AUTH DEBUG [authenticateUser]: Token decodificado', {
      decodedType: decoded.type,
      decodedId: decoded.id
    })

    // Verificar que sea un token de usuario
    if (decoded.type !== 'user') {
      logger.debug('AUTH DEBUG [authenticateUser]: Token NO es de usuario', {
        tokenType: decoded.type,
        expected: 'user'
      })
      return res.status(401).json({
        success: false,
        message: 'Acceso no autorizado. Token no válido para usuarios.'
      })
    }

    // Buscar el usuario en la BD
    const user = await User.findByPk(decoded.id)
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Acceso no autorizado. Usuario no válido.'
      })
    }

    // Adjuntar el usuario al objeto req
    req.user = {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      type: 'user'
    }

    next()
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido o expirado.'
    })
  }
}

/**
 * Middleware de autenticación flexible
 * Puede manejar tanto administradores como usuarios basándose en el token
 */
const authenticateAny = async (req, res, next) => {
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

    if (decoded.type === 'user') {
      // Es un usuario
      const user = await User.findByPk(decoded.id)
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Acceso no autorizado. Usuario no válido.'
        })
      }

      req.user = {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        type: 'user'
      }
    } else {
      // Es un administrador (comportamiento por defecto)
      const admin = await Admin.findByPk(decoded.id)
      if (!admin || !admin.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Acceso no autorizado. Administrador no válido o inactivo.'
        })
      }

      req.user = {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        type: 'admin'
      }
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
  authenticate,
  authenticateUser,
  authenticateAny
}
