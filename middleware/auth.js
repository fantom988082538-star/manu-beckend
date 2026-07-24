const jwt = require('jsonwebtoken');

// Роли в системе: super_admin, checker_admin, manager, user
const ROLES = ['super_admin', 'checker_admin', 'manager', 'user'];

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Нет токена авторизации' });
  }
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

// requireRole('super_admin') или requireRole('super_admin','checker_admin') — любая из перечисленных ролей подходит
function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав для этого действия' });
    }
    next();
  };
}

// Оставлено для обратной совместимости — считает admin-ом любую административную роль
function requireAdmin(req, res, next) {
  if (!req.user || !['super_admin', 'checker_admin', 'manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Доступ только для администратора' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireRole, ROLES };
