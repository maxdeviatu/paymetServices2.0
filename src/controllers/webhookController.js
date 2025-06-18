const CobreCheckout = require('../models/cobreCheckout');
const Transaction = require('../models/transaction');
const Order = require('../models/order');
const logger = require('../config/logger');

exports.handleCobreWebhook = async (req, res) => {
  try {
    const { checkout_id, status, amount, currency } = req.body;

    logger.info('📥 Webhook recibido de Cobre:', {
      checkout_id,
      status,
      amount,
      currency
    });

    // Buscar el checkout en la base de datos
    const checkout = await CobreCheckout.findOne({
      where: { checkoutId: checkout_id },
      include: [{
        model: Transaction,
        include: [Order]
      }]
    });

    if (!checkout) {
      logger.error('❌ Checkout no encontrado:', { checkout_id });
      return res.status(404).json({
        success: false,
        message: 'Checkout no encontrado'
      });
    }

    // Actualizar el estado del checkout
    await checkout.update({
      status: status.toUpperCase(),
      metadata: {
        ...checkout.metadata,
        lastWebhook: req.body
      }
    });

    // Actualizar la transacción
    const transaction = checkout.Transaction;
    await transaction.update({
      status: status.toUpperCase(),
      metadata: {
        ...transaction.metadata,
        lastWebhook: req.body
      }
    });

    // Si el pago fue exitoso, actualizar la orden
    if (status === 'PAID') {
      const order = transaction.Order;
      await order.update({
        status: 'COMPLETED'
      });

      // Aquí iría la lógica para generar y enviar la licencia
      logger.info('✅ Pago completado exitosamente:', {
        order_id: order.id,
        transaction_id: transaction.id,
        checkout_id: checkout.checkoutId
      });
    }

    res.json({
      success: true,
      message: 'Webhook procesado correctamente'
    });
  } catch (error) {
    logger.error('❌ Error procesando webhook de Cobre:', error);
    res.status(500).json({
      success: false,
      message: 'Error procesando webhook',
      error: error.message
    });
  }
}; 