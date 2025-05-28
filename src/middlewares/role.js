/**
 * Middleware para verificar roles de usuario
 * Los roles son jerárquicos: SUPER_ADMIN > EDITOR > READ_ONLY
 */

// Mapeo de roles a nivel de jerarquía
const ROLE_HIERARCHY = {
  'READ_ONLY': 1,
  'EDITOR': 2,
  'SUPER_ADMIN': 3
}

/**
 * Middleware para validar rol mínimo requerido
 * @param {string} minRole - Rol mínimo requerido (READ_ONLY, EDITOR, SUPER_ADMIN)
 */
const requireRole = (minRole) => {
  return (req, res, next) => {
    // Verificar que el usuario esté autenticado
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      })
    }

    const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0
    const requiredRoleLevel = ROLE_HIERARCHY[minRole] || 0

    // Verificar si el usuario tiene un rol con nivel suficiente
    if (userRoleLevel < requiredRoleLevel) {
      return res.status(403).json({
        success: false,
        message: `Acceso denegado. Se requiere rol ${minRole} o superior.`
      })
    }

    next()
  }
}

module.exports = {
  requireRole
}
