const Order = require('../models/order');
const Transaction = require('../models/transaction');
const CobreCheckout = require('../models/cobreCheckout');
const cobreCheckoutService = require('../services/payment/providers/cobre/checkout');
const logger = require('../config/logger');
const sequelize = require('../config/database');

exports.createOrder = async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    const { productRef, qty, customer, provider = 'mock' } = req.body;

    // Validar que el proveedor sea válido
    if (!['mock', 'cobre'].includes(provider)) {
      return res.status(400).json({
        success: false,
        message: 'Proveedor de pago no válido'
      });
    }

    // Crear la orden
    const order = await Order.create({
      productRef,
      qty,
      customer,
      status: 'PENDING'
    }, { transaction: t });

    // Crear la transacción
    const transaction = await Transaction.create({
      orderId: order.id,
      gateway: provider,
      status: 'PENDING',
      amount: order.grandTotal,
      currency: order.currency
    }, { transaction: t });

    let checkoutData = null;

    // Si el proveedor es Cobre, crear el checkout
    if (provider === 'cobre') {
      try {
        const checkout = await cobreCheckoutService.createCheckout({
          amount: order.grandTotal,
          externalId: `order_${order.id}`,
          alias: `Orden #${order.id}`,
          header: `Pago de Licencia - Orden #${order.id}`,
          item: `Licencia Digital - ${order.productRef}`,
          description: `Pago de licencia digital - Orden #${order.id}`,
          redirectUrl: `${config.appUrl}/payment/complete?orderId=${order.id}`
        });

        // Guardar el checkout en la base de datos
        await CobreCheckout.create({
          transactionId: transaction.id,
          checkoutId: checkout.id,
          checkoutUrl: checkout.checkout_url,
          amount: order.grandTotal,
          currency: order.currency,
          validUntil: new Date(checkout.valid_until),
          metadata: checkout
        }, { transaction: t });

        checkoutData = {
          id: transaction.id,
          gateway: 'cobre',
          gatewayRef: checkout.id,
          status: 'PENDING',
          amount: order.grandTotal,
          currency: order.currency,
          paymentUrl: checkout.checkout_url
        };
      } catch (error) {
        logger.error('Error al crear checkout de Cobre:', error);
        throw new Error('Error al crear el checkout de pago');
      }
    }

    await t.commit();

    // Estructura de respuesta actualizada
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        orderId: order.id,
        customerId: order.customerId,
        transactionId: transaction.id,
        productRef: order.productRef,
        qty: order.qty,
        subtotal: order.subtotal,
        discountTotal: order.discountTotal,
        taxTotal: order.taxTotal,
        grandTotal: order.grandTotal,
        currency: order.currency,
        status: order.status,
        provider: provider,
        transaction: checkoutData || {
          id: transaction.id,
          gateway: provider,
          status: 'PENDING',
          amount: order.grandTotal,
          currency: order.currency
        }
      }
    });
  } catch (error) {
    await t.rollback();
    logger.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating order',
      error: error.message
    });
  }
}; 