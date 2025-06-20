const { DataTypes } = require('sequelize')
const { sequelize } = require('./db')

const Discount = sequelize.define('Discount', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  amount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1
    }
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  validate: {
    dateRange () {
      if (this.startDate >= this.endDate) {
        throw new Error('La fecha de inicio debe ser anterior a la fecha de fin')
      }
    }
  }
})

module.exports = Discount
