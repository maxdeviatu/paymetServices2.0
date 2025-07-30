const logger = require('../../config/logger')
const { sendEmail } = require('./brevoService')

/**
 * Email service for license notifications
 * Now uses Brevo and Handlebars templates
 */
class EmailService {
  constructor () {
    this.provider = process.env.EMAIL_PROVIDER || 'brevo'
    this.from = process.env.BREVO_SENDER_EMAIL || 'noreply@innovatelearning.com.co'
  }

  /**
   * Send license delivery email
   */
  async sendLicenseEmail ({ customer, product, license, order }) {
    try {
      logger.logBusiness('email:license.start', {
        orderId: order.id,
        customerId: customer.id,
        licenseId: license.id,
        productRef: product.productRef,
        customerEmail: customer.email
      })

      logger.info('EmailService: About to call sendEmail from brevoService', {
        orderId: order.id,
        to: customer.email,
        templateName: 'license-delivery',
        licenseKey: license.licenseKey
      })

      const result = await sendEmail({
        to: {
          email: customer.email,
          name: `${customer.first_name} ${customer.last_name}`
        },
        subject: `Tu producto ${product.name} está listo`,
        templateName: 'license-delivery',
        variables: {
          customerName: `${customer.first_name} ${customer.last_name}`,
          productName: product.name,
          licenseKey: license.licenseKey,
          instructions: license.instructions || null,
          orderId: order.id,
          purchaseDate: order.createdAt.toLocaleDateString('es-CO'),
          supportEmail: 'administrativo@innovatelearning.com.co',
          whatsappLink: 'https://wa.link/b6dl4y'
        }
      })

      logger.info('EmailService: sendEmail returned from brevoService', {
        orderId: order.id,
        result: result,
        resultType: typeof result,
        success: result?.success,
        messageId: result?.messageId
      })

      logger.logBusiness('email:license.success', {
        orderId: order.id,
        customerId: customer.id,
        licenseId: license.id,
        customerEmail: customer.email,
        messageId: result.messageId,
        success: result.success
      })

      return result
    } catch (error) {
      logger.error('EmailService: Error in sendLicenseEmail', {
        error: error.message,
        stack: error.stack,
        operation: 'sendLicenseEmail',
        orderId: order.id,
        customerId: customer.id,
        licenseId: license.id,
        customerEmail: customer.email
      })
      logger.logError(error, {
        operation: 'sendLicenseEmail',
        orderId: order.id,
        customerId: customer.id,
        licenseId: license.id
      })
      throw error
    }
  }

  /**
   * Send waitlist notification email
   */
  async sendWaitlistNotification ({ customer, product, order, waitlistEntry }) {
    try {
      logger.logBusiness('email:waitlistNotification', {
        orderId: order.id,
        customerId: customer.id,
        waitlistEntryId: waitlistEntry.id,
        productRef: product.productRef,
        customerEmail: customer.email
      })

      await sendEmail({
        to: {
          email: customer.email,
          name: `${customer.first_name} ${customer.last_name}`
        },
        subject: 'Estás en la lista de espera',
        templateName: 'waitlist-notification',
        variables: {
          customerName: `${customer.first_name} ${customer.last_name}`,
          productName: product.name,
          orderId: order.id,
          purchaseDate: order.createdAt.toLocaleDateString('es-CO'),
          estimatedTime: '24-48 horas',
          whatsappLink: 'https://wa.link/b6dl4y'
        }
      })

      return { success: true, messageId: `waitlist-${order.id}-${Date.now()}` }
    } catch (error) {
      logger.logError(error, {
        operation: 'sendWaitlistNotification',
        orderId: order.id,
        customerId: customer.id,
        waitlistEntryId: waitlistEntry.id
      })
      throw error
    }
  }

  /**
   * Send license change notification email
   */
  async sendLicenseChangeEmail ({ customer, oldProduct, newProduct, oldLicense, newLicense, order }) {
    try {
      logger.logBusiness('email:licenseChange.start', {
        orderId: order.id,
        customerId: customer.id,
        oldLicenseId: oldLicense.id,
        newLicenseId: newLicense.id,
        oldProductRef: oldLicense.productRef,
        newProductRef: newLicense.productRef,
        customerEmail: customer.email
      })

      const result = await sendEmail({
        to: {
          email: customer.email,
          name: customer.name
        },
        subject: `Cambio de Producto - Tu nueva licencia está lista`,
        templateName: 'license-change',
        variables: {
          customerName: customer.name,
          oldProductName: oldProduct.name,
          newProductName: newProduct.name,
          oldLicenseKey: oldLicense.licenseKey,
          newLicenseKey: newLicense.licenseKey,
          instructions: newLicense.instructions || null,
          orderId: order.id,
          changeDate: new Date().toLocaleDateString('es-CO'),
          supportEmail: 'administrativo@innovatelearning.com.co',
          whatsappLink: 'https://wa.link/b6dl4y'
        }
      })

      logger.logBusiness('email:licenseChange.success', {
        orderId: order.id,
        customerId: customer.id,
        oldLicenseId: oldLicense.id,
        newLicenseId: newLicense.id,
        customerEmail: customer.email,
        messageId: result.messageId,
        success: result.success
      })

      return result
    } catch (error) {
      logger.logError(error, {
        operation: 'sendLicenseChangeEmail',
        orderId: order.id,
        customerId: customer.id,
        oldLicenseId: oldLicense.id,
        newLicenseId: newLicense.id
      })
      throw error
    }
  }
}

module.exports = new EmailService()
