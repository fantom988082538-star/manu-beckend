const express = require('express');
const { getDB } = require('../services/db');
const { requireAuth } = require('../middleware/auth');
const { notifyAdmin } = require('../services/telegram');

const router = express.Router();

function refundOrder(user, order) {
  if (order.refunded) return;
  user.balance = (user.balance || 0) + order.price;
  order.refunded = true;
}

router.post('/', requireAuth, async (req, res) => {
  const { gameKey, packId, uid, server } = req.body;
  const db = getDB();
  const gamesCol = db.collection('games');
  const usersCol = db.collection('users');
  const ordersCol = db.collection('orders');

  const game = await gamesCol.findOne({ key: gameKey });
  if (!game) return res.status(400).json({ error: 'Игра не найдена' });
  const pack = game.packs.find(p => p.id === packId);
  if (!pack) return res.status(400).json({ error: 'Пакет не найден' });
  if (!uid) return res.status(400).json({ error: 'Укажите UID игрока' });
  if (game.needsServer && !server) return res.status(400).json({ error: 'Укажите сервер' });

  const user = await usersCol.findOne({ id: req.user.id });
  const order = {
    id: 'MS-' + Math.floor(100000 + Math.random() * 900000),
    userId: req.user.id,
    gameKey, gameTitle: game.title,
    packId, packLabel: pack.label, denom: pack.denom,
    price: pack.price,
    uid, server: server || null,
    status: 'created',
    refunded: false,
    createdAt: new Date().toISOString()
  };

  if (user.balance >= pack.price) {
    await usersCol.updateOne({ id: req.user.id }, { $inc: { balance: -pack.price } });
    order.status = 'checking';
    await ordersCol.insertOne(order);
    notifyAdmin(
      `🎮 **Новый заказ на выдачу**\n` +
      `${order.gameTitle} — ${order.packLabel}\n` +
      `UID: **${order.uid}** ${order.server ? ' · сервер: ' + order.server : ''}\n` +
      `Сумма: ${order.price} сомони\n` +
      `Проверь в админ-панели: вкладка «Заказы»`
    );
    return res.json(order);
  }

  order.status = 'awaiting_payment';
  await ordersCol.insertOne(order);
  res.status(402).json({ error: 'Недостаточно средств на балансе, пополните баланс', order });
});

router.post('/:id/pay-from-balance', requireAuth, async (req, res) => {
  const db = getDB();
  const ordersCol = db.collection('orders');
  const usersCol = db.collection('users');
  const order = await ordersCol.findOne({ id: req.params.id });
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  if (order.userId !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
  if (order.status !== 'awaiting_payment') return res.status(409).json({ error: 'Заказ уже оплачен или обработан' });

  const user = await usersCol.findOne({ id: req.user.id });
  if (user.balance < order.price) {
    return res.status(402).json({ error: 'Недостаточно средств на балансе' });
  }
  await usersCol.updateOne({ id: req.user.id }, { $inc: { balance: -order.price } });
  await ordersCol.updateOne({ id: req.params.id }, { $set: { status: 'checking' } });
  order.status = 'checking';
  notifyAdmin(
    `🎮 **Новый заказ на выдачу**\n` +
    `${order.gameTitle} — ${order.packLabel}\n` +
    `UID: **${order.uid}** ${order.server ? ' · сервер: ' + order.server : ''}\n` +
    `Сумма: ${order.price} сомони\n` +
    `Проверь в админ-панели: вкладка «Заказы»`
  );
  res.json(order);
});

router.get('/:id/status', requireAuth, async (req, res) => {
  const db = getDB();
  const order = await db.collection('orders').findOne({ id: req.params.id });
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  if (order.userId !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
  res.json(order);
});

router.get('/', requireAuth, async (req, res) => {
  const db = getDB();
  const myOrders = await db.collection('orders')
    .find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(myOrders);
});

router.post('/:id/cancel', requireAuth, async (req, res) => {
  const db = getDB();
  const ordersCol = db.collection('orders');
  const order = await ordersCol.findOne({ id: req.params.id });
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  if (order.userId !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
  if (order.status !== 'awaiting_payment') return res.status(409).json({ error: 'Можно отменить только неоплаченный заказ' });
  await ordersCol.updateOne({ id: req.params.id }, { $set: { status: 'cancelled' } });
  res.json({ ...order, status: 'cancelled' });
});

module.exports = router;
