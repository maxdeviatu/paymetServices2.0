const Product = require('./product.model')
const Discount = require('./discount.model')
const { Admin } = require('./admin.model')
const { initDB } = require('./db')

// Establecer relaciones entre modelos
Product.belongsTo(Discount, { foreignKey: 'discountId', as: 'discount' })
Discount.hasMany(Product, { foreignKey: 'discountId', as: 'products' })

module.exports = {
  Product,
  Discount,
  Admin,
  initDB
}
