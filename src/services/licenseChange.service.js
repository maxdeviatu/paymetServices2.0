const { License, Order, Product, User } = require('../models')
const { sequelize } = require('../models')
const logger = require('../config/logger')
const TransactionManager = require('../utils/transactionManager')
const emailService = require('./email')

/**
 * Service for handling license changes between products
 */
class LicenseChangeService {
  /**
   * Change a user's license to a different product
   * @param {string} licenseKey - Current license key
   * @param {string} customerDocumentNumber - Customer's document number
   * @param {string} newProductRef - New product reference
   * @param {number} adminId - Admin ID making the change
   * @returns {Promise<Object>} - Change result
   */
  async changeLicense (licenseKey, customerDocumentNumber, newProductRef, adminId = null) {
    try {
      logger.logBusiness('licenseChange:start', {
        licenseKey,
        customerDocumentNumber,
        newProductRef,
        adminId
      })

      return await TransactionManager.executeInventoryTransaction(async (t) => {
        // 1. Validate input data
        this.validateInput(licenseKey, customerDocumentNumber, newProductRef)

        // 2. Find and validate current license
        const currentLicense = await this.findAndValidateLicense(licenseKey, t)

        // 3. Find and validate customer
        const customer = await this.findAndValidateCustomer(customerDocumentNumber, currentLicense, t)

        // 4. Find and validate new product
        const newProduct = await this.findAndValidateNewProduct(newProductRef, currentLicense, t)

        // 5. Find and validate order
        const order = await this.findAndValidateOrder(currentLicense.orderId, t)

        // 6. Find available license for new product
        const newLicense = await this.findAvailableLicenseForNewProduct(newProductRef, t)

        // 7. Execute the change
        const changeResult = await this.executeLicenseChange(
          currentLicense,
          newLicense,
          order,
          newProduct,
          customer,
          adminId,
          t
        )

        // 8. Send change notification email (async, don't block transaction)
        setImmediate(() => {
          this.sendChangeNotificationEmailAsync(changeResult).catch(error => {
            logger.logError(error, {
              operation: 'sendChangeNotificationEmailAsync',
              orderId: changeResult.order.id,
              customerEmail: changeResult.customer.email,
              severity: 'WARNING'
            })
          })
        })

        logger.logBusiness('licenseChange:success', {
          oldLicenseId: currentLicense.id,
          newLicenseId: newLicense.id,
          orderId: order.id,
          customerId: customer.id,
          oldProductRef: currentLicense.productRef,
          newProductRef,
          adminId
        })

        return changeResult
      })
    } catch (error) {
      logger.logError(error, {
        operation: 'changeLicense',
        licenseKey,
        customerDocumentNumber,
        newProductRef,
        adminId
      })
      throw error
    }
  }

  /**
   * Validate input parameters
   */
  validateInput (licenseKey, customerDocumentNumber, newProductRef) {
    if (!licenseKey || typeof licenseKey !== 'string') {
      throw new Error('licenseKey es requerido y debe ser una cadena de texto')
    }

    if (!customerDocumentNumber || typeof customerDocumentNumber !== 'string') {
      throw new Error('customerDocumentNumber es requerido y debe ser una cadena de texto')
    }

    if (!newProductRef || typeof newProductRef !== 'string') {
      throw new Error('newProductRef es requerido y debe ser una cadena de texto')
    }

    // Validate license key format (basic validation)
    if (!/^[A-Z0-9-_]+$/.test(licenseKey)) {
      throw new Error('Formato de licenseKey inválido')
    }

    // Validate document number format (Colombian formats)
    if (!/^[0-9]{8,12}$/.test(customerDocumentNumber)) {
      throw new Error('El número de documento debe ser numérico con 8-12 dígitos')
    }

    // Validate product reference format
    if (!/^[A-Z0-9-_]+$/.test(newProductRef)) {
      throw new Error('Formato de newProductRef inválido')
    }
  }

