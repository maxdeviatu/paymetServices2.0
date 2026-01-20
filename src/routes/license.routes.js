const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/license.controller')
const { authenticate } = require('../middlewares/auth')
const { requireRole } = require('../middlewares/role')
const multer = require('multer')

// Configure multer for memory storage (CSV files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.toLowerCase().endsWith('.csv')) {
      cb(null, true)
    } else {
      cb(new Error('Only CSV files are allowed'), false)
    }
  }
})

// All routes require authentication
router.use(authenticate)

// CSV operations - require EDITOR role
router.get('/template', requireRole('EDITOR'), ctrl.templateCsv)
router.post('/upload', requireRole('EDITOR'), upload.single('file'), ctrl.bulkUpload)

// Bulk dismount - require SUPER_ADMIN role
router.post('/dismount', requireRole('SUPER_ADMIN'), upload.single('file'), ctrl.bulkDismount)

// CRUD operations
router.get('/', requireRole('READ_ONLY'), ctrl.getAll)
router.get('/:id', requireRole('READ_ONLY'), ctrl.getById)
router.post('/', requireRole('EDITOR'), ctrl.create)
router.put('/:id', requireRole('EDITOR'), ctrl.update)
router.delete('/:id', requireRole('SUPER_ADMIN'), ctrl.delete)

// Business operations - require SUPER_ADMIN role
router.post('/:code/annul', requireRole('SUPER_ADMIN'), ctrl.annul)
router.post('/:code/return', requireRole('SUPER_ADMIN'), ctrl.return)

module.exports = router
