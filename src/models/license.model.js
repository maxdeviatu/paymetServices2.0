const { DataTypes } = require('sequelize')
const { sequelize } = require('./db')

const License = sequelize.define('License', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  productRef: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'products',
      key: 'product_ref'
    }
  },
  licenseKey: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  instructions: {
    type: DataTypes.TEXT
  },
  status: {
    type: DataTypes.ENUM('AVAILABLE', 'RESERVED', 'SOLD', 'ANNULLED', 'RETURNED'),
    defaultValue: 'AVAILABLE'
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  reservedAt: {
    type: DataTypes.DATE
  },
  soldAt: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'licenses',
  underscored: true
})

module.exports = License
