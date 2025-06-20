const { DataTypes } = require('sequelize')
const { sequelize } = require('./db')

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  gateway: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Payment provider: mock, epayco, cobre, etc.'
  },
  gatewayRef: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'External payment reference from gateway'
  },
  amount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Transaction amount in minor units (cents)'
  },
  currency: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'USD',
    validate: {
      isIn: [['USD', 'EUR', 'COP', 'MXN']]
    }
  },
  paymentMethod: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'card, bank_transfer, pse, etc.'
  },
  status: {
    type: DataTypes.ENUM('CREATED', 'PENDING', 'PAID', 'SETTLED', 'REFUNDED', 'REVERSED', 'FAILED'),
    defaultValue: 'CREATED'
  },
  invoiceStatus: {
    type: DataTypes.STRING,
    defaultValue: 'NOT_REQUIRED',
    comment: 'Invoice generation status'
  },
  meta: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Additional gateway-specific metadata'
  }
}, {
  tableName: 'transactions',
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['gateway', 'gateway_ref'],
      name: 'unique_gateway_ref'
    },
    {
      fields: ['order_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['gateway']
    },
    {
      fields: ['created_at']
    }
  ]
})

module.exports = Transaction
