const Product = require('./product.model')
const Discount = require('./discount.model')
const { Admin } = require('./admin.model')
const { User, DOCUMENT_TYPES } = require('./user.model')
const OtpCode = require('./otp.model')
const License = require('./license.model')
const Order = require('./order.model')
const Transaction = require('./transaction.model')
const CobreCheckout = require('./cobreCheckout')
const { initDB, sequelize } = require('./db')

// Establecer relaciones entre modelos
Product.belongsTo(Discount, { foreignKey: 'discountId', as: 'discount' })
Discount.hasMany(Product, { foreignKey: 'discountId', as: 'products' })

// License associations
License.belongsTo(Product, { 
  foreignKey: 'productRef', 
  targetKey: 'productRef',
  as: 'Product'
})
Product.hasMany(License, { 
  foreignKey: 'productRef', 
  sourceKey: 'productRef',
  as: 'licenses'
})

// Order associations
Order.belongsTo(User, { 
  foreignKey: 'customerId', 
  as: 'customer'
})
Order.belongsTo(Product, { 
  foreignKey: 'productRef', 
  targetKey: 'productRef',
  as: 'product'
})
User.hasMany(Order, { 
  foreignKey: 'customerId', 
  as: 'orders'
})
Product.hasMany(Order, { 
  foreignKey: 'productRef', 
  sourceKey: 'productRef',
  as: 'orders'
})

// Transaction associations
Transaction.belongsTo(Order, { 
  foreignKey: 'orderId', 
  as: 'order'
})
Order.hasMany(Transaction, { 
  foreignKey: 'orderId', 
  as: 'transactions'
})

// License-Order relationship (for fulfillment tracking)
License.belongsTo(Order, {
  foreignKey: 'orderId',
  as: 'order',
  allowNull: true
})

// CobreCheckout associations
CobreCheckout.belongsTo(Transaction, {
  foreignKey: 'transactionId',
  as: 'transaction'
})
Transaction.hasOne(CobreCheckout, {
  foreignKey: 'transactionId',
  as: 'cobreCheckout'
})

module.exports = {
  Product,
  Discount,
  Admin,
  User,
  OtpCode,
  License,
  Order,
  Transaction,
  CobreCheckout,
  DOCUMENT_TYPES,
  initDB,
  sequelize
}
