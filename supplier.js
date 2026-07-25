// Простая файловая "база данных" на JSON.
// На этапе 8 (запуск) заменить на настоящую БД: PostgreSQL или MongoDB.
// Логика запросов ниже написана так, чтобы замену было легко сделать позже.

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = { users: [], orders: [], topups: [], games: require('../data/games.json') };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  if (!db.topups) db.topups = []; // на случай старой базы без этого поля
  return db;
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

module.exports = { readDB, writeDB };
