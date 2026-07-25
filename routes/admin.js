const express = require('express');
const { readDB, writeDB } = require('../services/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// --- Доступно: super_admin, checker_admin, manager ---

// Все заказы (просмотр — доступен всем административным ролям)
router.get('/orders', requireRole('super_admin', 'checker_admin', 'manager'), (req, res) => {
  const db = readDB();
  res.json(db.orders.slice().reverse());
});

// Пометить заказ выполненным — донат выдан вручную
router.post('/orders/:id/complete', requireRole('super_admin', 'checker_admin'), (req, res) => {
  const db = readDB();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  if (order.status !== 'checking') return res.status(409).json({ error: 'Заказ не находится в статусе проверки' });
  order.status = 'completed';
  order.completedBy = req.user.id;
  order.completedAt = new Date().toISOString();
  writeDB(db);
  res.json(order);
});

// Отклонить/отменить заказ — деньги возвращаются на баланс пользователя
router.post('/orders/:id/cancel', requireRole('super_admin', 'checker_admin'), (req, res) => {
  const { reason } = req.body;
  const db = readDB();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  if (!['checking', 'awaiting_payment'].includes(order.status)) {
    return res.status(409).json({ error: 'Этот заказ уже нельзя отменить' });
  }
  order.status = 'cancelled';
  order.cancelReason = reason || null;
  if (!order.refunded) {
    const user = db.users.find(u => u.id === order.userId);
    if (user) user.balance = (user.balance || 0) + order.price;
    order.refunded = true;
  }
  writeDB(db);
  res.json(order);
});

// --- Доступно: только super_admin и checker_admin ---

// Прибыль (сумма завершённых заказов)
router.get('/revenue', requireRole('super_admin', 'checker_admin'), (req, res) => {
  const db = readDB();
  const completed = db.orders.filter(o => o.status === 'completed');
  const total = completed.reduce((s, o) => s + o.price, 0);
  res.json({ totalOrders: db.orders.length, completedOrders: completed.length, totalRevenue: total });
});

// --- Доступно: только super_admin ---

// Изменить пакет (цена, название, номинал)
router.patch('/games/:key/packs/:packId', requireRole('super_admin'), (req, res) => {
  const { price, label, denom } = req.body;
  const db = readDB();
  const game = db.games.find(g => g.key === req.params.key);
  if (!game) return res.status(404).json({ error: 'Игра не найдена' });
  const pack = game.packs.find(p => p.id === req.params.packId);
  if (!pack) return res.status(404).json({ error: 'Пакет не найден' });
  if (price !== undefined) pack.price = Number(price);
  if (label !== undefined) pack.label = label;
  if (denom !== undefined) pack.denom = denom;
  writeDB(db);
  res.json(pack);
});

// Добавить новый пакет (номинал) в существующую игру
router.post('/games/:key/packs', requireRole('super_admin'), (req, res) => {
  const { label, price, denom } = req.body;
  if (!label || !price) return res.status(400).json({ error: 'Укажите название и цену пакета' });
  const db = readDB();
  const game = db.games.find(g => g.key === req.params.key);
  if (!game) return res.status(404).json({ error: 'Игра не найдена' });
  const id = `${req.params.key}_${Date.now()}`;
  const pack = { id, label, price: Number(price), denom: denom || '' };
  game.packs.push(pack);
  writeDB(db);
  res.json(pack);
});

// Удалить пакет
router.delete('/games/:key/packs/:packId', requireRole('super_admin'), (req, res) => {
  const db = readDB();
  const game = db.games.find(g => g.key === req.params.key);
  if (!game) return res.status(404).json({ error: 'Игра не найдена' });
  const before = game.packs.length;
  game.packs = game.packs.filter(p => p.id !== req.params.packId);
  if (game.packs.length === before) return res.status(404).json({ error: 'Пакет не найден' });
  writeDB(db);
  res.json({ ok: true });
});

// Добавить новую игру
router.post('/games', requireRole('super_admin'), (req, res) => {
  const { key, title, needsServer, supplierGameCode, packs } = req.body;
  const db = readDB();
  if (db.games.find(g => g.key === key)) {
    return res.status(409).json({ error: 'Игра с таким ключом уже есть' });
  }
  const game = { key, title, needsServer: !!needsServer, supplierGameCode, packs: packs || [] };
  db.games.push(game);
  writeDB(db);
  res.json(game);
});

// Удалить игру целиком (со всеми её пакетами)
router.delete('/games/:key', requireRole('super_admin'), (req, res) => {
  const db = readDB();
  const before = db.games.length;
  db.games = db.games.filter(g => g.key !== req.params.key);
  if (db.games.length === before) return res.status(404).json({ error: 'Игра не найдена' });
  writeDB(db);
  res.json({ ok: true });
});

// Список пользователей (без паролей)
router.get('/users', requireRole('super_admin'), (req, res) => {
  const db = readDB();
  res.json(db.users.map(u => ({
    id: u.id, name: u.name, phone: u.phone, role: u.role, balance: u.balance, createdAt: u.createdAt
  })));
});

// Изменить роль сотрудника (назначить/снять админа, менеджера и т.д.)
router.patch('/users/:id/role', requireRole('super_admin'), (req, res) => {
  const { role } = req.body;
  const allowedRoles = ['super_admin', 'checker_admin', 'manager', 'user'];
  if (!allowedRoles.includes(role)) return res.status(400).json({ error: 'Недопустимая роль' });
  const db = readDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  user.role = role;
  writeDB(db);
  res.json({ id: user.id, name: user.name, role: user.role });
});

// Ручная корректировка баланса пользователя (например, компенсация)
router.patch('/users/:id/balance', requireRole('super_admin'), (req, res) => {
  const { amount, reason } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  user.balance = (user.balance || 0) + Number(amount || 0);
  writeDB(db);
  console.log(`[admin] Баланс ${user.id} изменён на ${amount} (${reason || 'без причины'})`);
  res.json({ id: user.id, balance: user.balance });
});

module.exports = router;
