// Отправка уведомлений администратору в Telegram через бота.
// Токен бота и твой chat_id берутся из .env — если они не заданы,
// уведомления просто тихо пропускаются (сайт продолжает работать как обычно).

const axios = require('axios');

async function notifyAdmin(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return; // бот не настроен — просто ничего не делаем

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    });
  } catch (e) {
    console.error('[telegram] Не удалось отправить уведомление:', e.response?.data || e.message);
  }
}

module.exports = { notifyAdmin };
