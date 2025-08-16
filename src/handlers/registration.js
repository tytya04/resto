const { User, Restaurant, RegistrationRequest } = require('../database/models');
const { Markup } = require('telegraf');
const logger = require('../utils/logger');
const { notifyManagers } = require('../services/NotificationService');

// Хранилище таймеров для напоминаний
const registrationReminders = new Map();

// Обработчик команды /start
const startCommand = async (ctx) => {
  try {
    // Принудительно выходим из любой сцены
    if (ctx.scene && ctx.scene.current) {
      await ctx.scene.leave();
    }
    
    const telegramId = ctx.from.id;
    const username = ctx.from.username;
    const firstName = ctx.from.first_name;
    const lastName = ctx.from.last_name;
    
    // Показываем Telegram ID пользователю
    logger.info(`User started bot: ID=${telegramId}, username=${username}`);

    // Проверяем, есть ли пользователь в БД
    let user = await User.findOne({ 
      where: { telegram_id: telegramId },
      include: [{
        model: Restaurant,
        as: 'restaurant'
      }]
    });

    if (user) {
      // Пользователь уже зарегистрирован
      // Сохраняем важные данные сессии перед показом меню
      const draftOrderId = ctx.session?.draftOrderId;
      const addingProducts = ctx.session?.addingProducts;
      
      await showMainMenu(ctx, user);
      
      // Восстанавливаем данные сессии
      if (draftOrderId) {
        ctx.session = ctx.session || {};
        ctx.session.draftOrderId = draftOrderId;
        ctx.session.addingProducts = addingProducts;
      }
      
      return;
    }

    // Проверяем, есть ли активная заявка на регистрацию
    const pendingRequest = await RegistrationRequest.findOne({
      where: {
        telegram_id: telegramId,
        status: 'pending'
      }
    });

    if (pendingRequest) {
      return ctx.reply(
        '⏳ Ваша заявка на регистрацию находится на рассмотрении.\n\n' +
        'Мы уведомим вас, как только она будет обработана.'
      );
    }

    // Начинаем процесс регистрации
    await ctx.reply(
      `👋 Добро пожаловать в систему закупок!\n\n` +
      `🆔 Ваш Telegram ID: ${telegramId}\n\n` +
      `Для регистрации в системе отправьте сообщение с информацией о себе:\n\n` +
      `📍 Если вы представляете ресторан, укажите:\n` +
      `• Название ресторана\n` +
      `• Форму деятельности (ИП/ООО)\n` +
      `• Адрес\n` +
      `• ИНН (по желанию)\n\n` +
      `📍 Если вы менеджер или закупщик, укажите:\n` +
      `• Вашу должность\n` +
      `• Контактный телефон\n\n` +
      `✏️ Просто напишите эту информацию в свободной форме, и наш менеджер обработает вашу заявку.`
    );

    // Сохраняем данные в сессии для дальнейшей обработки
    ctx.session = ctx.session || {};
    ctx.session.awaitingRegistrationInfo = true;
    ctx.session.registrationData = {
      telegram_id: telegramId,
      username,
      first_name: firstName,
      last_name: lastName
    };

    // Очищаем старый таймер, если был
    if (registrationReminders.has(telegramId)) {
      clearTimeout(registrationReminders.get(telegramId));
    }

    // Устанавливаем таймер напоминания через 30 секунд
    const reminder = setTimeout(async () => {
      try {
        // Проверяем, не зарегистрировался ли пользователь за это время
        const existingRequest = await RegistrationRequest.findOne({
          where: { telegram_id: telegramId }
        });

        if (!existingRequest) {
          await ctx.telegram.sendMessage(
            telegramId,
            '⏰ Напоминание!\n\n' +
            'Для завершения регистрации вам нужно отправить информацию о себе.\n\n' +
            '📝 Например:\n' +
            '• "Ресторан Эмбер, ООО, ул. Ленина 1"\n' +
            '• "Я менеджер, телефон +7900123456"\n\n' +
            'Просто напишите сообщение в свободной форме, и мы обработаем вашу заявку.',
            {
              reply_markup: {
                keyboard: [
                  ['❌ Отменить регистрацию']
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              }
            }
          );
          logger.info('Registration reminder sent', { telegramId, username });
        }
        
        // Удаляем таймер из хранилища
        registrationReminders.delete(telegramId);
      } catch (error) {
        logger.error('Error sending registration reminder:', error);
      }
    }, 30000); // 30 секунд

    registrationReminders.set(telegramId, reminder);

  } catch (error) {
    logger.error('Error in start command:', error);
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
};

// Обработчик выбора роли
const handleRoleSelection = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const role = ctx.callbackQuery.data.split(':')[1];
    ctx.session = ctx.session || {};
    
    logger.info('handleRoleSelection', {
      role,
      hasSession: !!ctx.session,
      hasRegistration: !!ctx.session.registration,
      sessionData: ctx.session
    });
    
    if (!ctx.session.registration) {
      return ctx.reply('❌ Сессия истекла. Используйте /start для начала регистрации.');
    }

    ctx.session.registration.role = role;

    if (role === 'restaurant') {
      // Для ресторанов показываем список доступных
      const restaurants = await Restaurant.findAll({
        where: { is_active: true },
        order: [['name', 'ASC']]
      });

      if (restaurants.length === 0) {
        // Нет ресторанов в базе
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('📝 Создать заявку на новый ресторан', 'reg_new_restaurant')],
          [Markup.button.callback('⬅️ Назад', 'reg_back_to_role')]
        ]);

        await ctx.editMessageText(
          '🏢 В системе пока нет зарегистрированных ресторанов.\n\n' +
          'Вы можете создать заявку на добавление нового ресторана.',
          keyboard
        );
      } else {
        // Показываем список ресторанов
        const buttons = restaurants.map(r => 
          [Markup.button.callback(r.name, `reg_restaurant:${r.id}`)]
        );
        
        buttons.push([Markup.button.callback('📝 Мой ресторан не в списке', 'reg_new_restaurant')]);
        buttons.push([Markup.button.callback('⬅️ Назад', 'reg_back_to_role')]);

        const keyboard = Markup.inlineKeyboard(buttons);

        await ctx.editMessageText(
          '🏢 Выберите ваш ресторан из списка:',
          keyboard
        );
      }
    } else {
      // Для других ролей сразу запрашиваем контакты
      await requestContactInfo(ctx, role);
    }

  } catch (error) {
    logger.error('Error in role selection:', error);
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
};

