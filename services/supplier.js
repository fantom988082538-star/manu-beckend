// Слой общения с ALU API (aluu.in) — реальный поставщик игровых донатов.
// Ключ (SUPPLIER_API_KEY) читается ТОЛЬКО из .env — никогда не хардкодить сюда
// и никогда не отправлять на фронтенд.

const axios = require('axios');
const crypto = require('crypto');

const client = axios.create({
  baseURL: process.env.SUPPLIER_BASE_URL, // https://aluu.in/api/v.1
  timeout: 15000,
  headers: {
    'x-api-key': process.env.SUPPLIER_API_KEY,
    'Content-Type': 'application/json'
  }
});

// Баланс кошелька у поставщика
async function getBalance() {
  const { data } = await client.get('/balance');
  return data.data; // { wallet_balance, currency }
}

// Список игр, доступных у поставщика
async function getGames() {
  const { data } = await client.get('/games');
  return data.data; // [{ Name, gamecode, image, totalProducts }]
}

// Список товаров (пакетов) для конкретной игры
async function getProducts(gamecode) {
  const { data } = await client.get(`/products/${gamecode}`);
  return data.data; // [{ _id, name, Pack, requiresUserId, requiresServerId, requiresCharName, price, stockStatus }]
}

// Список серверов для игр, где это нужно (например Honkai Star Rail)
async function getServerOptions(gamecode) {
  const { data } = await client.get('/server-options', { params: { gamecode } });
  return data; // { requiresServerId, serverMode, servers: [{value,label}] }
}

// Создать заказ у поставщика (после успешной оплаты на нашей стороне!)
// partnerOrderId — наш собственный ID заказа (например "MS-482913"), поставщик вернёт его как orderid
async function createSupplierOrder({ gamecode, denom, userid, serverid, charname, partnerOrderId }) {
  const { data } = await client.post('/create', {
    game: gamecode,
    denom,
    userid,
    serverid: serverid || '',
    charname: charname || '',
    partner_webhook_url: process.env.WEBHOOK_BASE_URL ? `${process.env.WEBHOOK_BASE_URL}/api/webhook/alu` : undefined,
    partner_orderid: partnerOrderId
  });
  return data.data; // { orderid, reference, status, amount, provider_order_id, ... }
}

// Получить текущий статус заказа по нашему partner_orderid (без принудительного опроса поставщика игры)
async function getOrder(partnerOrderId) {
  const { data } = await client.get(`/${partnerOrderId}`);
  return data.data;
}

// Принудительно опросить статус у игры и обновить (использовать, если статус долго "pending")
async function trackOrder(partnerOrderId) {
  const { data } = await client.post(`/${partnerOrderId}/track`);
  return data.data;
}

// Проверка подписи вебхука от ALU (X-Webhook-Signature / X-Webhook-Timestamp).
// Формула из официальной документации ALU: HMAC-SHA256(secret, timestamp + "." + rawBody)
function verifyWebhookSignature(rawBody, signature, timestamp) {
  const secret = process.env.SUPPLIER_SECRET_KEY;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(String(signature || ''), 'utf8');
  if (expectedBuf.length !== signatureBuf.length) return false; // timingSafeEqual требует одинаковую длину
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

module.exports = {
  getBalance, getGames, getProducts, getServerOptions,
  createSupplierOrder, getOrder, trackOrder, verifyWebhookSignature
};
