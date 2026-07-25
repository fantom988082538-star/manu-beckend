const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const { getDB } = require('../services/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notifyAdmin } = require('../services/telegram');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'receipts');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Разрешены только изображения (jpg, png, webp)'), ok);
  }
});

router.post('/', requireAuth, upload.single('receipt'), async (req, res) => {
  const { amount } = req.body;
  if (!req.file) return res.status(400).json({ error: 'Прикрепите скриншот или фото чека' });
  const amountNum = Number(amount);
  if (!amountNum || amountNum <= 0) return res.status(400).json({ error: 'Укажите сумму пополнения' });

  const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const db = getDB();
  const topupsCol = db.collection('topups');
  const duplicate = await topupsCol.findOne({ checksum });
  if (duplicate) {
    return res.status(409).json({ error: 'Этот чек уже был использован ранее' });
  }

  const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
  const filename = `${uuid()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);

  const topup = {
    id: uuid(),
    userId: req.user.id,
    amount: amountNum,
    receiptFile: filename,
    checksum,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    rejectReason: null,
    createdAt: new Date().toISOString()
  };
  await topupsCol.insertOne(topup);

  const user = await db.collection('users').findOne({ id: req.user.id });
  notifyAdmin(
    `💰 **Новая заявка на пополнение**\n` +
    `Пользователь: ${user?.name || '—'} (${user?.phone || '—'})\n` +
    `Сумма: **${amountNum} сомони**\n` +
    `Проверь в админ-панели: вкладка «Пополнения»`
  );

  res.json({ ...topup, receiptFile: undefined, checksum: undefined });
});

router.get('/', requireAuth, async (req, res) => {
  const db = getDB();
  const mine = await db.collection('topups')
    .find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .project({ checksum: 0, receiptFile: 0 })
    .toArray();
  res.json(mine);
});

router.get('/admin/list', requireAuth, requireRole('super_admin', 'checker_admin'), async (req, res) => {
  const db = getDB();
  const status = req.query.status || 'pending';
  const query = status === 'all' ? {} : { status };
  const list = await db.collection('topups')
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();

  const usersCol = db.collection('users');
  const enriched = [];
  for (const t of list) {
    const user = await usersCol.findOne({ id: t.userId });
    const { checksum, receiptFile, ...safe } = t;
    enriched.push({ ...safe, userName: user?.name, userPhone: user?.phone });
  }
  res.json(enriched);
});

router.get('/admin/:id/receipt', requireAuth, requireRole('super_admin', 'checker_admin'), async (req, res) => {
  const db = getDB();
  const topup = await db.collection('topups').findOne({ id: req.params.id });
  if (!topup) return res.status(404).json({ error: 'Заявка не найдена' });
  res.sendFile(path.join(UPLOAD_DIR, topup.receiptFile));
});

router.post('/admin/:id/approve', requireAuth, requireRole('super_admin', 'checker_admin'), async (req, res) => {
  const db = getDB();
  const topupsCol = db.collection('topups');
  const topup = await topupsCol.findOne({ id: req.params.id });
  if (!topup) return res.status(404).json({ error: 'Заявка не найдена' });
  if (topup.status !== 'pending') return res.status(409).json({ error: 'Заявка уже обработана' });

  const usersCol = db.collection('users');
  const user = await usersCol.findOne({ id: topup.userId });
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  await usersCol.updateOne({ id: topup.userId }, { $inc: { balance: topup.amount } });
  await topupsCol.updateOne({ id: req.params.id }, { $set: { status: 'approved', reviewedBy: req.user.id, reviewedAt: new Date().toISOString() } });

  res.json({ ok: true, newBalance: (user.balance || 0) + topup.amount });
});

router.post('/admin/:id/reject', requireAuth, requireRole('super_admin', 'checker_admin'), async (req, res) => {
  const { reason } = req.body;
  const db = getDB();
  const topupsCol = db.collection('topups');
  const topup = await topupsCol.findOne({ id: req.params.id });
  if (!topup) return res.status(404).json({ error: 'Заявка не найдена' });
  if (topup.status !== 'pending') return res.status(409).json({ error: 'Заявка уже обработана' });

  await topupsCol.updateOne({ id: req.params.id }, { $set: { status: 'rejected', reviewedBy: req.user.id, reviewedAt: new Date().toISOString(), rejectReason: reason || null } });
  res.json({ ok: true });
});

module.exports = router;