// Обработчик выбора ресторана
const handleRestaurantSelection = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const restaurantId = ctx.callbackQuery.data.split(':')[1];
    ctx.session = ctx.session || {};
    
    if (!ctx.session.registration) {
      return ctx.reply('❌ Сессия истекла. Используйте /start для начала регистрации.');
    }

    ctx.session.registration.restaurant_id = parseInt(restaurantId);

    // Завершаем регистрацию для пользователя ресторана
    await completeRegistration(ctx);

  } catch (error) {
    logger.error('Error in restaurant selection:', error);
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
};

// Обработчик создания заявки на новый ресторан
const handleNewRestaurantRequest = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    ctx.session = ctx.session || {};
    if (!ctx.session.registration) {
      return ctx.reply('❌ Сессия истекла. Используйте /start для начала регистрации.');
    }

    ctx.session.awaitingRestaurantName = true;

    await ctx.editMessageText(
      '📝 Введите название вашего ресторана:\n\n' +
      'Например: Ресторан "Венеция" или Кафе "У дома"'
    );

  } catch (error) {
    logger.error('Error in new restaurant request:', error);
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
};

// Запрос контактной информации
const requestContactInfo = async (ctx, role) => {
  const roleNames = {
    'restaurant': 'Ресторан',
    'manager': 'Менеджер-закупщик',
    'buyer': 'Закупщик'
  };

  ctx.session.awaitingContact = true;
  
  logger.info('requestContactInfo set awaitingContact', {
    role,
    awaitingContact: ctx.session.awaitingContact,
    sessionData: ctx.session
  });

  await ctx.editMessageText(
    `✅ Выбрана роль: ${roleNames[role]}\n\n` +
    `📞 Введите ваш контактный телефон:\n` +
    `Формат: +7 XXX XXX XX XX`
  );
};

