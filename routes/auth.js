const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { readDB, writeDB } = require('../services/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Регистрация
router.post('/register', async (req, res) => {
  const { name, phone, password } = req.body;
  if (!name || !phone || !password) {
    return res.status(400).json({ error: 'Заполните имя, телефон и пароль' });
  }
  const db = readDB();
  if (db.users.find(u => u.phone === phone)) {
    return res.status(409).json({ error: 'Пользователь с таким телефоном уже существует' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: uuid(), name, phone, passwordHash,
    role: 'user', balance: 0,
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  writeDB(db);

  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role, balance: user.balance } });
});

// Вход
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.phone === phone);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Неверный телефон или пароль' });
  }
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role, balance: user.balance } });
});

// Текущий пользователь — свежий баланс и данные профиля
router.get('/me', requireAuth, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json({ id: user.id, name: user.name, phone: user.phone, role: user.role, balance: user.balance });
});

module.exports = router;
