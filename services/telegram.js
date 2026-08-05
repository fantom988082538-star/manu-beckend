// Отправка уведомлений администраторам в Telegram через бота.
// Токен бота и chat_id берутся из .env — если они не заданы,
// уведомления просто тихо пропускаются (сайт продолжает работать как обычно).
//
// Можно указать НЕСКОЛЬКО получателей — впиши их id через запятую:
// TELEGRAM_ADMIN_CHAT_ID=111111111,222222222,333333333

const axios = require('axios');

async function notifyAdmin(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const raw = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !raw) return; // бот не настроен — просто ничего не делаем

  const chatIds = raw.split(',').map(id => id.trim()).filter(Boolean);

  await Promise.all(chatIds.map(async (chatId) => {
    try {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML'
      });
    } catch (e) {
      console.error(`[telegram] Не удалось отправить уведомление ${chatId}:`, e.response?.data || e.message);
    }
  }));
}

module.exports = { notifyAdmin };
