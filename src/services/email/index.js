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
}

module.exports = new EmailService()
