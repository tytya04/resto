// Роли пользователей
const ROLES = {
  ADMIN: 'admin',
  RESTAURANT: 'restaurant',
  MANAGER: 'manager',
  BUYER: 'buyer'
};

// Названия ролей для отображения
const ROLE_NAMES = {
  [ROLES.ADMIN]: 'Администратор',
  [ROLES.RESTAURANT]: 'Ресторан',
  [ROLES.MANAGER]: 'Менеджер',
  [ROLES.BUYER]: 'Закупщик'
};

// Эмодзи для ролей
const ROLE_EMOJIS = {
  [ROLES.ADMIN]: '👨‍💼',
  [ROLES.RESTAURANT]: '🏢',
  [ROLES.MANAGER]: '👔',
  [ROLES.BUYER]: '🛒'
};

module.exports = {
  ROLES,
  ROLE_NAMES,
  ROLE_EMOJIS
};