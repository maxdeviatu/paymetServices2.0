const licenseChangeService = require('../services/licenseChange.service')
const logger = require('../config/logger')

/**
 * Change license to different product
 */
exports.changeLicense = async (req, res) => {
  try {
    const { licenseKey, customerDocumentNumber, newProductRef } = req.body

    // Validate required fields
    if (!licenseKey) {
      return res.status(400).json({
        success: false,
        message: 'licenseKey es requerido'
      })
    }

    if (!customerDocumentNumber) {
      return res.status(400).json({
        success: false,
        message: 'customerDocumentNumber es requerido'
      })
    }

    if (!newProductRef) {
      return res.status(400).json({
        success: false,
        message: 'newProductRef es requerido'
      })
    }

    logger.logBusiness('api:licenseChange.request', {
      licenseKey,
      customerDocumentNumber,
      newProductRef,
      adminId: req.admin?.id
    })

    // Execute license change
    const result = await licenseChangeService.changeLicense(
      licenseKey,
      customerDocumentNumber,
      newProductRef,
      req.admin?.id
    )

    res.status(200).json({
      success: true,
      message: 'Licencia cambiada exitosamente',
      data: {
        changeInfo: {
          changedAt: result.changeInfo.changedAt,
          oldProductName: result.changeInfo.oldProductName,
          newProductName: result.changeInfo.newProductName
        },
        customer: {
          id: result.customer.id,
          name: result.customer.name,
          email: result.customer.email
        },
        order: {
          id: result.order.id,
          productRef: result.order.productRef
        },
        licenses: {
          old: {
            licenseKey: result.oldLicense.licenseKey,
            productRef: result.oldLicense.productRef,
            status: result.oldLicense.status
          },
          new: {
            licenseKey: result.newLicense.licenseKey,
            productRef: result.newLicense.productRef,
            status: result.newLicense.status
          }
        }
      }
    })
  } catch (error) {
    logger.logError(error, {
      operation: 'changeLicense',
      licenseKey: req.body.licenseKey,
      customerDocumentNumber: req.body.customerDocumentNumber,
      newProductRef: req.body.newProductRef,
      adminId: req.admin?.id
    })

    let statusCode = 500
    let message = error.message

    // Map specific errors to appropriate status codes
    if (error.message.includes('no encontrada') || 
        error.message.includes('no coincide') ||
        error.message.includes('no está disponible') ||
        error.message.includes('no soporta licencias')) {
      statusCode = 404
    } else if (error.message.includes('no están vendidas') ||
               error.message.includes('no están completadas') ||
               error.message.includes('no hay licencias disponibles')) {
      statusCode = 400
    } else if (error.message.includes('Formato') ||
               error.message.includes('es requerido')) {
      statusCode = 400
    } else if (error.message.includes('no coinciden')) {
      statusCode = 400
    }

    res.status(statusCode).json({
      success: false,
      message: message
    })
  }
} 