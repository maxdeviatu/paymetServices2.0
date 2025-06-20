const { Model, DataTypes, Op } = require('sequelize')
const { sequelize } = require('./db')

class WebhookEvent extends Model {}

WebhookEvent.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  eventId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'ID global del proveedor (ev_xxx) - opcional'
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Proveedor de pago: cobre, mock, etc.'
  },
  externalRef: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Referencia externa del proveedor (checkout_id, uniqueTransactionId, etc.)'
  },
  eventType: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Tipo de evento: payment, balance_credit, refund, etc.'
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Estado del evento: PENDING, PAID, FAILED'
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
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Fecha de procesamiento'
  },
  payload: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: 'Payload completo del webhook'
  },
  rawHeaders: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Headers originales del webhook'
  },
  rawBody: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Body original del webhook (para logs/firma)'
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Mensaje de error si falló el procesamiento'
  }
}, {
  sequelize,
  modelName: 'WebhookEvent',
  tableName: 'webhook_events',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['event_id', 'provider'],
      where: {
        event_id: {
          [Op.ne]: null
        }
      }
    },
    {
      unique: true,
      fields: ['provider', 'external_ref']
    },
    {
      fields: ['provider', 'processed_at']
    }
  ]
})

module.exports = WebhookEvent
