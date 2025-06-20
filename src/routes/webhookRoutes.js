const express = require('express')
const router = express.Router()
const webhookController = require('../controllers/webhookController')

// Webhook para Cobre
router.post('/cobre', webhookController.handleCobreWebhook)

// ... existing routes ...

module.exports = router
