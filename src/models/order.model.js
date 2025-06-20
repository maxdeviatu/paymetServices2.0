const { DataTypes } = require('sequelize')
const { sequelize } = require('./db')

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  productRef: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'products',
      key: 'product_ref'
    }
  },
  qty: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1
    }
  },
  subtotal: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Amount in minor units (cents)'
  },
  discountTotal: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Discount amount in minor units'
  },
  taxTotal: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Tax amount in minor units'
  },
  grandTotal: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Final amount in minor units'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'IN_PROCESS', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELED'),
    defaultValue: 'PENDING'
  },
  shippingInfo: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Optional shipping information for physical goods'
  }
}, {
  tableName: 'orders',
  underscored: true,
  indexes: [
    {
      fields: ['customer_id']
    },
    {
      fields: ['product_ref']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_at']
    }
  ]
})

module.exports = Order
