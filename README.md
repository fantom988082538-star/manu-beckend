# ManuShop — Backend

## Запуск локально
```
npm install
cp .env.example .env
npm run dev
```
Сервер поднимется на `http://localhost:4000`.
При первом запуске автоматически создастся супер-админ из `ADMIN_PHONE` / `ADMIN_PASSWORD` в `.env`.

## Куда вставить API-ключ (ALU API — aluu.in)
Открой `.env` и заполни:
```
SUPPLIER_BASE_URL=https://aluu.in/api/v.1
SUPPLIER_API_KEY=...
SUPPLIER_SECRET_KEY=...
```
Файл `.env` в `.gitignore` — на фронтенд и в git не попадёт.

## Роли пользователей
- **super_admin** — полный доступ: пользователи, роли, цены, игры, статистика
- **checker_admin** — проверяет заявки на пополнение баланса и заказы, не трогает настройки
- **manager** — только просмотр заказов, помощь клиентам
- **user** — обычный покупатель

Роль назначается через `PATCH /api/admin/users/:id/role` (только super_admin).

## Баланс и пополнение (ручная проверка чека)
1. Пользователь: `POST /api/topups` (multipart: `amount`, `receipt` — файл) → заявка со статусом `pending`
   - Один и тот же файл чека нельзя загрузить дважды (проверка по хэшу содержимого)
2. Админ (`super_admin`/`checker_admin`): `GET /api/topups/admin/list?status=pending` — список заявок
3. `GET /api/topups/admin/:id/receipt` — посмотреть сам файл чека
4. `POST /api/topups/admin/:id/approve` — баланс пользователя пополняется
5. `POST /api/topups/admin/:id/reject` — заявка отклоняется (можно указать `reason`)

## Заказы и статусы
`created → awaiting_payment → checking → completed / cancelled`
- `POST /api/orders` — создать заказ. Если хватает баланса — сразу списывает и уходит на проверку поставщику.
  Если не хватает — статус `awaiting_payment`, ответ 402 с подсказкой пополнить баланс.
- `POST /api/orders/:id/pay-from-balance` — повторно попробовать оплатить после пополнения
- `GET /api/orders/:id/status?force=1` — проверить/принудительно опросить статус у поставщика
- `POST /api/orders/:id/cancel` — отменить неоплаченный заказ
- Если поставщик отклонил заказ — деньги автоматически возвращаются на баланс (`refunded`)

## Осталось доделать
1. **Подпись вебхука ALU** (`verifyWebhookSignature` в `services/supplier.js`) — сейчас формула HMAC-SHA256 стоит как ПРЕДПОЛОЖЕНИЕ. Пришли разделы документации «Webhook Signature Verification» и «Node.js verification helper» — подставлю точную формулу.
2. **Проверить `supplierGameCode` для Free Fire** в `data/games.json` (сейчас `"freefire"` — догадка). Сверь через `GET /api/v.1/games`.
3. Онлайн-оплата (Alif Mobi, DC Wallet, банковские карты) пока не подключена — баланс пополняется только вручную через чек. Реальные платёжные API — отдельный этап.
4. Фронтенд (HTML-файл) пока не обновлён под баланс/роли/чеки — нужно доработать отдельно: экран пополнения баланса с загрузкой файла, отображение баланса, админ-панель.

## Структура
```
server.js              — точка входа, bootstrap супер-админа
routes/auth.js          — регистрация / вход / текущий пользователь
routes/games.js         — каталог игр и пакетов
routes/orders.js        — заказ → списание с баланса → поставщик → статус
routes/topups.js        — пополнение баланса по чеку + проверка админом
routes/admin.js         — управление (заказы/цены/игры/пользователи/роли) с учётом прав
routes/webhook.js       — приём вебхука от ALU
services/supplier.js    — общение с ALU API (ключ только здесь)
services/db.js          — временное файловое хранилище (заменить на БД на этапе 8)
data/games.json         — список игр и пакетов пополнения
middleware/auth.js      — JWT + проверка ролей (requireRole)
uploads/receipts/       — загруженные чеки/скриншоты оплаты
```
