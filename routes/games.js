const express = require('express');
const { readDB } = require('../services/db');

const router = express.Router();

// Список всех игр с пакетами (цены — наши, не от поставщика напрямую)
router.get('/', (req, res) => {
  const db = readDB();
  res.json(db.games);
});

// Одна игра по ключу
router.get('/:key', (req, res) => {
  const db = readDB();
  const game = db.games.find(g => g.key === req.params.key);
  if (!game) return res.status(404).json({ error: 'Игра не найдена' });
  res.json(game);
});

module.exports = router;
