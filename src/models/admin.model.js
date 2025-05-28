const { DataTypes } = require('sequelize')
const { sequelize } = require('./db')
const bcrypt = require('bcryptjs')

// Definir los valores del ENUM
const ADMIN_ROLES = ['READ_ONLY', 'EDITOR', 'SUPER_ADMIN']

const Admin = sequelize.define('Admin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'READ_ONLY',
    validate: {
      isIn: [ADMIN_ROLES]
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  hooks: {
    beforeCreate: async (admin) => {
      if (admin.passwordHash) {
        admin.passwordHash = await bcrypt.hash(admin.passwordHash, 10)
      }
    },
    beforeUpdate: async (admin) => {
      // Solo hashear la contraseña si ha sido modificada
      if (admin.changed('passwordHash')) {
        admin.passwordHash = await bcrypt.hash(admin.passwordHash, 10)
      }
    }
  }
})

// Método para validar contraseña
Admin.prototype.validatePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash)
}

// Exportar también los roles para uso en otras partes de la aplicación
module.exports = {
  Admin,
  ADMIN_ROLES
}
