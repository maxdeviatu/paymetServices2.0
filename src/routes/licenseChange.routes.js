const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/licenseChange.controller')
const { authenticate } = require('../middlewares/auth')
const { requireRole } = require('../middlewares/role')

// All routes require authentication
router.use(authenticate)

// License change endpoint - require SUPER_ADMIN role
router.post('/change', requireRole('SUPER_ADMIN'), ctrl.changeLicense)

module.exports = router
