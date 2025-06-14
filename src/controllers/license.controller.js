const service = require('../services/license.service')
const logger = require('../config/logger')

/**
 * Get all licenses
 */
exports.getAll = async (req, res) => {
  try {
    const filters = {}
    
    // Add query filters if provided
    if (req.query.status) {
      filters.status = req.query.status
    }
    if (req.query.productRef) {
      filters.productRef = req.query.productRef
    }

    const licenses = await service.getAll(filters)
    
    res.json({
      success: true,
      data: licenses,
      count: licenses.length
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'getLicenses',
      query: req.query
    })
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Get license by ID
 */
exports.getById = async (req, res) => {
  try {
    const license = await service.getById(req.params.id)
    
    res.json({
      success: true,
      data: license
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'getLicenseById',
      id: req.params.id
    })
    
    const statusCode = error.message === 'License not found' ? 404 : 500
    res.status(statusCode).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Create new license
 */
exports.create = async (req, res) => {
  try {
    const license = await service.create(req.body)
    
    res.status(201).json({
      success: true,
      data: license,
      message: 'License created successfully'
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'createLicense',
      body: req.body
    })
    res.status(400).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Update license
 */
exports.update = async (req, res) => {
  try {
    const license = await service.update(req.params.id, req.body)
    
    res.json({
      success: true,
      data: license,
      message: 'License updated successfully'
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'updateLicense',
      id: req.params.id,
      body: req.body
    })
    
    const statusCode = error.message === 'License not found' ? 404 : 500
    res.status(statusCode).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Delete license (soft delete by setting status to ANNULLED)
 */
exports.delete = async (req, res) => {
  try {
    await service.update(req.params.id, { status: 'ANNULLED' })
    
    res.status(204).send()
  } catch (error) {
    logger.logError(error, {
      operation: 'deleteLicense',
      id: req.params.id
    })
    
    const statusCode = error.message === 'License not found' ? 404 : 500
    res.status(statusCode).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Annul license by code
 */
exports.annul = async (req, res) => {
  try {
    const license = await service.annul(req.params.code, req.admin?.id)
    
    res.json({
      success: true,
      data: license,
      message: 'License annulled successfully'
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'annulLicense',
      code: req.params.code,
      actorId: req.admin?.id
    })
    res.status(400).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Return license to stock
 */
exports.return = async (req, res) => {
  try {
    const license = await service.returnToStock(req.params.code)
    
    res.json({
      success: true,
      data: license,
      message: 'License returned to stock successfully'
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'returnLicense',
      code: req.params.code
    })
    res.status(400).json({
      success: false,
      message: error.message
    })
  }
}

/**
 * Download CSV template
 */
exports.templateCsv = (req, res) => {
  try {
    const csvTemplate = 'productRef,licenseKey,instructions\nSOFT-PRO-1Y,AAA-BBB-CCC-111,https://example.com/instructions\nSOFT-PRO-1Y,AAA-BBB-CCC-222,Follow setup guide at our website\n'
    
    res.attachment('licenses-template.csv')
    res.type('text/csv')
    res.send(csvTemplate)
    
    logger.logBusiness('downloadTemplate', {
      adminId: req.admin?.id
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'downloadTemplate'
    })
    res.status(500).json({
      success: false,
      message: 'Error generating template'
    })
  }
}

/**
 * Bulk upload licenses from CSV
 */
exports.bulkUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is required'
      })
    }

    // Parse CSV using csv-parse/sync
    const csv = require('csv-parse/sync')
    const csvContent = req.file.buffer.toString('utf8')
    
    const rows = csv.parse(csvContent, {
      columns: true,
      trim: true,
      skip_empty_lines: true
    })

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is empty or invalid'
      })
    }

    // Validate required columns
    const requiredColumns = ['productRef', 'licenseKey']
    const firstRow = rows[0]
    const missingColumns = requiredColumns.filter(col => !(col in firstRow))
    
    if (missingColumns.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required columns: ${missingColumns.join(', ')}`
      })
    }

    const result = await service.bulkImport(rows)
    
    res.status(201).json({
      success: true,
      message: `Successfully imported ${result.length} licenses`,
      data: {
        imported: result.length,
        total: rows.length
      }
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'bulkUploadLicenses',
      filename: req.file?.originalname
    })
    res.status(400).json({
      success: false,
      message: error.message
    })
  }
}