const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/waitlist.controller')
const { authenticate } = require('../middlewares/auth')
const { requireRole } = require('../middlewares/role')

// Todas las rutas requieren autenticación
router.use(authenticate)

// Rutas de consulta - requieren rol READ_ONLY
router.get('/metrics', requireRole('READ_ONLY'), ctrl.getMetrics)
router.get('/', requireRole('READ_ONLY'), ctrl.getWaitlist)
router.get('/:waitlistEntryId', requireRole('READ_ONLY'), ctrl.getWaitlistEntry)

// Rutas de operación - requieren rol EDITOR
router.post('/reserve', requireRole('EDITOR'), ctrl.reserveLicenses)
router.post('/process', requireRole('EDITOR'), ctrl.processReservedLicenses)
router.delete('/:waitlistEntryId', requireRole('EDITOR'), ctrl.removeFromWaitlist)

// Rutas de administración - requieren rol SUPER_ADMIN
router.get('/job/status', requireRole('SUPER_ADMIN'), ctrl.getJobStatus)
router.post('/job/run', requireRole('SUPER_ADMIN'), ctrl.runJob)
router.post('/process-all', requireRole('SUPER_ADMIN'), ctrl.runFullProcessing)

module.exports = router
