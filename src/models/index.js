const Product = require('./product.model')
const Discount = require('./discount.model')
const { Admin } = require('./admin.model')
const { User, DOCUMENT_TYPES } = require('./user.model')
const OtpCode = require('./otp.model')
const License = require('./license.model')
const { initDB } = require('./db')

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

module.exports = {
  Product,
  Discount,
  Admin,
  User,
  OtpCode,
  License,
  DOCUMENT_TYPES,
  initDB
}
