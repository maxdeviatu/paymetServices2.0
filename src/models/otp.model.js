const { DataTypes } = require('sequelize')
const { sequelize } = require('./db')

const OtpCode = sequelize.define('OtpCode', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING(120),
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  code: {
    type: DataTypes.STRING(6),
    allowNull: false,
    validate: {
      isNumeric: true,
      len: [6, 6]
    }
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  used: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  indexes: [
    // Índice para búsquedas por email y código
    {
      fields: ['email', 'code']
    },
    // Índice para búsquedas por email
    {
      fields: ['email']
    }
  ]
})

module.exports = OtpCode 