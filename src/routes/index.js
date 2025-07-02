const express = require('express')
const router = express.Router()

// Importar rutas
const productsRoutes = require('./products.routes')
const discountsRoutes = require('./discounts.routes')
const adminsRoutes = require('./admins.routes')
const usersRoutes = require('./users.routes')
const licenseRoutes = require('./license.routes')
const ordersRoutes = require('./orders.routes')
const webhookRoutes = require('./webhook.routes')
const providersRoutes = require('./admin/providers.routes')
const jobsRoutes = require('./admin/jobs.routes')
const waitlistRoutes = require('./waitlist.routes')
const emailQueueRoutes = require('./emailQueue.routes')
const invoicesRoutes = require('./invoices.routes')

// Montar rutas
router.use('/products', productsRoutes)
router.use('/discounts', discountsRoutes)
router.use('/admins', adminsRoutes)
router.use('/users', usersRoutes)
router.use('/licenses', licenseRoutes)
router.use('/orders', ordersRoutes)
router.use('/webhooks', webhookRoutes)
router.use('/providers', providersRoutes)
router.use('/admin/jobs', jobsRoutes)
router.use('/waitlist', waitlistRoutes)
router.use('/email-queue', emailQueueRoutes)
router.use('/invoices', invoicesRoutes)

module.exports = router
