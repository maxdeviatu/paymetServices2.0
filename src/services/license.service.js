const { License, Product } = require('../models')
const logger = require('../config/logger')
const TransactionManager = require('../utils/transactionManager')

/**
 * Create a new license
 */
async function create (data) {
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
async function update (id, data) {
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
async function annul (code, actorId) {
  try {
    logger.logBusiness('annulLicense', { code, actorId })

    return await TransactionManager.executeInventoryTransaction(async (t) => {
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
async function returnToStock (code, reason = 'MANUAL', adminId = null) {
  try {
    logger.logBusiness('returnLicenseToStock', { code, reason, adminId })

    return await TransactionManager.executeInventoryTransaction(async (dbTransaction) => {
      // 1. Buscar la licencia original
      const license = await License.findOne({
        where: { licenseKey: code },
        lock: dbTransaction.LOCK.UPDATE,
        transaction: dbTransaction
      })

      if (!license) {
        throw new Error('License not found')
      }

      if (license.status !== 'SOLD') {
        throw new Error('Only SOLD licenses can be returned to stock')
      }

      if (!license.orderId) {
        throw new Error('License is not associated with any order')
      }

      // 2. Buscar la orden
      const { Order } = require('../models')
      const order = await Order.findByPk(license.orderId, {
        lock: dbTransaction.LOCK.UPDATE,
        transaction: dbTransaction
      })

      if (!order) {
        throw new Error('Associated order not found')
      }

      // 3. Buscar la transacción PAID
      const { Transaction } = require('../models')
      const transaction = await Transaction.findOne({
        where: {
          orderId: license.orderId,
          status: 'PAID'
        },
        lock: dbTransaction.LOCK.UPDATE,
        transaction: dbTransaction
      })

      if (!transaction) {
        throw new Error('Associated PAID transaction not found')
      }

      // 4. Marcar licencia original como devuelta PRIMERO
      const last5 = code.slice(-5)
      const updatedLicense = await license.update({
        licenseKey: `DEVUELTA-${last5}`
        // Mantener status, orderId, soldAt para historial
      }, { transaction: dbTransaction })

      // 5. Crear nueva licencia disponible con la clave original
      const newLicenseKey = code
      const newLicense = await License.create({
        productRef: license.productRef,
        licenseKey: newLicenseKey,
        instructions: license.instructions,
        status: 'AVAILABLE'
      }, { transaction: dbTransaction })

      // 7. Actualizar transacción a REFUNDED
      await transaction.update({
        status: 'REFUNDED',
        meta: {
          ...transaction.meta,
          refunded: {
            refundedAt: new Date().toISOString(),
            reason,
            adminId,
            originalLicenseKey: code,
            newLicenseKey
          }
        }
      }, { transaction: dbTransaction })

      logger.logBusiness('returnLicenseToStock.success', {
        originalLicenseKey: code,
        returnedLicenseKey: updatedLicense.licenseKey,
        newAvailableLicenseKey: newLicense.licenseKey,
        orderId: license.orderId,
        transactionId: transaction.id,
        reason,
        adminId
      })

      return {
        returnedLicense: updatedLicense,
        newAvailableLicense: newLicense,
        transaction,
        order
      }
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'returnLicenseToStock',
      code,
      reason,
      adminId
    })
    throw error
  }
}

/**
 * Bulk import licenses from CSV data
 */
async function bulkImport (rows) {
  try {
    logger.logBusiness('bulkImportLicenses', {
      totalRows: rows.length
    })

    // Filter out empty or invalid rows
    const validRows = rows.filter(row => {
      return row.productRef &&
             row.productRef.trim() !== '' &&
             row.licenseKey &&
             row.licenseKey.trim() !== ''
    })

    if (validRows.length === 0) {
      throw new Error('No valid rows found in CSV. All rows must have productRef and licenseKey.')
    }

    if (validRows.length !== rows.length) {
      logger.logBusiness('bulkImportLicenses.filtered', {
        originalRows: rows.length,
        validRows: validRows.length,
        filteredRows: rows.length - validRows.length
      })
    }

    // Get unique product references from the valid CSV rows
    const uniqueProductRefs = [...new Set(validRows.map(row => row.productRef))]

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

    const result = await License.bulkCreate(validRows, {
      ignoreDuplicates: true
    })

    logger.logBusiness('bulkImportLicenses.success', {
      imported: result.length,
      totalRows: validRows.length,
      originalRows: rows.length
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
async function getAll (filters = {}) {
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
async function getById (id) {
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

/**
 * Bulk dismount licenses from CSV data
 * Only AVAILABLE licenses can be dismounted
 * Operation is atomic: if any license fails, all are rolled back
 */
async function bulkDismount (rows, adminId) {
  try {
    logger.logBusiness('bulkDismountLicenses', {
      totalRows: rows.length,
      adminId
    })

    // 1. Filter valid rows (non-empty productRef and licenseKey)
    const validRows = rows.filter(row =>
      row.productRef &&
      row.productRef.trim() !== '' &&
      row.licenseKey &&
      row.licenseKey.trim() !== ''
    )

    if (validRows.length === 0) {
      throw new Error('No valid rows found in CSV. All rows must have productRef and licenseKey.')
    }

    if (validRows.length !== rows.length) {
      const emptyRows = rows.length - validRows.length
      throw new Error(`${emptyRows} rows have empty productRef or licenseKey`)
    }

    // 2. Extract unique license keys
    const licenseKeys = validRows.map(row => row.licenseKey.trim())
    const uniqueKeys = [...new Set(licenseKeys)]

    // 3. Execute in atomic transaction with inventory isolation
    return await TransactionManager.executeInventoryTransaction(async (t) => {
      // 4. Find all licenses with exclusive lock
      const licenses = await License.findAll({
        where: { licenseKey: uniqueKeys },
        lock: t.LOCK.UPDATE,
        transaction: t
      })

      // 5. Validate all licenses exist
      const foundKeys = licenses.map(l => l.licenseKey)
      const notFoundKeys = uniqueKeys.filter(key => !foundKeys.includes(key))

      if (notFoundKeys.length > 0) {
        throw new Error(`Licenses not found: ${notFoundKeys.join(', ')}`)
      }

      // 6. Validate productRef matches for each license
      for (const row of validRows) {
        const license = licenses.find(l => l.licenseKey === row.licenseKey.trim())
        if (license.productRef !== row.productRef.trim()) {
          throw new Error(
            `License ${row.licenseKey} belongs to product ${license.productRef}, not ${row.productRef}`
          )
        }
      }

      // 7. Validate all licenses are in AVAILABLE status
      const invalidLicenses = licenses.filter(l => l.status !== 'AVAILABLE')

      if (invalidLicenses.length > 0) {
        const details = invalidLicenses.map(l => `${l.licenseKey} (${l.status})`).join(', ')
        throw new Error(`Cannot dismount licenses with invalid status: ${details}`)
      }

      // 8. Update all licenses to ANNULLED status
      // Use license ID to guarantee uniqueness (last5 can cause collisions in bulk operations)
      for (const license of licenses) {
        await license.update({
          licenseKey: `ANULADA-${license.id}`,
          status: 'ANNULLED',
          orderId: null,
          reservedAt: null
        }, { transaction: t })
      }

      logger.logBusiness('bulkDismountLicenses.success', {
        dismounted: licenses.length,
        adminId
      })

      return { count: licenses.length }
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'bulkDismountLicenses',
      rowCount: rows.length,
      adminId
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
  bulkDismount,
  getAll,
  getById
}
