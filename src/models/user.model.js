const { DataTypes } = require('sequelize')
const { sequelize } = require('./db')

// Definir los valores del ENUM para tipo de documento
const DOCUMENT_TYPES = ['CC', 'CE', 'PASSPORT', 'PE']

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  first_name: {
    type: DataTypes.STRING(80),
    allowNull: false
  },
  last_name: {
    type: DataTypes.STRING(80),
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Incluye indicativo de país'
  },
  email: {
    type: DataTypes.STRING(120),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  document_type: {
    type: DataTypes.ENUM,
    values: DOCUMENT_TYPES,
    allowNull: false
  },
  document_number: {
    type: DataTypes.STRING(30),
    allowNull: false
  },
  birth_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  consent_accepted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  indexes: [
    // Índice único compuesto para documento
    {
      unique: true,
      fields: ['document_type', 'document_number']
    }
  ]
})

// Exportar también los tipos de documento para uso en otras partes de la aplicación
module.exports = {
  User,
  DOCUMENT_TYPES
}
