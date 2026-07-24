const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const { readDB, writeDB } = require('../services/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'receipts');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 МБ
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Разрешены только изображения (jpg, png, webp)'), ok);
  }
});

// Пользователь создаёт заявку на пополнение баланса + прикладывает скриншот/чек
router.post('/', requireAuth, upload.single('receipt'), (req, res) => {
  const { amount } = req.body;
  if (!req.file) return res.status(400).json({ error: 'Прикрепите скриншот или фото чека' });
  const amountNum = Number(amount);
  if (!amountNum || amountNum <= 0) return res.status(400).json({ error: 'Укажите сумму пополнения' });

  // Хэш файла — защита от повторного использования одного и того же чека
  const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const db = readDB();
  const duplicate = db.topups.find(t => t.checksum === checksum);
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
    status: 'pending', // pending -> approved / rejected
    reviewedBy: null,
    reviewedAt: null,
    rejectReason: null,
    createdAt: new Date().toISOString()
  };
  db.topups.push(topup);
  writeDB(db);
  res.json({ ...topup, receiptFile: undefined, checksum: undefined });
});

// История пополнений текущего пользователя
router.get('/', requireAuth, (req, res) => {
  const db = readDB();
  const mine = db.topups
    .filter(t => t.userId === req.user.id)
    .reverse()
    .map(({ checksum, receiptFile, ...safe }) => safe);
  res.json(mine);
});

// --- Админские роуты: доступны super_admin и checker_admin ---

// Все заявки на пополнение (по умолчанию — только ожидающие проверки)
router.get('/admin/list', requireAuth, requireRole('super_admin', 'checker_admin'), (req, res) => {
  const db = readDB();
  const status = req.query.status || 'pending';
  const list = db.topups
    .filter(t => status === 'all' || t.status === status)
    .reverse()
    .map(t => {
      const user = db.users.find(u => u.id === t.userId);
      return { ...t, checksum: undefined, userName: user?.name, userPhone: user?.phone };
    });
  res.json(list);
});

// Посмотреть сам файл чека (для проверки администратором)
router.get('/admin/:id/receipt', requireAuth, requireRole('super_admin', 'checker_admin'), (req, res) => {
  const db = readDB();
  const topup = db.topups.find(t => t.id === req.params.id);
  if (!topup) return res.status(404).json({ error: 'Заявка не найдена' });
  res.sendFile(path.join(UPLOAD_DIR, topup.receiptFile));
});

// Подтвердить пополнение — баланс пользователя увеличивается
router.post('/admin/:id/approve', requireAuth, requireRole('super_admin', 'checker_admin'), (req, res) => {
  const db = readDB();
  const topup = db.topups.find(t => t.id === req.params.id);
  if (!topup) return res.status(404).json({ error: 'Заявка не найдена' });
  if (topup.status !== 'pending') return res.status(409).json({ error: 'Заявка уже обработана' });

  const user = db.users.find(u => u.id === topup.userId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  user.balance = (user.balance || 0) + topup.amount;
  topup.status = 'approved';
  topup.reviewedBy = req.user.id;
  topup.reviewedAt = new Date().toISOString();
  writeDB(db);
  res.json({ ok: true, newBalance: user.balance });
});

// Отклонить пополнение
router.post('/admin/:id/reject', requireAuth, requireRole('super_admin', 'checker_admin'), (req, res) => {
  const { reason } = req.body;
  const db = readDB();
  const topup = db.topups.find(t => t.id === req.params.id);
  if (!topup) return res.status(404).json({ error: 'Заявка не найдена' });
  if (topup.status !== 'pending') return res.status(409).json({ error: 'Заявка уже обработана' });

  topup.status = 'rejected';
  topup.reviewedBy = req.user.id;
  topup.reviewedAt = new Date().toISOString();
  topup.rejectReason = reason || null;
  writeDB(db);
  res.json({ ok: true });
});

module.exports = router;