// Завершение регистрации - теперь создаем пользователя со статусом pending
const completeRegistration = async (ctx) => {
  try {
    const regData = ctx.session.registration;
    logger.info('Starting completeRegistration', { regData });

    // Проверяем, существует ли уже пользователь
    let user = await User.findOne({ where: { telegram_id: regData.telegram_id } });
    
    if (user) {
      // Если пользователь существует, обновляем его статус на pending
      logger.info('User already exists, updating to pending status', { userId: user.id });
      user.role = 'pending';
      user.is_active = false;
      user.restaurant_id = null;
      await user.save();
    } else {
      // Создаем нового пользователя со статусом pending
      user = await User.create({
        telegram_id: regData.telegram_id,
        username: regData.username,
        first_name: regData.first_name,
        last_name: regData.last_name,
        role: 'pending', // Всегда создаем с ролью pending
        restaurant_id: null, // Не привязываем к ресторану до одобрения
        phone: regData.phone || null,
        is_active: false // Неактивен до одобрения
      });
      logger.info('New user created', { userId: user.id, telegramId: user.telegram_id });
    }

    // Создаем заявку на регистрацию
    const request = await RegistrationRequest.create({
      telegram_id: regData.telegram_id,
      username: regData.username,
      first_name: regData.first_name,
      last_name: regData.last_name,
      requested_role: regData.role,
      restaurant_id: regData.restaurant_id || null,
      restaurant_name: regData.restaurant_name || null,
      contact_phone: regData.phone || null,
      status: 'pending'
    });
    logger.info('Registration request created', { requestId: request.id });

    // Уведомляем администраторов
    const admins = await User.findAll({ where: { role: 'admin', is_active: true } });
    logger.info('Found admins for notification', { count: admins.length, adminIds: admins.map(a => a.telegram_id) });
    const roleNames = {
      'restaurant': 'Ресторан',
      'manager': 'Менеджер-закупщик',
      'buyer': 'Закупщик'
    };

    const notificationText = 
      `📋 <b>Новая заявка на регистрацию!</b>\n\n` +
      `👤 Имя: ${regData.first_name} ${regData.last_name || ''}\n` +
      `📱 Username: @${regData.username || 'не указан'}\n` +
      `🏷 Запрошенная роль: ${roleNames[regData.role]}\n` +
      `${regData.restaurant_id ? `🏢 Ресторан ID: ${regData.restaurant_id}\n` : ''}` +
      `${regData.restaurant_name ? `🏢 Новый ресторан: ${regData.restaurant_name}\n` : ''}` +
      `📞 Телефон: ${regData.phone || 'не указан'}\n\n` +
      `Для просмотра заявки используйте:\n` +
      `/user_${user.id}`;

    // Отправляем уведомления администраторам
    for (const admin of admins) {
      try {
        logger.info(`Sending notification to admin ${admin.telegram_id}`);
        await ctx.telegram.sendMessage(admin.telegram_id, notificationText, { 
          parse_mode: 'HTML' 
        });
        logger.info(`Successfully notified admin ${admin.telegram_id}`);
      } catch (err) {
        logger.error(`Failed to notify admin ${admin.telegram_id}:`, err);
      }
    }

    // Очищаем сессию
    ctx.session.registration = null;
    ctx.session.awaitingContact = false;
    ctx.session.awaitingRestaurantName = false;

    // Информируем пользователя
    await ctx.reply(
      '✅ <b>Заявка на регистрацию отправлена!</b>\n\n' +
      '⏳ Администратор рассмотрит вашу заявку в ближайшее время.\n' +
      '📨 Вы получите уведомление о результате рассмотрения.\n\n' +
      'Спасибо за ожидание!',
      { parse_mode: 'HTML' }
    );

  } catch (error) {
    logger.error('Error completing registration:', error);
    ctx.reply('❌ Произошла ошибка при регистрации. Попробуйте позже.');
  }
};

// Создание заявки на регистрацию (устаревшая функция - теперь все идет через completeRegistration)
const createRegistrationRequest = async (ctx) => {
  // Эта функция больше не используется напрямую
  // Вместо нее всегда вызываем completeRegistration
  return completeRegistration(ctx);
};

