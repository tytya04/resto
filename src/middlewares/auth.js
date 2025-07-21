const { User } = require('../database/models');
const logger = require('../utils/logger');

const authMiddleware = async (ctx, next) => {
  try {
    if (!ctx.from) {
      logger.error('No ctx.from in authMiddleware');
      return ctx.reply('Ошибка аутентификации');
    }

    logger.info('Auth middleware processing', {
      telegramId: ctx.from.id,
      username: ctx.from.username,
      updateType: ctx.updateType
    });

    // Находим пользователя по telegram_id
    let user = await User.findOne({ 
      where: { telegram_id: ctx.from.id },
      include: [{
        model: require('../database/models').Restaurant,
        as: 'restaurant'
      }]
    });

    // Пропускаем проверку для команды /start и callback от регистрации
    const isStartCommand = ctx.message?.text === '/start';
    const isRegistrationCallback = ctx.callbackQuery?.data?.startsWith('reg_');
    const isRegistrationProcess = ctx.session?.awaitingContact || 
                                ctx.session?.awaitingRestaurantName || 
                                ctx.session?.awaitingRegistrationInfo;
    
    if (!user && (isStartCommand || isRegistrationCallback || isRegistrationProcess)) {
      return next();
    }

    if (!user) {
      return ctx.reply(
        '👋 Вы не зарегистрированы в системе.\n\n' +
        'Используйте команду /start для регистрации.'
      );
    }

    if (!user.is_active) {
      return ctx.reply(
        '❌ Ваш аккаунт деактивирован.\n\n' +
        'Обратитесь к администратору для восстановления доступа.'
      );
    }

    // Добавляем пользователя в контекст
    ctx.user = user;
    ctx.userRole = user.role;
    
    logger.info('User authenticated', {
      userId: user.id,
      telegramId: user.telegram_id,
      role: user.role,
      isActive: user.is_active,
      restaurantId: user.restaurant_id
    });
    
    return next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return ctx.reply('Произошла ошибка аутентификации. Попробуйте позже.');
  }
};

// Middleware для проверки роли
const requireRole = (roles) => {
  return async (ctx, next) => {
    if (!ctx.user) {
      return ctx.reply('Необходима авторизация');
    }

    const userRole = ctx.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      return ctx.reply(
        '❌ У вас нет доступа к этой функции.\n\n' +
        `Требуется роль: ${allowedRoles.join(' или ')}`
      );
    }

    return next();
  };
};

// Middleware для проверки, что пользователь привязан к ресторану
const requireRestaurant = async (ctx, next) => {
  if (!ctx.user) {
    return ctx.reply('Необходима авторизация');
  }

  if (ctx.user.role === 'restaurant' && !ctx.user.restaurant_id) {
    return ctx.reply(
      '⚠️ Вы не привязаны к ресторану.\n\n' +
      'Обратитесь к администратору для завершения регистрации.'
    );
  }

  return next();
};

// Middleware для проверки прав администратора
const requireAdmin = async (ctx, next) => {
  if (!ctx.user) {
    return ctx.reply('Необходима авторизация');
  }

  if (ctx.user.role !== 'admin') {
    return ctx.reply(
      '🚫 Доступ запрещен\n\n' +
      'Эта функция доступна только администраторам.'
    );
  }

  return next();
};

module.exports = { 
  authMiddleware,
  requireRole,
  requireRestaurant,
  requireAdmin
};