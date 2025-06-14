const { DataTypes } = require('sequelize')
const { sequelize } = require('./db')
const slugify = require('slugify')

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  slug: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  productRef: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  image: {
    type: DataTypes.STRING
  },
  description: {
    type: DataTypes.TEXT
  },
  features: {
    type: DataTypes.TEXT
  },
  price: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 0
    }
  },
  currency: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'USD',
    validate: {
      isIn: [['USD', 'EUR', 'COP', 'MXN']] // Monedas soportadas
    }
  },
  provider: {
    type: DataTypes.STRING
  },
  hasDiscount: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  discountId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  license_type: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  }
}, {
  hooks: {
    beforeValidate: (product) => {
      // Generar slug a partir del nombre si no existe
      if (product.name && !product.slug) {
        product.slug = slugify(product.name, {
          lower: true,
          strict: true
        })
      }
    }
  }
})

module.exports = Product
