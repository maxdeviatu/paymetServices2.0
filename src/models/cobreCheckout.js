const { Model, DataTypes } = require('sequelize')
const { sequelize } = require('./db')

class CobreCheckout extends Model {}

CobreCheckout.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  transactionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'transactions',
      key: 'id'
    }
  },
  checkoutId: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'ID del checkout en Cobre (chk_xxx)'
  },
  checkoutUrl: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'URL del checkout de Cobre'
  },
  amount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Monto en centavos'
  },
  currency: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'USD'
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'PENDING',
    comment: 'Estado del checkout (PENDING, PAID, EXPIRED, CANCELLED)'
  },
  validUntil: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Fecha de expiración del checkout'
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Datos adicionales del checkout'
  }
}, {
  sequelize,
  modelName: 'CobreCheckout',
  tableName: 'cobre_checkouts',
  timestamps: true
})

module.exports = CobreCheckout
