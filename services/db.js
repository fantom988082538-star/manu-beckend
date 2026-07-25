const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('❌ MONGODB_URI не задан в .env');
  process.exit(1);
}

const client = new MongoClient(uri);
let db = null;

async function connectDB() {
  await client.connect();
  db = client.db('manushop');
  console.log('[mongodb] подключено');
  return db;
}

function getDB() {
  if (!db) throw new Error('База данных не подключена');
  return db;
}

async function initDB() {
  const gamesCol = db.collection('games');
  const count = await gamesCol.countDocuments();
  if (count === 0) {
    const initialGames = require('../data/games.json');
    if (initialGames && initialGames.length > 0) {
      await gamesCol.insertMany(initialGames);
      console.log('[init] Игры загружены из games.json');
    }
  }
}

module.exports = { connectDB, getDB, initDB };