// Показ главного меню
const showMainMenu = async (ctx, user) => {
  const roleMenus = {
    'restaurant': [
      [Markup.button.callback('🛒 Создать заказ', 'menu_create_order')],
      [Markup.button.callback('📋 Мои заказы', 'menu_my_orders')],
      [Markup.button.callback('🔍 Поиск продуктов', 'menu_search_products')],
      [Markup.button.callback('🏢 Мои филиалы', 'menu_my_branches')],
      [Markup.button.callback('👤 Профиль', 'menu_profile')]
    ],
    'manager': [
      [Markup.button.callback('📋 Заявки', 'menu_orders')],
      [Markup.button.callback('👥 Управление пользователями', 'admin_users')],
      [Markup.button.callback('🏢 Рестораны', 'menu_restaurants')],
      [Markup.button.callback('🏭 Данные поставщика', 'edit_supplier_menu')],
      [Markup.button.callback('📄 Документы', 'documents_menu')],
      [Markup.button.callback('📊 Статистика', 'manager_statistics')],
      [Markup.button.callback('👤 Профиль', 'menu_profile')]
    ],
    'buyer': [
      [Markup.button.callback('📊 Консолидация', 'menu_consolidation')],
      [Markup.button.callback('🛒 Закупки', 'menu_purchases')],
      [Markup.button.callback('📈 Отчеты', 'menu_reports')],
      [Markup.button.callback('👤 Профиль', 'menu_profile')]
    ],
    'admin': [
      [Markup.button.callback('🔧 Панель администратора', 'admin_panel')],
      [Markup.button.callback('👥 Управление пользователями', 'admin_users')],
      [Markup.button.callback('🏢 Управление ресторанами', 'admin_restaurants')],
      [Markup.button.callback('🏭 Данные поставщика', 'edit_supplier_menu')],
      [Markup.button.callback('⚙️ Настройки системы', 'admin_settings')],
      [Markup.button.callback('📊 Статистика', 'admin_stats')],
      [Markup.button.callback('👤 Профиль', 'menu_profile')]
    ]
  };

  const roleNames = {
    'restaurant': 'Ресторан',
    'manager': 'Менеджер-закупщик',
    'buyer': 'Закупщик',
    'admin': 'Администратор'
  };

  // Inline клавиатура для основного меню
  const inlineKeyboard = Markup.inlineKeyboard(roleMenus[user.role] || []);

  // Постоянная клавиатура внизу экрана для всех ролей
  let replyKeyboard = null;
  if (user.role === 'admin') {
    replyKeyboard = Markup.keyboard([
      ['🔧 Панель администратора'],
      ['📋 Команды', '👤 Профиль']
    ]).resize();
  } else if (user.role === 'manager') {
    replyKeyboard = Markup.keyboard([
      ['📋 Меню менеджера'],
      ['📋 Заявки', '👥 Управление пользователями'],
      ['📊 Статистика']
    ]).resize();
  } else if (user.role === 'buyer') {
    replyKeyboard = Markup.keyboard([
      ['📊 Консолидация', '🛒 Закупки'],
      ['📈 Отчеты', '👤 Профиль']
    ]).resize();
  } else if (user.role === 'restaurant') {
    replyKeyboard = Markup.keyboard([
      ['🛒 Создать заказ', '📋 Мои заказы'],
      ['🔍 Поиск продуктов', '🏢 Мои филиалы'],
      ['👤 Профиль']
    ]).resize();
  }

  let welcomeText = `👋 Добро пожаловать, ${user.first_name}!\n\n`;
  welcomeText += `🏷 Ваша роль: ${roleNames[user.role]}\n`;
  
  if (user.restaurant) {
    welcomeText += `🏢 Ресторан: ${user.restaurant.name}\n`;
  }

  welcomeText += '\nВыберите действие:\n\n💡 Для создания заказа нажмите кнопку "🛒 Создать заказ"';

  // Отправляем сообщение с обеими клавиатурами
  if (replyKeyboard) {
    await ctx.reply(welcomeText, {
      ...inlineKeyboard,
      ...replyKeyboard
    });
  } else {
    await ctx.reply(welcomeText, inlineKeyboard);
  }
};