  /**
   * Find and validate current license
   */
  async findAndValidateLicense (licenseKey, transaction) {
    const license = await License.findOne({
      where: { licenseKey },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!license) {
      throw new Error('Licencia no encontrada')
    }

    if (license.status !== 'SOLD') {
      throw new Error('Solo se pueden cambiar licencias que estén vendidas (SOLD)')
    }

    if (!license.orderId) {
      throw new Error('La licencia no está asociada a ninguna orden')
    }

    return license
  }

  /**
   * Find and validate customer
   */
  async findAndValidateCustomer (documentNumber, license, transaction) {
    // First, get the order to find the customer
    const order = await Order.findByPk(license.orderId, {
      include: [{ association: 'customer' }],
      transaction
    })

    if (!order || !order.customer) {
      throw new Error('No se pudo encontrar la información del cliente')
    }

    const customer = order.customer

    // Validate that the customer document matches
    if (customer.document_number !== documentNumber) {
      throw new Error('El número de documento no coincide con el propietario de la licencia')
    }

    return customer
  }

  /**
   * Find and validate new product
   */
  async findAndValidateNewProduct (newProductRef, currentLicense, transaction) {
    // Validate not changing to same product
    if (currentLicense.productRef === newProductRef) {
      throw new Error('No se puede cambiar a la misma referencia de producto')
    }

    const newProduct = await Product.findOne({
      where: { productRef: newProductRef },
      transaction
    })

    if (!newProduct) {
      throw new Error(`Producto con referencia ${newProductRef} no encontrado`)
    }

    if (!newProduct.isActive) {
      throw new Error(`El producto ${newProductRef} no está disponible`)
    }

    if (!newProduct.license_type) {
      throw new Error(`El producto ${newProductRef} no soporta licencias`)
    }

    // Validate price compatibility
    const currentProduct = await Product.findOne({
      where: { productRef: currentLicense.productRef },
      transaction
    })

    if (!currentProduct) {
      throw new Error(`El producto actual ${currentLicense.productRef} no existe`)
    }

    if (currentProduct.price !== newProduct.price) {
      throw new Error(`Los precios no coinciden. Producto actual: ${currentProduct.price}, Nuevo producto: ${newProduct.price}`)
    }

    return newProduct
  }

  /**
   * Find and validate order
   */
  async findAndValidateOrder (orderId, transaction) {
    const order = await Order.findByPk(orderId, {
      include: [{ association: 'product' }],
      transaction
    })

    if (!order) {
      throw new Error('Orden no encontrada')
    }

    if (order.status !== 'COMPLETED') {
      throw new Error('Solo se pueden cambiar licencias de órdenes completadas')
    }

    return order
  }

  /**
   * Find available license for new product
   */
  async findAvailableLicenseForNewProduct (newProductRef, transaction) {
    const newLicense = await License.findOne({
      where: {
        productRef: newProductRef,
        status: 'AVAILABLE'
      },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!newLicense) {
      throw new Error(`No hay licencias disponibles para el producto ${newProductRef}`)
    }

    // Verify license is still available after lock
    if (newLicense.status !== 'AVAILABLE' || newLicense.orderId !== null) {
      throw new Error('La licencia seleccionada ya no está disponible')
    }

    return newLicense
  }

  /**
   * Execute the license change transaction
   */
  async executeLicenseChange (currentLicense, newLicense, order, newProduct, customer, adminId, transaction) {
    // 1. Update order to new product
    await order.update({
      productRef: newProduct.productRef
    }, { transaction })

    // 2. Assign new license to the order
    await newLicense.update({
      status: 'SOLD',
      orderId: order.id,
      soldAt: new Date()
    }, { transaction })

    // 3. Return old license to available stock (COMPLETE RESET)
    await currentLicense.update({
      status: 'AVAILABLE',
      orderId: null,
      soldAt: null,
      reservedAt: null
    }, { transaction })

    // 4. Update order's shipping info to reflect the change
    const currentShippingInfo = order.shippingInfo || {}
    const updatedShippingInfo = {
      ...currentShippingInfo,
      // Preserve previous email if exists
      previousEmail: currentShippingInfo.email
        ? {
            ...currentShippingInfo.email,
            invalidatedAt: new Date().toISOString(),
            reason: 'license_change'
          }
        : undefined,
      // Reset current email status
      email: undefined,
      licenseChange: {
        changedAt: new Date().toISOString(),
        oldLicenseKey: currentLicense.licenseKey,
        oldProductRef: currentLicense.productRef,
        newLicenseKey: newLicense.licenseKey,
        newProductRef: newProduct.productRef,
        customerDocumentNumber: customer.document_number,
        adminId,
        emailPending: true
      }
    }

    await order.update({
      shippingInfo: updatedShippingInfo
    }, { transaction })

    return {
      success: true,
      oldLicense: {
        id: currentLicense.id,
        licenseKey: currentLicense.licenseKey,
        productRef: currentLicense.productRef,
        status: 'AVAILABLE'
      },
      newLicense: {
        id: newLicense.id,
        licenseKey: newLicense.licenseKey,
        productRef: newLicense.productRef,
        status: 'SOLD',
        instructions: newLicense.instructions
      },
      order: {
        id: order.id,
        productRef: newProduct.productRef,
        status: order.status
      },
      customer: {
        id: customer.id,
        name: `${customer.first_name} ${customer.last_name}`,
        email: customer.email,
        documentNumber: customer.document_number
      },
      changeInfo: {
        changedAt: new Date(),
        oldProductName: order.product.name,
        newProductName: newProduct.name,
        adminId
      }
    }
  }

  /**
   * Send change notification email (async version)
   */
  async sendChangeNotificationEmailAsync (changeResult) {
    try {
      const emailResult = await emailService.sendLicenseChangeEmail({
        customer: changeResult.customer,
        oldProduct: { name: changeResult.changeInfo.oldProductName },
        newProduct: { name: changeResult.changeInfo.newProductName },
        oldLicense: changeResult.oldLicense,
        newLicense: changeResult.newLicense,
        order: changeResult.order
      })

      // Update order shipping info with email details (separate transaction)
      await TransactionManager.executeInventoryTransaction(async (t) => {
        const order = await Order.findByPk(changeResult.order.id, { transaction: t })
        const currentShippingInfo = order.shippingInfo || {}

        const updatedShippingInfo = {
          ...currentShippingInfo,
          licenseChange: {
            ...currentShippingInfo.licenseChange,
            emailSent: true,
            emailSentAt: new Date().toISOString(),
            emailMessageId: emailResult.messageId,
            emailPending: false
          }
        }

        await order.update({
          shippingInfo: updatedShippingInfo
        }, { transaction: t })
      })

      logger.logBusiness('licenseChange:emailSent', {
        orderId: changeResult.order.id,
        customerEmail: changeResult.customer.email,
        messageId: emailResult.messageId
      })

      return emailResult
    } catch (error) {
      // Update order to reflect email failure
      await TransactionManager.executeInventoryTransaction(async (t) => {
        const order = await Order.findByPk(changeResult.order.id, { transaction: t })
        const currentShippingInfo = order.shippingInfo || {}

        const updatedShippingInfo = {
          ...currentShippingInfo,
          licenseChange: {
            ...currentShippingInfo.licenseChange,
            emailSent: false,
            emailAttemptedAt: new Date().toISOString(),
            emailError: error.message,
            emailPending: false
          }
        }

        await order.update({
          shippingInfo: updatedShippingInfo
        }, { transaction: t })
      })

      logger.logError(error, {
        operation: 'sendChangeNotificationEmailAsync',
        orderId: changeResult.order.id,
        customerEmail: changeResult.customer.email,
        severity: 'WARNING'
      })

      throw error
    }
  }

  /**
   * Send change notification email (sync version for backwards compatibility)
   */
  async sendChangeNotificationEmail (changeResult, transaction) {
    try {
      const emailResult = await emailService.sendLicenseChangeEmail({
        customer: changeResult.customer,
        oldProduct: { name: changeResult.changeInfo.oldProductName },
        newProduct: { name: changeResult.changeInfo.newProductName },
        oldLicense: changeResult.oldLicense,
        newLicense: changeResult.newLicense,
        order: changeResult.order
      })

      // Update order shipping info with email details
      const order = await Order.findByPk(changeResult.order.id, { transaction })
      const currentShippingInfo = order.shippingInfo || {}

      const updatedShippingInfo = {
        ...currentShippingInfo,
        licenseChange: {
          ...currentShippingInfo.licenseChange,
          emailSent: true,
          emailSentAt: new Date().toISOString(),
          emailMessageId: emailResult.messageId,
          emailPending: false
        }
      }

      await order.update({
        shippingInfo: updatedShippingInfo
      }, { transaction })

      logger.logBusiness('licenseChange:emailSent', {
        orderId: changeResult.order.id,
        customerEmail: changeResult.customer.email,
        messageId: emailResult.messageId
      })

      return emailResult
    } catch (error) {
      logger.logError(error, {
        operation: 'sendChangeNotificationEmail',
        orderId: changeResult.order.id,
        customerEmail: changeResult.customer.email,
        severity: 'WARNING'
      })

      // Don't fail the entire operation for email errors
      // Just log and continue
      return { success: false, error: error.message }
    }
  }
}

module.exports = new LicenseChangeService()
