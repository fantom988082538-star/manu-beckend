const express = require('express');
const { getDB } = require('../services/db');

const router = express.Router();

router.get('/', async (req, res) => {
  const db = getDB();
  const games = await db.collection('games').find({}).toArray();
  res.json(games);
});

router.get('/:key', async (req, res) => {
  const db = getDB();
  const game = await db.collection('games').findOne({ key: req.params.key });
  if (!game) return res.status(404).json({ error: 'Игра не найдена' });
  res.json(game);
});

module.exports = router;