// Обработчик текстовых сообщений в процессе регистрации
const handleRegistrationText = async (ctx) => {
  if (!ctx.session) return false;
  
  logger.info('handleRegistrationText called', {
    hasSession: !!ctx.session,
    awaitingRegistrationInfo: ctx.session?.awaitingRegistrationInfo,
    text: ctx.message?.text
  });

  // Обработка новой регистрации - ожидание информации о пользователе
  if (ctx.session.awaitingRegistrationInfo) {
    const infoText = ctx.message.text.trim();
    
    // Обработка отмены регистрации
    if (infoText === '❌ Отменить регистрацию') {
      const telegramId = ctx.session.registrationData.telegram_id;
      
      // Отменяем таймер
      if (registrationReminders.has(telegramId)) {
        clearTimeout(registrationReminders.get(telegramId));
        registrationReminders.delete(telegramId);
      }
      
      // Очищаем сессию
      delete ctx.session.awaitingRegistrationInfo;
      delete ctx.session.registrationData;
      
      await ctx.reply(
        '❌ Регистрация отменена.\n\n' +
        'Если передумаете, используйте команду /start для начала регистрации.',
        { reply_markup: { remove_keyboard: true } }
      );
      
      return true;
    }
    
    if (infoText.length < 10) {
      await ctx.reply('❌ Пожалуйста, предоставьте больше информации о себе.');
      return true;
    }
    
    // Создаем заявку на регистрацию
    try {
      const { notificationService } = require('../services/NotificationService');
      
      // Отменяем таймер напоминания, так как пользователь отправил заявку
      const telegramId = ctx.session.registrationData.telegram_id;
      if (registrationReminders.has(telegramId)) {
        clearTimeout(registrationReminders.get(telegramId));
        registrationReminders.delete(telegramId);
      }
      
      const registrationRequest = await RegistrationRequest.create({
        telegram_id: ctx.session.registrationData.telegram_id,
        username: ctx.session.registrationData.username,
        first_name: ctx.session.registrationData.first_name,
        last_name: ctx.session.registrationData.last_name,
        status: 'pending',
        requested_role: 'unknown', // Менеджер определит роль
        contact_info: infoText,
        notes: infoText
      });
      
      // Отправляем уведомление менеджерам и администраторам
      const notificationMessage = 
        `🆕 <b>Новая заявка на регистрацию</b>\n\n` +
        `👤 Пользователь: ${ctx.session.registrationData.first_name || ''} ${ctx.session.registrationData.last_name || ''}\n` +
        `📱 Username: @${ctx.session.registrationData.username || 'не указан'}\n` +
        `🆔 Telegram ID: ${ctx.session.registrationData.telegram_id}\n\n` +
        `📝 <b>Информация от пользователя:</b>\n${infoText}\n\n` +
        `📅 Время: ${new Date().toLocaleString('ru-RU')}`;
      
      // Отправляем менеджерам
      await notificationService.notifyManagersWithMessage(notificationMessage, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ 
              text: '✅ Обработать заявку', 
              callback_data: `admin_reg_request:${registrationRequest.id}` 
            }]
          ]
        }
      });
      
      // Отправляем администраторам
      const admins = await User.findAll({
        where: { role: 'admin', is_active: true }
      });
      
      for (const admin of admins) {
        await notificationService.sendToTelegramId(admin.telegram_id, notificationMessage, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ 
                text: '✅ Обработать заявку', 
                callback_data: `admin_reg_request:${registrationRequest.id}` 
              }]
            ]
          }
        });
      }
      
      // Очищаем сессию
      delete ctx.session.awaitingRegistrationInfo;
      delete ctx.session.registrationData;
      
      await ctx.reply(
        '✅ <b>Ваша заявка принята!</b>\n\n' +
        '⏳ Менеджер рассмотрит вашу заявку в ближайшее время.\n' +
        '📬 Вы получите уведомление, как только заявка будет обработана.\n\n' +
        'Спасибо за регистрацию!',
        { parse_mode: 'HTML' }
      );
      
    } catch (error) {
      logger.error('Error creating registration request:', error);
      await ctx.reply('❌ Произошла ошибка при создании заявки. Попробуйте позже.');
    }
    
    return true;
  }

  return false;
};

// Обработчик команды /profile
const profileCommand = async (ctx) => {
  // Отвечаем на callback query если это callback
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
  
  if (!ctx.user) {
    return ctx.reply('❌ Вы не авторизованы. Используйте /start');
  }

  const user = ctx.user;
  const roleNames = {
    'restaurant': 'Ресторан',
    'manager': 'Менеджер-закупщик',
    'buyer': 'Закупщик',
    'admin': 'Администратор'
  };

  let profileText = '👤 **Ваш профиль**\n\n';
  profileText += `🆔 ID: ${user.id}\n`;
  profileText += `👤 Имя: ${user.first_name} ${user.last_name || ''}\n`;
  profileText += `📱 Username: @${user.username || 'не указан'}\n`;
  profileText += `📞 Телефон: ${user.phone || 'не указан'}\n`;
  profileText += `🏷 Роль: ${roleNames[user.role]}\n`;
  
  if (user.restaurant) {
    profileText += `🏢 Ресторан: ${user.restaurant.name}\n`;
  }

  profileText += `📅 Дата регистрации: ${user.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU') : 'не указана'}\n`;
  profileText += `✅ Статус: ${user.is_active ? 'Активен' : 'Заблокирован'}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Изменить телефон', 'profile_edit_phone')],
    [Markup.button.callback('⬅️ Главное меню', 'menu_main')]
  ]);

  await ctx.reply(profileText, {
    parse_mode: 'Markdown',
    ...keyboard
  });
};

module.exports = {
  startCommand,
  handleRegistrationText,
  profileCommand,
  showMainMenu
};