const express = require('express');
const { getDB } = require('../services/db');
const supplier = require('../services/supplier');

const router = express.Router();

router.post('/alu', async (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];
  const rawBody = req.body.toString('utf-8');

  const isValid = supplier.verifyWebhookSignature(rawBody, signature, timestamp);
  if (!isValid) {
    console.warn('[webhook] Неверная подпись — запрос отклонён');
    return res.status(401).json({ error: 'Неверная подпись' });
  }

  const payload = JSON.parse(rawBody);
  const orderData = payload.data;

  const db = getDB();
  const ordersCol = db.collection('orders');
  const order = await ordersCol.findOne({ id: orderData.orderid });
  if (!order) {
    console.warn('[webhook] Заказ не найден:', orderData.orderid);
    return res.status(404).json({ error: 'Заказ не найден' });
  }

  const status = orderData.status === 'successful' ? 'completed'
    : orderData.status === 'failed' ? 'failed'
    : 'fulfilling';

  await ordersCol.updateOne({ id: orderData.orderid }, { $set: { status, supplierProviderId: orderData.provider_order_id || order.supplierProviderId } });
  console.log(`[webhook] Заказ ${order.id} обновлён: ${status}`);
  res.json({ ok: true });
});

module.exports = router;
