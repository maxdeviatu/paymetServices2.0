const logger = require('../../config/logger')

/**
 * Email service for license notifications
 * In development, logs emails instead of sending them
 */
class EmailService {
  constructor() {
    this.provider = process.env.EMAIL_PROVIDER || 'log'
    this.from = process.env.EMAIL_FROM || 'noreply@innovatelearning.com.co'
  }

  /**
   * Send license delivery email
   */
  async sendLicenseEmail({ customer, product, license, order }) {
    try {
      const emailData = {
        to: customer.email,
        from: this.from,
        subject: `Tu licencia para ${product.name} está lista`,
        template: 'license-delivery',
        data: {
          customerName: `${customer.firstName} ${customer.lastName}`,
          productName: product.name,
          licenseKey: license.licenseKey,
          instructions: license.instructions || 'Contacta a soporte para instrucciones de activación',
          orderId: order.id,
          purchaseDate: order.createdAt.toLocaleDateString('es-CO'),
          supportEmail: 'soporte@innovatelearning.com.co'
        }
      }

      logger.logBusiness('email:license', {
        orderId: order.id,
        customerId: customer.id,
        licenseId: license.id,
        productRef: product.productRef,
        customerEmail: customer.email
      })

      if (process.env.NODE_ENV === 'development') {
        // In development, just log the email
        await this.logEmail(emailData)
      } else {
        // In production, send actual email
        await this.sendEmail(emailData)
      }

      return { success: true, messageId: `license-${order.id}-${Date.now()}` }
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
   * Send order confirmation email
   */
  async sendOrderConfirmation({ customer, product, order, transaction }) {
    try {
      const emailData = {
        to: customer.email,
        from: this.from,
        subject: `Confirmación de compra - Orden #${order.id}`,
        template: 'order-confirmation',
        data: {
          customerName: `${customer.firstName} ${customer.lastName}`,
          orderId: order.id,
          productName: product.name,
          qty: order.qty,
          subtotal: (order.subtotal / 100).toFixed(2),
          discountTotal: (order.discountTotal / 100).toFixed(2),
          grandTotal: (order.grandTotal / 100).toFixed(2),
          currency: transaction.currency,
          purchaseDate: order.createdAt.toLocaleDateString('es-CO'),
          paymentMethod: transaction.paymentMethod || 'Pago online'
        }
      }

      logger.logBusiness('email:orderConfirmation', {
        orderId: order.id,
        customerId: customer.id,
        customerEmail: customer.email
      })

      if (process.env.NODE_ENV === 'development') {
        await this.logEmail(emailData)
      } else {
        await this.sendEmail(emailData)
      }

      return { success: true, messageId: `order-${order.id}-${Date.now()}` }
    } catch (error) {
      logger.logError(error, {
        operation: 'sendOrderConfirmation',
        orderId: order.id,
        customerId: customer.id
      })
      throw error
    }
  }

  /**
   * Log email in development
   */
  async logEmail(emailData) {
    const emailContent = this.renderTemplate(emailData.template, emailData.data)
    
    logger.info('📧 EMAIL (Development Mode)', {
      to: emailData.to,
      from: emailData.from,
      subject: emailData.subject,
      template: emailData.template,
      content: emailContent
    })

    // Simulate email delivery delay
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  /**
   * Send actual email (production)
   */
  async sendEmail(emailData) {
    // TODO: Implement actual email sending
    // This could use SendGrid, AWS SES, or another email provider
    const emailContent = this.renderTemplate(emailData.template, emailData.data)
    
    logger.info('Sending email via provider', {
      provider: this.provider,
      to: emailData.to,
      subject: emailData.subject
    })

    // For now, just log it
    console.log(`EMAIL TO: ${emailData.to}`)
    console.log(`SUBJECT: ${emailData.subject}`)
    console.log(`CONTENT:\n${emailContent}`)
    
    return { messageId: `email-${Date.now()}`, provider: this.provider }
  }

  /**
   * Render email template
   */
  renderTemplate(templateName, data) {
    switch (templateName) {
      case 'license-delivery':
        return this.renderLicenseTemplate(data)
      case 'order-confirmation':
        return this.renderOrderConfirmationTemplate(data)
      default:
        return 'Template not found'
    }
  }

  /**
   * Render license delivery template
   */
  renderLicenseTemplate(data) {
    return `
¡Hola ${data.customerName}!

¡Tu compra ha sido procesada exitosamente! 

📋 DETALLES DE TU LICENCIA:
━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Producto: ${data.productName}
• Clave de Licencia: ${data.licenseKey}
• Orden: #${data.orderId}
• Fecha de compra: ${data.purchaseDate}

🔧 INSTRUCCIONES DE ACTIVACIÓN:
${data.instructions}

💬 ¿NECESITAS AYUDA?
Si tienes alguna pregunta o problema con tu licencia, no dudes en contactarnos:
📧 Email: ${data.supportEmail}

¡Gracias por tu compra!

El equipo de Innovate Learning
    `.trim()
  }

  /**
   * Render order confirmation template
   */
  renderOrderConfirmationTemplate(data) {
    return `
¡Hola ${data.customerName}!

Te confirmamos que hemos recibido tu orden correctamente.

📋 RESUMEN DE TU ORDEN:
━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Orden: #${data.orderId}
• Producto: ${data.productName}
• Cantidad: ${data.qty}
• Subtotal: $${data.subtotal} ${data.currency}
• Descuento: -$${data.discountTotal} ${data.currency}
• Total: $${data.grandTotal} ${data.currency}
• Método de pago: ${data.paymentMethod}
• Fecha: ${data.purchaseDate}

${data.productName.toLowerCase().includes('licencia') || data.productName.toLowerCase().includes('software') 
  ? '🚀 Tu licencia será enviada por email en los próximos minutos.' 
  : '📦 Tu pedido será procesado y recibirás actualizaciones por email.'}

¡Gracias por tu compra!

El equipo de Innovate Learning
    `.trim()
  }
}

module.exports = new EmailService()