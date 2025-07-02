const { DataTypes } = require('sequelize')
const { sequelize } = require('./db')

/**
 * Modelo de Facturas
 * Almacena información de las facturas generadas por proveedores de facturación
 */
const Invoice = sequelize.define('Invoice', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // ID de la factura en el proveedor (Siigo)
  providerInvoiceId: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'provider_invoice_id',
    comment: 'ID de la factura en el proveedor de facturación'
  },
  
  // Número de la factura (número visible para el cliente)
  invoiceNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'invoice_number',
    comment: 'Número de la factura visible para el cliente'
  },
  
  // ID de la transacción interna del sistema
  transactionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'transaction_id',
    comment: 'ID de la transacción interna del sistema'
  },
  
  // Proveedor de facturación utilizado
  provider: {
    type: DataTypes.ENUM('siigo', 'mock'),
    allowNull: false,
    defaultValue: 'siigo',
    comment: 'Proveedor de facturación utilizado'
  },
  
  // Estado del envío de email
  emailSent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'email_sent',
    comment: 'Indica si el email de la factura fue enviado'
  },
  
  // Estado de aceptación por DIAN
  acceptedByDian: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'accepted_by_dian',
    comment: 'Indica si la factura fue aceptada por DIAN'
  },
  
  // ID del producto en el proveedor de facturación
  providerProductId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'provider_product_id',
    comment: 'ID del producto en el proveedor de facturación'
  },
  
  // ID del cliente en el proveedor de facturación
  providerCustomerId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'provider_customer_id',
    comment: 'ID del cliente en el proveedor de facturación'
  },
  
  // Fecha de creación de la factura en el proveedor
  providerCreatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'provider_created_at',
    comment: 'Fecha de creación de la factura en el proveedor'
  },
  
  // Metadatos adicionales de la factura
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Metadatos adicionales de la factura del proveedor'
  },
  
  // Mensaje de error si la facturación falló
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'error_message',
    comment: 'Mensaje de error si la facturación falló'
  },
  
  // Estado de la factura
  status: {
    type: DataTypes.ENUM('PENDING', 'GENERATED', 'SENT', 'ACCEPTED', 'REJECTED', 'FAILED'),
    allowNull: false,
    defaultValue: 'PENDING',
    comment: 'Estado actual de la factura'
  }
}, {
  tableName: 'invoices',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['transaction_id'],
      unique: true,
      name: 'invoices_transaction_id_unique'
    },
    {
      fields: ['provider_invoice_id', 'provider']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_at']
    }
  ]
})

module.exports = Invoice
