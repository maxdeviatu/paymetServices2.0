const Product = require('./product.model')
const Discount = require('./discount.model')
const { Admin } = require('./admin.model')
const { User, DOCUMENT_TYPES } = require('./user.model')
const OtpCode = require('./otp.model')
const License = require('./license.model')
const Order = require('./order.model')
const Transaction = require('./transaction.model')
const CobreCheckout = require('./cobreCheckout')
const WebhookEvent = require('./webhookEvent.model')
const WaitlistEntry = require('./waitlistEntry.model')
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

// WaitlistEntry associations
WaitlistEntry.belongsTo(Order, {
  foreignKey: 'orderId',
  as: 'order'
})
WaitlistEntry.belongsTo(User, {
  foreignKey: 'customerId',
  as: 'customer'
})
WaitlistEntry.belongsTo(Product, {
  foreignKey: 'productRef',
  targetKey: 'productRef',
  as: 'product'
})
WaitlistEntry.belongsTo(License, {
  foreignKey: 'licenseId',
  as: 'license',
  allowNull: true
})

// License-WaitlistEntry relationship (removed to avoid circular dependency)
// License.belongsTo(WaitlistEntry, {
//   foreignKey: 'waitlistEntryId',
//   as: 'waitlistEntry',
//   allowNull: true
// })

// Order-WaitlistEntry relationship
Order.hasOne(WaitlistEntry, {
  foreignKey: 'orderId',
  as: 'waitlistEntry'
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
  WebhookEvent,
  WaitlistEntry,
  DOCUMENT_TYPES,
  initDB,
  sequelize
}
