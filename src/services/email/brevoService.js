const axios = require('axios');
const { renderTemplate } = require('./renderTemplate');
const logger = require('../../config/logger');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Innovate Learning';
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'administrativo@innovatelearning.com.co';
const SEND_EMAILS = process.env.SEND_EMAILS === 'true';

/**
 * Envia un email usando Brevo y una plantilla handlebars
 * @param {Object} options
 * @param {Object} options.to - { email, name }
 * @param {string} options.subject
 * @param {string} options.templateName
 * @param {Object} options.variables
 */
async function sendEmail({ to, subject, templateName, variables }) {
  try {
    logger.info('Preparing to send email', { to, subject, templateName, SEND_EMAILS });

    const htmlContent = renderTemplate(templateName, variables);

    if (!SEND_EMAILS) {
      logger.info('Email sending is disabled. Simulating email:', { to, subject, templateName, variables });
      return { success: true, messageId: `simulated-${Date.now()}` };
    }

    if (!BREVO_API_KEY) {
      throw new Error('BREVO_API_KEY is not configured');
    }

    const response = await axios.post(
      BREVO_API_URL,
      {
        sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
        to: [to],
        subject,
        htmlContent,
        tags: [`template_${templateName}`],
        replyTo: { email: BREVO_SENDER_EMAIL }
      },
      {
        headers: {
          accept: 'application/json',
          'api-key': BREVO_API_KEY,
          'content-type': 'application/json'
        }
      }
    );

    logger.info('Email sent successfully', { messageId: response.data.messageId, to, templateName });
    return { success: true, messageId: response.data.messageId };
  } catch (error) {
    logger.logError(error, {
      operation: 'sendEmail',
      to,
      subject,
      templateName
    });
    throw error;
  }
}

module.exports = { sendEmail };
