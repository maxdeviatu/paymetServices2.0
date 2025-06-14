const express = require('express')
const router = express.Router()

// Importar rutas
const productsRoutes = require('./products.routes')
const discountsRoutes = require('./discounts.routes')
const adminsRoutes = require('./admins.routes')
const usersRoutes = require('./users.routes')
const licenseRoutes = require('./license.routes')

// Montar rutas
router.use('/products', productsRoutes)
router.use('/discounts', discountsRoutes)
router.use('/admins', adminsRoutes)
router.use('/users', usersRoutes)
router.use('/licenses', licenseRoutes)

module.exports = router
