require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const authRoutes = require('./routes/auth');
const gamesRoutes = require('./routes/games');
const ordersRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhook');
const topupsRoutes = require('./routes/topups');
const { readDB, writeDB } = require('./services/db');
const { v4: uuid } = require('uuid');

const app = express();

app.use(helmet());
app.use(cors());

// Вебхуку нужно "сырое" тело для проверки подписи — подключаем ДО express.json()
app.use('/api/webhook', express.raw({ type: 'application/json' }), webhookRoutes);

app.use(express.json());

// Защита от перебора и спам-запросов
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use(limiter);

// Отдельный, более строгий лимит на попытки входа
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/auth', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/topups', topupsRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Логирование ошибок (этап 7 — безопасность)
app.use((err, req, res, next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// При первом запуске создаём главного администратора из .env (если его ещё нет)
async function bootstrapSuperAdmin() {
  if (!process.env.ADMIN_PHONE || !process.env.ADMIN_PASSWORD) {
    console.warn('[bootstrap] ADMIN_PHONE / ADMIN_PASSWORD не заданы в .env — супер-админ не создан');
    return;
  }
  const db = readDB();
  const exists = db.users.find(u => u.phone === process.env.ADMIN_PHONE);
  if (exists) return;
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
  db.users.push({
    id: uuid(),
    name: 'Manu (Super Admin)',
    phone: process.env.ADMIN_PHONE,
    passwordHash,
    role: 'super_admin',
    balance: 0,
    createdAt: new Date().toISOString()
  });
  writeDB(db);
  console.log(`[bootstrap] Супер-админ создан: ${process.env.ADMIN_PHONE}`);
}

const PORT = process.env.PORT || 4000;
bootstrapSuperAdmin().then(() => {
  app.listen(PORT, () => console.log(`ManuShop API запущен на порту ${PORT}`));
});
