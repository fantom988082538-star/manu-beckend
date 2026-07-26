const express = require('express');
const { readDB } = require('../services/db');

const router = express.Router();

// Список всех игр с пакетами (цены — наши, не от поставщика напрямую)
router.get('/', async (req, res) => {
  const db = await readDB();
  res.json(db.games);
});

// Одна игра по ключу
router.get('/:key', async (req, res) => {
  const db = await readDB();
  const game = db.games.find(g => g.key === req.params.key);
  if (!game) return res.status(404).json({ error: 'Игра не найдена' });
  res.json(game);
});

module.exports = router;
