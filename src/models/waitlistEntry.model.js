const { DataTypes } = require('sequelize')
const { sequelize } = require('./db')

const WaitlistEntry = sequelize.define('WaitlistEntry', {
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
    defaultValue: 1,
    validate: {
      min: 1
    }
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'RESERVED', 'PROCESSING', 'COMPLETED', 'FAILED'),
    defaultValue: 'PENDING',
    comment: 'Estado del procesamiento de la lista de espera'
  },
  priority: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Fecha de llegada para ordenar por FIFO'
  },
  licenseId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Licencia asignada cuando se procesa'
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Mensaje de error si falla el procesamiento'
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Fecha cuando se completó el procesamiento'
  },
  retryCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Número de intentos de procesamiento'
  }
}, {
  tableName: 'waitlist_entries',
  underscored: true,
  indexes: [
    {
      fields: ['order_id'],
      unique: true,
      name: 'unique_order_waitlist'
    },
    {
      fields: ['product_ref']
    },
    {
      fields: ['status']
    },
    {
      fields: ['priority']
    },
    {
      fields: ['customer_id']
    },
    {
      fields: ['created_at']
    }
  ]
})

module.exports = WaitlistEntry 