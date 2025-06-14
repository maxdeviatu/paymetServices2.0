const { License, Product } = require('../models')
const { sequelize } = require('../models')
const logger = require('../config/logger')

/**
 * Create a new license
 */
async function create(data) {
  try {
    logger.logBusiness('createLicense', {
      productRef: data.productRef,
      licenseKey: data.licenseKey
    })

    // Verify that the product exists and supports licenses
    const product = await Product.findOne({
      where: { productRef: data.productRef }
    })

    if (!product) {
      throw new Error(`Product with reference ${data.productRef} not found`)
    }

    if (!product.license_type) {
      throw new Error(`Product ${data.productRef} does not support licenses. Set license_type to true first.`)
    }

    const license = await License.create(data)

    logger.logBusiness('createLicense.success', {
      id: license.id,
      productRef: license.productRef,
      status: license.status
    })

    return license
  } catch (error) {
    logger.logError(error, {
      operation: 'createLicense',
      data
    })
    throw error
  }
}

/**
 * Update an existing license
 */
async function update(id, data) {
  try {
    logger.logBusiness('updateLicense', { id, data })

    const license = await License.findByPk(id)
    if (!license) {
      throw new Error('License not found')
    }

    // Business rule: if license is SOLD, don't allow changing licenseKey
    if (license.status === 'SOLD' && data.licenseKey) {
      delete data.licenseKey
      logger.logBusiness('updateLicense.restrictedField', {
        id,
        reason: 'Cannot change licenseKey of SOLD license'
      })
    }

    const updatedLicense = await license.update(data)

    logger.logBusiness('updateLicense.success', {
      id: updatedLicense.id,
      status: updatedLicense.status
    })

    return updatedLicense
  } catch (error) {
    logger.logError(error, {
      operation: 'updateLicense',
      id,
      data
    })
    throw error
  }
}

/**
 * Annul a license by licenseKey
 */
async function annul(code, actorId) {
  try {
    logger.logBusiness('annulLicense', { code, actorId })

    return await sequelize.transaction(async (t) => {
      const license = await License.findOne({
        where: { licenseKey: code },
        lock: t.LOCK.UPDATE,
        transaction: t
      })

      if (!license || license.status === 'SOLD') {
        throw new Error('Cannot annul: License not found or already sold')
      }

      const last5 = code.slice(-5)
      const updatedLicense = await license.update({
        licenseKey: `ANULADA-${last5}`,
        status: 'ANNULLED',
        orderId: null,
        reservedAt: null
      }, { transaction: t })

      logger.logBusiness('annulLicense.success', {
        originalKey: code,
        newKey: updatedLicense.licenseKey,
        actorId
      })

      return updatedLicense
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'annulLicense',
      code,
      actorId
    })
    throw error
  }
}

/**
 * Return a license to stock
 */
async function returnToStock(code) {
  try {
    logger.logBusiness('returnLicenseToStock', { code })

    return await sequelize.transaction(async (t) => {
      const license = await License.findOne({
        where: { licenseKey: code },
        lock: t.LOCK.UPDATE,
        transaction: t
      })

      if (!license || license.status !== 'SOLD') {
        throw new Error('Only SOLD licenses can be returned to stock')
      }

      const updatedLicense = await license.update({
        status: 'RETURNED',
        orderId: null,
        soldAt: null,
        reservedAt: new Date()
      }, { transaction: t })

      logger.logBusiness('returnLicenseToStock.success', {
        licenseKey: code,
        newStatus: updatedLicense.status
      })

      return updatedLicense
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'returnLicenseToStock',
      code
    })
    throw error
  }
}

/**
 * Bulk import licenses from CSV data
 */
async function bulkImport(rows) {
  try {
    logger.logBusiness('bulkImportLicenses', {
      totalRows: rows.length
    })

    // Get unique product references from the CSV
    const uniqueProductRefs = [...new Set(rows.map(row => row.productRef))]
    
    // Verify all products exist and support licenses
    const products = await Product.findAll({
      where: { productRef: uniqueProductRefs },
      attributes: ['productRef', 'license_type']
    })

    // Check for missing products
    const foundProductRefs = products.map(p => p.productRef)
    const missingProductRefs = uniqueProductRefs.filter(ref => !foundProductRefs.includes(ref))
    
    if (missingProductRefs.length > 0) {
      throw new Error(`Products not found: ${missingProductRefs.join(', ')}`)
    }

    // Check for products that don't support licenses
    const nonLicenseProducts = products.filter(p => !p.license_type).map(p => p.productRef)
    
    if (nonLicenseProducts.length > 0) {
      throw new Error(`Products do not support licenses: ${nonLicenseProducts.join(', ')}. Set license_type to true first.`)
    }

    const result = await License.bulkCreate(rows, {
      ignoreDuplicates: true
    })

    logger.logBusiness('bulkImportLicenses.success', {
      imported: result.length,
      totalRows: rows.length
    })

    return result
  } catch (error) {
    logger.logError(error, {
      operation: 'bulkImportLicenses',
      rowCount: rows.length
    })
    throw error
  }
}

/**
 * Get all licenses with optional filters
 */
async function getAll(filters = {}) {
  try {
    logger.logBusiness('getAllLicenses', { filters })

    const licenses = await License.findAll({
      where: filters,
      include: ['Product'],
      order: [['createdAt', 'DESC']]
    })

    logger.logBusiness('getAllLicenses.success', {
      count: licenses.length
    })

    return licenses
  } catch (error) {
    logger.logError(error, {
      operation: 'getAllLicenses',
      filters
    })
    throw error
  }
}

/**
 * Get license by ID
 */
async function getById(id) {
  try {
    logger.logBusiness('getLicenseById', { id })

    const license = await License.findByPk(id, {
      include: ['Product']
    })

    if (!license) {
      throw new Error('License not found')
    }

    logger.logBusiness('getLicenseById.success', {
      id: license.id,
      status: license.status
    })

    return license
  } catch (error) {
    logger.logError(error, {
      operation: 'getLicenseById',
      id
    })
    throw error
  }
}

module.exports = {
  create,
  update,
  annul,
  returnToStock,
  bulkImport,
  getAll,
  getById
}