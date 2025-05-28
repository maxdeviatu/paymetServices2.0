const express = require('express')
const router = express.Router()

// Importar rutas
const productsRoutes = require('./products.routes')
const discountsRoutes = require('./discounts.routes')
const adminsRoutes = require('./admins.routes')

// Montar rutas
router.use('/products', productsRoutes)
router.use('/discounts', discountsRoutes)
router.use('/admins', adminsRoutes)

module.exports = router
