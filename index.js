require('dotenv').config();
const { Telegraf, session, Scenes } = require('telegraf');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const { initDatabase } = require('./src/database/init');
const googleSheetsService = require('./src/services/GoogleSheetsService');
const productMatcher = require('./src/services/ProductMatcher');
const { notificationService } = require('./src/services/NotificationService');
const { loggerMiddleware } = require('./src/middlewares/logger');
const { authMiddleware, requireRole, requireRestaurant, requireAdmin } = require('./src/middlewares/auth');
const { handleTelegramError, wrapScene } = require('./src/utils/errorHandler');
const healthCheckService = require('./src/services/HealthCheckService');
const monitoringService = require('./src/services/MonitoringService');

// Handlers
const registrationHandlers = require('./src/handlers/registration');
const restaurantHandlers = require('./src/handlers/restaurant');
const managerHandlers = require('./src/handlers/manager');
const procurementHandlers = require('./src/handlers/procurement');
const productSearchHandlers = require('./src/handlers/productSearch');
const settingsHandlers = require('./src/handlers/settings');
const orderHandlers = require('./src/handlers/orderHandlers');
const documentsHandlers = require('./src/handlers/documents');
const analyticsHandlers = require('./src/handlers/analytics');
const KeyboardHelper = require('./src/utils/keyboardHelper');
const orderSchedulerService = require('./src/services/OrderSchedulerService');
const emailSettings = require('./src/handlers/emailSettings');
const adminHandlers = require('./src/handlers/adminHandlers');
const draftOrderHandlers = require('./src/handlers/draftOrder');
const OrderService = require('./src/services/OrderService');
const draftOrderService = require('./src/services/DraftOrderService');
const moment = require('moment');

// Scenes
const addProductScene = require('./src/scenes/addProductScene');
const processOrderScene = require('./src/scenes/processOrderScene');
const purchaseScene = require('./src/scenes/purchaseScene');
const editSmtpScene = require('./src/scenes/editSmtpScene');
const addAdminScene = require('./src/scenes/addAdminScene');
const addRestaurantScene = require('./src/scenes/addRestaurantScene');
const editRestaurantScene = require('./src/scenes/editRestaurantScene');
const addScheduleScene = require('./src/scenes/addScheduleScene');

const bot = new Telegraf(config.botToken);
logger.info('Bot instance created successfully');

// Глобальная обработка ошибок
bot.catch((err, ctx) => {
  handleTelegramError(err, ctx);
});

// Создание сцен с обработкой ошибок
const stage = new Scenes.Stage([
  wrapScene(addProductScene), 
  wrapScene(processOrderScene), 
  wrapScene(purchaseScene), 
  wrapScene(editSmtpScene),
  wrapScene(addAdminScene),
  wrapScene(addRestaurantScene),
  wrapScene(editRestaurantScene),
  wrapScene(addScheduleScene)
]);

// Для graceful shutdown
let isShuttingDown = false;

// Инициализация базы данных и сервисов
Promise.all([
  initDatabase(),
  googleSheetsService.initialize()
]).then(async ([dbResult, sheetsResult]) => {
  logger.info('Database initialized successfully');
  if (sheetsResult) {
    logger.info('Google Sheets service initialized successfully');
  } else {
    logger.warn('Google Sheets service running in offline mode');
  }
  
  // Инициализация ProductMatcher после БД
  await productMatcher.initialize();
  logger.info('ProductMatcher initialized successfully');
  
  // Инициализация NotificationService
  notificationService.init(bot);
  logger.info('NotificationService initialized');
  
  // Запуск периодической отправки сводок об ошибках
  notificationService.startErrorSummarySchedule();
  
  // Инициализация OrderSchedulerService
  await orderSchedulerService.initialize();
  logger.info('OrderSchedulerService initialized');
  
  // Инициализация EmailService
  const emailService = require('./src/services/EmailService');
  const emailInitialized = await emailService.initialize();
  if (emailInitialized) {
    logger.info('EmailService initialized successfully');
  } else {
    logger.warn('EmailService not configured or failed to initialize');
  }
  
  // Запуск health check сервера
  const healthPort = process.env.HEALTH_CHECK_PORT || 3000;
  healthCheckService.start(healthPort);
  logger.info(`Health check server started on port ${healthPort}`);
  
}).catch(err => {
  logger.logError(err, { context: 'initialization', critical: true });
  process.exit(1);
});

// Session middleware для хранения данных пользователя
bot.use(session({
  getSessionKey: (ctx) => {
    if (!ctx.from) return null;
    return `${ctx.from.id}`;
  }
}));
bot.use(stage.middleware());

// Самый первый middleware для отладки
bot.use(async (ctx, next) => {
  logger.info('=== INCOMING UPDATE ===', {
    updateType: ctx.updateType,
    from: ctx.from,
    message: ctx.message?.text,
    callback: ctx.callbackQuery?.data,
    timestamp: new Date().toISOString()
  });
  return next();
});

// Middleware для логирования и мониторинга
bot.use(authMiddleware);
bot.use(loggerMiddleware);

// Debug middleware для проверки сессии и сцен
bot.use(async (ctx, next) => {
  if (ctx.message?.text && !ctx.message.text.startsWith('/')) {
    logger.info('Debug: Text message in middleware', {
      text: ctx.message.text,
      userId: ctx.from.id,
      hasSession: !!ctx.session,
      awaitingContact: ctx.session?.awaitingContact,
      sessionKeys: ctx.session ? Object.keys(ctx.session) : [],
      currentScene: ctx.scene?.current?.id,
      sceneState: ctx.scene?.state
    });
  }
  return next();
});

// Команды регистрации и профиля
bot.command('start', registrationHandlers.startCommand);
bot.command('refresh', registrationHandlers.startCommand);
bot.command('profile', registrationHandlers.profileCommand);
bot.command('fixmenu', async (ctx) => {
  logger.info('fixmenu command received', {
    userId: ctx.from?.id,
    username: ctx.from?.username
  });
  
  if (!ctx.user) {
    return ctx.reply('❌ Необходима авторизация');
  }
  
  // Отправляем правильное меню для роли пользователя
  const { showMainMenu } = require('./src/handlers/registration');
  await showMainMenu(ctx, ctx.user);
  
  return ctx.reply('✅ Меню обновлено!');
});

// Простая тестовая команда
bot.command('test', async (ctx) => {
  logger.info('Test command received', {
    userId: ctx.from?.id,
    username: ctx.from?.username
  });
  return ctx.reply('✅ Бот работает!');
});

// Команда для сброса кэша пользователя
bot.command('reset', async (ctx) => {
  logger.info('Reset command received', {
    userId: ctx.from?.id,
    username: ctx.from?.username
  });
  
  // Очищаем сессию
  ctx.session = {};
  
  // Перезагружаем данные пользователя из БД
  const { User, Restaurant } = require('./src/database/models');
  const user = await User.findOne({
    where: { telegram_id: ctx.from.id },
    include: [{
      model: Restaurant,
      as: 'restaurant'
    }]
  });
  
  if (!user) {
    return ctx.reply('❌ Пользователь не найден в базе данных');
  }
  
  // Устанавливаем правильные данные в контекст
  ctx.user = user;
  
  // Показываем правильное меню
  const { showMainMenu } = require('./src/handlers/registration');
  await showMainMenu(ctx, user);
  
  return ctx.reply(`✅ Данные сброшены!\n\nВаша роль: ${user.role}\nРесторан: ${user.restaurant?.name || 'Не указан'}`);
});

// Команда для проверки конкретного пользователя
bot.command('checkuser', async (ctx) => {
  const telegramId = 6968529444; // ID пользователя Сон
  
  try {
    // Пробуем отправить сообщение
    await bot.telegram.sendMessage(telegramId, 
      '🔧 Тестовое сообщение от бота.\n\n' +
      'Если вы видите это сообщение, значит бот может вам отправлять сообщения.\n\n' +
      'Попробуйте отправить команду /start'
    );
    
    return ctx.reply('✅ Тестовое сообщение отправлено пользователю Сон');
  } catch (error) {
    logger.error('Error sending message to user:', error);
    return ctx.reply(`❌ Ошибка отправки сообщения: ${error.message}`);
  }
});

// Команда для тестирования уведомлений о регистрации
bot.command('testnotify', requireRole(['admin', 'manager']), async (ctx) => {
  try {
    const { notificationService } = require('./src/services/NotificationService');
    const { User } = require('./src/database/models');
    const { Op } = require('sequelize');
    
    // Получаем всех админов и менеджеров кроме текущего пользователя
    const otherAdminsAndManagers = await User.findAll({
      where: {
        role: { [Op.in]: ['admin', 'manager'] },
        is_active: true,
        id: { [Op.ne]: ctx.user.id }
      }
    });
    
    const testMessage = 
      `🧪 <b>Тестовое уведомление</b>\n\n` +
      `Это тестовое сообщение для проверки синхронизации.\n` +
      `Отправил: ${ctx.user.first_name || ctx.user.username}\n` +
      `Время: ${new Date().toLocaleString('ru-RU')}`;
    
    await Promise.all(
      otherAdminsAndManagers.map(user => 
        notificationService.sendToTelegramId(user.telegram_id, testMessage, {
          parse_mode: 'HTML'
        })
      )
    );
    
    return ctx.reply(`✅ Тестовые уведомления отправлены ${otherAdminsAndManagers.length} пользователям`);
  } catch (error) {
    logger.error('Error in testnotify:', error);
    return ctx.reply(`❌ Ошибка: ${error.message}`);
  }
});

// Команда отмены для выхода из любой сцены
bot.command('cancel', async (ctx) => {
  if (ctx.scene && ctx.scene.current) {
    await ctx.scene.leave();
    await ctx.reply('❌ Операция отменена');
    
    // Показываем главное меню
    const user = ctx.session?.user || ctx.user;
    if (user) {
      return registrationHandlers.showMainMenu(ctx, user);
    }
  } else {
    await ctx.reply('❌ Нет активной операции для отмены');
  }
});

// Команда help - показывает доступные команды
bot.command('help', async (ctx) => {
  if (!ctx.user) {
    return ctx.reply('👋 Вы не зарегистрированы в системе.\n\nИспользуйте команду /start для регистрации.');
  }
  
  // Показываем доступные команды в зависимости от роли пользователя
  if (ctx.user.role === 'admin') {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔧 Панель администратора', callback_data: 'admin_panel' },
            { text: '👤 Профиль', callback_data: 'menu_profile' }
          ],
          [
            { text: '👥 Управление пользователями', callback_data: 'admin_users' },
            { text: '🏢 Управление ресторанами', callback_data: 'admin_restaurants' }
          ],
          [
            { text: '⚙️ Настройки системы', callback_data: 'admin_settings' },
            { text: '📊 Статистика', callback_data: 'admin_stats' }
          ],
          [
            { text: '💾 Резервная копия БД', callback_data: 'admin_backup' },
            { text: '📋 Логи системы', callback_data: 'admin_logs' }
          ]
        ]
      }
    };
    return ctx.reply('🔧 <b>Доступные команды администратора:</b>', { parse_mode: 'HTML', ...keyboard });
  } else if (ctx.user.role === 'manager') {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 Заявки', callback_data: 'menu_orders' },
            { text: '👥 Управление пользователями', callback_data: 'admin_users' }
          ],
          [
            { text: '🏢 Рестораны', callback_data: 'menu_restaurants' },
            { text: '📊 Статистика', callback_data: 'manager_statistics' }
          ],
          [
            { text: '📊 Аналитика', callback_data: 'manager_analytics' },
            { text: '📄 Документы', callback_data: 'manager_documents' }
          ],
          [
            { text: '📧 Email настройки', callback_data: 'manager_email_settings' },
            { text: '👤 Профиль', callback_data: 'menu_profile' }
          ]
        ]
      }
    };
    return ctx.reply('📋 <b>Доступные команды менеджера:</b>', { parse_mode: 'HTML', ...keyboard });
  } else if (ctx.user.role === 'buyer') {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📦 Консолидация', callback_data: 'menu_consolidation' },
            { text: '🛒 Закупки', callback_data: 'menu_purchases' }
          ],
          [
            { text: '📊 Отчеты', callback_data: 'menu_reports' },
            { text: '👤 Профиль', callback_data: 'menu_profile' }
          ]
        ]
      }
    };
    return ctx.reply('🛒 <b>Доступные команды закупщика:</b>', { parse_mode: 'HTML', ...keyboard });
  } else if (ctx.user.role === 'restaurant') {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔍 Поиск продуктов', callback_data: 'menu_search_products' },
            { text: '📝 Создать заказ', callback_data: 'menu_create_order' }
          ],
          [
            { text: '📋 Мои заказы', callback_data: 'menu_my_orders' },
            { text: '📋 Черновик', callback_data: 'draft_view' }
          ],
          [
            { text: '👤 Профиль', callback_data: 'menu_profile' }
          ]
        ]
      }
    };
    return ctx.reply('🏢 <b>Доступные команды ресторана:</b>', { parse_mode: 'HTML', ...keyboard });
  }
});

// Регистрация теперь проходит через текстовые сообщения

bot.command('restaurant_menu', requireRole('restaurant'), restaurantHandlers.menu);
bot.command('create_order', [requireRole('restaurant'), requireRestaurant], restaurantHandlers.createOrder);
bot.command('my_orders', requireRole('restaurant'), restaurantHandlers.myOrders);
bot.command('draft', requireRole('restaurant'), async (ctx) => {
  try {
    const draft = await draftOrderService.getCurrentDraft(
      ctx.user.id,
      ctx.session?.draftOrderId
    );
    
    // Сохраняем ID в сессии
    ctx.session = ctx.session || {};
    ctx.session.draftOrderId = draft.id;
    
    if (!draft.draftOrderItems || draft.draftOrderItems.length === 0) {
      return ctx.reply('📋 Заказ пуст');
    }
    
    let message = '📋 <b>Текущий заказ:</b>\n';
    message += `📅 Отправка: ${moment(draft.scheduled_for).format('DD.MM.YYYY HH:mm')}\n\n`;
    
    const confirmed = draft.draftOrderItems.filter(i => i.status === 'matched' || i.status === 'confirmed');
    const unmatched = draft.draftOrderItems.filter(i => i.status === 'unmatched');
    
    if (confirmed.length > 0) {
      message += '✅ <b>Подтвержденные позиции:</b>\n';
      confirmed.forEach((item, index) => {
        message += `${index + 1}. ${item.product_name} - ${item.quantity} ${item.unit}\n`;
      });
      message += '\n';
    }
    
    if (unmatched.length > 0) {
      message += '❓ <b>Требуют уточнения:</b>\n';
      unmatched.forEach((item, index) => {
        message += `${index + 1}. ${item.original_name} - ${item.quantity} ${item.unit}\n`;
      });
    }
    
    message += `\n📦 Всего позиций: ${draft.draftOrderItems.length}`;
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ Редактировать', callback_data: 'draft_edit' }],
          [{ text: '➕ Добавить продукты', callback_data: 'draft_add_more' }],
          [{ text: '🔙 Назад', callback_data: 'menu_main' }]
        ]
      }
    };
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error viewing draft:', error);
    ctx.reply('❌ Произошла ошибка при загрузке черновика');
  }
});

bot.command('manager_menu', requireRole('manager'), managerHandlers.menu);
bot.command('pending_orders', requireRole('manager'), managerHandlers.pendingOrders);
bot.command('approve_order', requireRole('manager'), managerHandlers.approveOrder);

// Обработчики кнопок для менеджера
bot.action('pending_orders', requireRole('manager'), managerHandlers.pendingOrders);
bot.action('consolidate_orders', requireRole(['manager', 'buyer']), procurementHandlers.consolidateOrders);
bot.action('process_purchased_orders', requireRole('manager'), async (ctx) => {
  await ctx.answerCbQuery('Загружаем заказы...');
  // Показываем заказы со статусом 'purchased' для обработки
  return managerHandlers.processPurchasedOrders(ctx);
});

bot.command('procurement_menu', requireRole('buyer'), procurementHandlers.menu);
bot.command('consolidated_orders', requireRole('buyer'), procurementHandlers.consolidatedOrders);
bot.command('consolidated_list', requireRole('buyer'), procurementHandlers.consolidatedList);
bot.command('consolidate', requireRole('buyer'), procurementHandlers.consolidatedList);
bot.command('mark_purchased', requireRole('buyer'), procurementHandlers.markPurchased);
bot.command(/^purchase_(.+)$/, requireRole('buyer'), procurementHandlers.purchaseProductCommand);
bot.command(/^continue_purchase_(\d+)$/, requireRole('buyer'), procurementHandlers.continuePurchase);

// Команда для просмотра заявки на регистрацию
bot.command(/^admin_reg_request_(\d+)$/, requireRole(['manager', 'admin']), async (ctx) => {
  const requestId = ctx.match[1];
  // Симулируем callback для обработки через adminHandlers
  ctx.callbackQuery = {
    data: `admin_reg_request:${requestId}`,
    answer: async () => {},
    editMessageText: ctx.editMessageText ? ctx.editMessageText.bind(ctx) : ctx.reply.bind(ctx),
    editMessageReplyMarkup: ctx.editMessageReplyMarkup ? ctx.editMessageReplyMarkup.bind(ctx) : async () => {}
  };
  ctx.answerCbQuery = async () => {};
  return adminHandlers.handleAdminCallbacks(ctx);
});

// Команды для поиска продуктов
bot.command('search', productSearchHandlers.startProductSearch);

// Команды для настроек автоотправки
bot.command('set_send_time', settingsHandlers.setAutoSendTime);
bot.command('send_now', settingsHandlers.sendOrdersNow);
bot.command('view_settings', settingsHandlers.viewSettings);

// Обработчики callback запросов для поиска
bot.action(/^select_category:(.+)$/, productSearchHandlers.handleCategorySelection);
bot.action(/^select_product:(.+)$/, productSearchHandlers.handleProductSelection);
bot.action(/^quick_qty:(.+):(.+):(.+)$/, productSearchHandlers.handleQuickQuantity);
bot.action(/^manual_qty:(.+)$/, productSearchHandlers.handleManualQuantity);
bot.action(/^confirm:(.+):(.+):(.+)$/, productSearchHandlers.handleConfirmation);
bot.action('search_by_name', productSearchHandlers.handleSearchByName);
bot.action('cancel_selection', productSearchHandlers.handleCancel);

// Обработчики callback для настроек
bot.action(/^set_time_restaurant:(.+)$/, settingsHandlers.handleRestaurantSelection);
bot.action(/^set_time:(.+)$/, settingsHandlers.handleTimeSelection);
bot.action(/^set_time_custom:(.+)$/, settingsHandlers.handleCustomTimeRequest);
bot.action(/^toggle_auto_send:(.+)$/, settingsHandlers.handleToggleAutoSend);
bot.action(/^send_now:(.+)$/, settingsHandlers.handleSendNow);
bot.action('cancel_settings', settingsHandlers.handleCancelSettings);

// Обработчики callback для меню
bot.action('menu_new_orders', requireRole('manager'), managerHandlers.pendingOrders);
bot.action('menu_processed_orders', requireRole('manager'), managerHandlers.processedOrders);
bot.action('menu_restaurants', requireRole('manager'), managerHandlers.restaurantsList);
bot.action(/^manager_restaurant:(\d+)$/, requireRole('manager'), managerHandlers.handleManagerCallbacks);
bot.action(/^manager_branches:(\d+)$/, requireRole('manager'), managerHandlers.handleManagerCallbacks);
bot.action(/^manager_edit_restaurant:(\d+)$/, requireRole('manager'), managerHandlers.handleManagerCallbacks);
bot.action('manager_create_restaurant', requireRole('manager'), managerHandlers.handleManagerCallbacks);
bot.action(/^edit_rest_/, requireRole('manager'), managerHandlers.handleManagerCallbacks);
bot.action(/^manager_restaurant_users:(\d+)$/, requireRole('manager'), managerHandlers.handleManagerCallbacks);
bot.action(/^manager_restaurant_stats:(\d+)$/, requireRole('manager'), managerHandlers.handleManagerCallbacks);
bot.action(/^manager_restaurant_schedule:(\d+)$/, requireRole(['manager', 'admin']), managerHandlers.handleManagerCallbacks);
bot.action(/^manager_schedule_/, requireRole(['manager', 'admin']), managerHandlers.handleManagerCallbacks);
bot.action(/^manager_edit_day_/, requireRole(['manager', 'admin']), managerHandlers.handleManagerCallbacks);
bot.action(/^manager_save_schedule_days/, requireRole(['manager', 'admin']), managerHandlers.handleManagerCallbacks);
bot.action(/^manager_cancel_schedule_edit/, requireRole(['manager', 'admin']), managerHandlers.handleManagerCallbacks);
bot.action(/^manager_confirm_delete_schedule_/, requireRole(['manager', 'admin']), managerHandlers.handleManagerCallbacks);
bot.action('menu_profile', registrationHandlers.profileCommand);
bot.action('menu_search_products', requireRole('restaurant'), restaurantHandlers.searchProducts);
bot.action('menu_create_order', requireRole('restaurant'), draftOrderHandlers.startAddingProducts);
bot.action('menu_my_orders', requireRole('restaurant'), restaurantHandlers.myOrders);
bot.action('my_orders', requireRole('restaurant'), restaurantHandlers.myOrders);
bot.action('menu_consolidation', requireRole('buyer'), procurementHandlers.consolidatedList);
bot.action('menu_purchases', requireRole('buyer'), procurementHandlers.purchases);
bot.action('menu_reports', requireRole('buyer'), procurementHandlers.reports);

// Обработчики для подменю заявок
bot.action('menu_orders', requireRole('manager'), managerHandlers.ordersSubmenu);
bot.action('orders_new', requireRole('manager'), managerHandlers.pendingOrders);
bot.action('orders_back', requireRole('manager'), managerHandlers.ordersSubmenu);
bot.action('orders_processing', requireRole('manager'), managerHandlers.processingOrders);
bot.action('orders_approved', requireRole('manager'), managerHandlers.approvedOrders);
bot.action('orders_rejected', requireRole('manager'), managerHandlers.rejectedOrders);
bot.action('manager_consolidated', requireRole('manager'), managerHandlers.consolidatedOrdersList);
bot.action('manager_export_consolidated', requireRole('manager'), managerHandlers.exportConsolidated);

// Обработчики для филиалов
const { handleBranchAddressText, manageBranches, handleAddBranch, handleBranchCallbacks } = require('./src/handlers/restaurantBranch');
const { formatInTimezone } = require('./src/utils/timezone');

// Новый обработчик для выбора филиала при создании заказа
bot.action(/^create_order_branch:(\d+)$/, requireRole('restaurant'), async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const branchId = parseInt(ctx.match[1]);
    const user = ctx.user;
    const restaurantId = user.restaurant_id;
    
    // Получаем или создаем черновик для выбранного филиала
    const draft = await draftOrderService.getOrCreateDraftOrder(restaurantId, user.id, branchId);
    
    // Сохраняем информацию в сессии
    ctx.session = ctx.session || {};
    ctx.session.addingProducts = true;
    ctx.session.draftOrderId = draft.id;
    ctx.session.selectedBranchId = branchId;
    
    // Формируем сообщение
    const scheduledTime = formatInTimezone(draft.scheduled_for);
    let message = '🛒 <b>Добавление продуктов в заказ</b>\n\n';
    message += `📅 Заказ будет отправлен: ${scheduledTime}\n\n`;
    
    if (draft.draftOrderItems && draft.draftOrderItems.length > 0) {
      message += `📦 В заказе уже есть ${draft.draftOrderItems.length} позиций\n\n`;
    }
    
    message += '📝 Отправьте список продуктов в любом формате:\n\n';
    message += '<b>Примеры:</b>\n';
    message += '<code>Картофель 50 кг</code>\n';
    message += '<code>Морковь - 30 - кг</code>\n';
    message += '<code>Лук 20 кг\nПомидоры 15 кг</code>\n\n';
    message += '💡 <i>Можете отправлять по одному продукту или списком</i>\n';
    message += '💡 <i>Все продукты будут добавлены в один заказ</i>\n\n';
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔍 Поиск в каталоге', callback_data: 'draft_search' }],
          [{ text: '📋 Посмотреть текущий заказ', callback_data: 'draft_view' }],
          [{ text: '🏢 Сменить филиал', callback_data: 'menu_create_order' }],
          [{ text: '❌ Отмена', callback_data: 'draft_cancel' }]
        ]
      }
    };
    
    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      ...keyboard
    });
    
  } catch (error) {
    logger.error('Error creating order for branch:', error);
    await ctx.reply('❌ Ошибка при создании заказа');
  }
});

// Старый обработчик оставляем для совместимости
bot.action(/^select_branch_for_order:(\d+)$/, requireRole('restaurant'), async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const branchId = parseInt(ctx.match[1]);
    ctx.session = ctx.session || {};
    ctx.session.selectedBranchId = branchId;
    
    // Продолжаем создание заказа
    if (ctx.session.pendingAction === 'create_order') {
      delete ctx.session.pendingAction;
      return draftOrderHandlers.startAddingProducts(ctx);
    }
    
    await ctx.reply('✅ Филиал выбран');
  } catch (error) {
    logger.error('Error selecting branch:', error);
    await ctx.reply('❌ Ошибка при выборе филиала');
  }
});

bot.action('cancel_branch_selection', async (ctx) => {
  await ctx.answerCbQuery('Отменено');
  delete ctx.session?.pendingAction;
  delete ctx.session?.selectedBranchId;
  await ctx.editMessageText('❌ Выбор филиала отменен');
});

// Управление филиалами для ресторана
bot.action('menu_my_branches', requireRole('restaurant'), async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const user = ctx.user || ctx.session?.user;
    
    if (!user || !user.restaurant_id) {
      return ctx.reply('❌ Вы не привязаны к ресторану');
    }
    
    const { RestaurantBranch } = require('./src/database/models');
    const branches = await RestaurantBranch.findAll({
      where: { 
        restaurantId: user.restaurant_id,
        isActive: true
      },
      order: [
        ['isMain', 'DESC'],
        ['address', 'ASC']
      ]
    });
    
    let message = '🏢 <b>Мои филиалы:</b>\n\n';
    
    if (branches.length === 0) {
      message += '<i>У вас еще нет филиалов</i>\n';
    } else {
      branches.forEach((branch, index) => {
        message += `${index + 1}. 📍 ${branch.address}`;
        if (branch.isMain) message += ' <b>(Главный)</b>';
        message += '\n';
      });
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Добавить филиал', callback_data: 'add_my_branch' }],
          [{ text: '🔙 Главное меню', callback_data: 'menu_main' }]
        ]
      }
    };
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error showing branches:', error);
    await ctx.reply('❌ Ошибка при загрузке филиалов');
  }
});

bot.action('add_my_branch', requireRole('restaurant'), handleAddBranch);

// Обработчики филиалов для менеджера
bot.action(/^manager_add_branch:(\d+)$/, requireRole('manager'), handleBranchCallbacks);
bot.action(/^manager_edit_branches:(\d+)$/, requireRole('manager'), handleBranchCallbacks);
bot.action(/^edit_branch:(\d+)$/, requireRole(['manager', 'admin']), handleBranchCallbacks);
bot.action(/^toggle_branch:(\d+)$/, requireRole(['manager', 'admin']), handleBranchCallbacks);
bot.action(/^set_main_branch:(\d+)$/, requireRole(['manager', 'admin']), handleBranchCallbacks);

// Новые callback'и для менеджера
bot.action('manager_processing', requireRole('manager'), managerHandlers.processingOrders);
bot.action('manager_approved', requireRole('manager'), managerHandlers.approvedOrders);
bot.action('manager_statistics', requireRole('manager'), managerHandlers.statistics);
bot.action('manager_rejected', requireRole('manager'), managerHandlers.rejectedOrders);
bot.action('manager_analytics', requireRole('manager'), analyticsHandlers.managerDashboard);
bot.action('manager_email_settings', requireRole('manager'), emailSettings.showSettings);
bot.action('menu_main', async (ctx) => {
  await ctx.answerCbQuery();
  if (ctx.user) {
    return registrationHandlers.showMainMenu(ctx, ctx.user);
  } else {
    return ctx.reply('Используйте /start для начала работы');
  }
});

bot.action('menu_back', async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.user) {
    return ctx.reply('Необходима авторизация. Используйте /start');
  }
  
  // Возвращаем в соответствующее меню в зависимости от роли
  if (ctx.user.role === 'admin') {
    return adminHandlers.adminPanel(ctx);
  } else if (ctx.user.role === 'manager') {
    // Показываем inline меню менеджера
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Заявки', callback_data: 'menu_orders' }],
          [{ text: '👥 Управление пользователями', callback_data: 'admin_users' }],
          [{ text: '🏢 Рестораны', callback_data: 'menu_restaurants' }],
          [{ text: '📊 Статистика', callback_data: 'manager_statistics' }],
          [{ text: '📧 Email настройки', callback_data: 'manager_email_settings' }]
        ]
      }
    };
    
    await ctx.editMessageText(
      '👔 <b>Меню менеджера</b>\n\n' +
      'Выберите раздел:',
      { parse_mode: 'HTML', ...keyboard }
    );
  } else {
    return registrationHandlers.showMainMenu(ctx, ctx.user);
  }
});

// Обработчики для подменю закупок
bot.action('purchases_active', requireRole('buyer'), procurementHandlers.activePurchases);
bot.action('purchases_completed', requireRole('buyer'), procurementHandlers.completedPurchases);
bot.action('purchases_stats', requireRole('buyer'), procurementHandlers.purchaseStatistics);

// Обработчики для отчетов
bot.action('report_price_history', requireRole('buyer'), analyticsHandlers.priceHistory);
bot.action('report_profitability', requireRole('buyer'), analyticsHandlers.profitabilityReport);
bot.action('report_order_analysis', requireRole('buyer'), analyticsHandlers.orderCostAnalysis);

// Обработчики для функций закупщика (buyerHandlers)
const buyerHandlers = require('./src/handlers/buyerHandlers');

// Обработчики для новой системы закупок
bot.action('start_purchase_session', requireRole('buyer'), procurementHandlers.startPurchaseSession);
bot.action('continue_purchase_session', requireRole('buyer'), procurementHandlers.continuePurchaseSession);
bot.action('cancel_purchase_session', requireRole('buyer'), async (ctx) => {
  await ctx.answerCbQuery('Отмена закупки...');
  // TODO: реализовать отмену закупки
  ctx.reply('❌ Закупка отменена');
});
bot.action('show_purchase_list', requireRole('buyer'), async (ctx) => {
  await ctx.answerCbQuery('Загружаем список...');
  
  try {
    const { Purchase, PurchaseItem } = require('./src/database/models');
    
    // Находим активную закупку
    const purchase = await Purchase.findOne({
      where: {
        buyer_id: ctx.user.id,
        status: ['pending', 'in_progress'],
        product_name: 'Закупочная сессия'
      }
    });
    
    if (!purchase) {
      return ctx.reply('❌ Активная закупка не найдена');
    }
    
    // Получаем все товары в закупке
    const items = await PurchaseItem.findAll({
      where: { purchase_id: purchase.id },
      order: [['product_name', 'ASC']]
    });
    
    if (items.length === 0) {
      return ctx.reply('📋 Товаров в закупке не найдено');
    }
    
    // Формируем сообщение со списком и создаем кнопки
    let message = '📋 <b>Список товаров в закупке</b>\n\n';
    const keyboard = [];
    let currentRow = [];
    
    items.forEach((item, index) => {
      const status = item.status === 'completed' ? '✅' : '⏳';
      const price = item.purchased_quantity > 0 ? ` - ${item.purchase_price}₽` : '';
      
      message += `${status} <b>${item.product_name}</b>\n`;
      message += `   📏 ${item.required_quantity} ${item.unit}`;
      if (item.purchased_quantity > 0) {
        message += ` → ${item.purchased_quantity} ${item.unit}${price}`;
      }
      message += '\n\n';
      
      // Добавляем кнопку для товара (только если не завершен)
      if (item.status !== 'completed') {
        const buttonText = `📦 ${item.product_name.length > 15 ? item.product_name.substring(0, 15) + '...' : item.product_name}`;
        currentRow.push({ text: buttonText, callback_data: `purchase_item:${item.id}` });
        
        // Добавляем ряд, если в нем 2 кнопки, или это последний элемент
        if (currentRow.length === 2 || index === items.length - 1) {
          keyboard.push([...currentRow]);
          currentRow = [];
        }
      }
    });
    
    // Добавляем управляющие кнопки
    keyboard.push([
      { text: '🔄 Обновить', callback_data: 'show_purchase_list' },
      { text: '↩️ Назад к закупке', callback_data: 'continue_purchase_session' }
    ]);
    
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    });
    
  } catch (error) {
    logger.error('Error in show_purchase_list:', error);
    ctx.reply('❌ Произошла ошибка при загрузке списка товаров');
  }
});
bot.action('confirm_finish_purchase', requireRole('buyer'), procurementHandlers.confirmFinishPurchase);

// Обработчики для сборки корзин
bot.action(/^start_packing:(\d+)$/, requireRole('buyer'), procurementHandlers.startPacking);
bot.action(/^mark_packed:(\d+)$/, requireRole('buyer'), procurementHandlers.markPacked);
bot.action('back_to_packing_list', requireRole('buyer'), procurementHandlers.backToPackingList);
bot.action(/^finish_all_packing:(\d+)$/, requireRole('buyer'), procurementHandlers.finishAllPacking);
bot.action(/^refresh_packing:(\d+)$/, requireRole('buyer'), procurementHandlers.backToPackingList);

// Обработчик выбора товара из списка для закупки
bot.action(/^purchase_item:(\d+)$/, requireRole('buyer'), async (ctx) => {
  const itemId = parseInt(ctx.match[1]);
  await ctx.answerCbQuery('Выбираем товар...');
  
  try {
    const { PurchaseItem } = require('./src/database/models');
    
    // Находим товар
    const item = await PurchaseItem.findByPk(itemId);
    if (!item || item.status === 'completed') {
      return ctx.reply('❌ Товар не найден или уже закуплен');
    }
    
    // Устанавливаем сессию для ввода данных о закупке
    ctx.session = ctx.session || {};
    ctx.session.awaitingPurchaseInput = true;
    ctx.session.currentPurchaseItemId = itemId;
    
    await ctx.reply(
      `🛒 <b>Закупка товара</b>\n\n` +
      `📦 <b>${item.product_name}</b>\n` +
      `📏 Необходимо: ${item.required_quantity} ${item.unit}\n\n` +
      `Введите через пробел:\n` +
      `• Количество закупленного товара\n` +
      `• Общую сумму закупки\n\n` +
      `Пример: 10 2500`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⏭️ Пропустить товар', callback_data: `skip_purchase_item:${itemId}` }],
            [{ text: '📋 Список товаров', callback_data: 'show_purchase_list' }],
            [{ text: '❌ Отменить', callback_data: 'continue_purchase_session' }]
          ]
        }
      }
    );
    
  } catch (error) {
    logger.error('Error in purchase_item:', error);
    ctx.reply('❌ Произошла ошибка при выборе товара');
  }
});
bot.action(/^skip_purchase_item:(\d+)$/, requireRole('buyer'), async (ctx) => {
  const itemId = ctx.match[1];
  await ctx.answerCbQuery('Пропускаем товар...');
  // TODO: реализовать пропуск товара
  ctx.reply('⏭️ Товар пропущен');
});

// Обработчик для начала закупки конкретного продукта (старый метод)
bot.action(/^purchase_start:(.+)$/, requireRole('buyer'), async (ctx) => {
  const consolidatedProductId = ctx.match[1];
  await ctx.answerCbQuery('Начинаем закупку...');
  
  // Вызываем сцену закупки
  const consolidated = await OrderService.getConsolidatedOrders();
  const product = consolidated.find(item => item.consolidated_product_id === consolidatedProductId);
  
  if (!product) {
    return ctx.reply('❌ Продукт не найден в консолидированном списке');
  }
  
  return ctx.scene.enter('purchase_product', {
    consolidatedProductId,
    consolidatedProduct: product
  });
});

bot.action('buyer_start_purchase', requireRole('buyer'), buyerHandlers.handleCallbacks);
bot.action('buyer_next_product', requireRole('buyer'), buyerHandlers.handleCallbacks);
bot.action('buyer_show_list', requireRole('buyer'), buyerHandlers.handleCallbacks);
bot.action('buyer_start_packing', requireRole('buyer'), buyerHandlers.handleCallbacks);
bot.action('buyer_next_pack_item', requireRole('buyer'), buyerHandlers.handleCallbacks);
bot.action('buyer_skip_product', requireRole('buyer'), buyerHandlers.handleCallbacks);
bot.action('buyer_cancel_purchase', requireRole('buyer'), buyerHandlers.handleCallbacks);
bot.action('buyer_cancel_packing', requireRole('buyer'), buyerHandlers.handleCallbacks);
bot.action('buyer_export_consolidated', requireRole('buyer'), buyerHandlers.handleCallbacks);
bot.action(/^buyer_purchase_exact:/, requireRole('buyer'), buyerHandlers.handleCallbacks);
bot.action(/^buyer_pack_exact:/, requireRole('buyer'), buyerHandlers.handleCallbacks);
bot.action(/^buyer_pack_zero/, requireRole('buyer'), buyerHandlers.handleCallbacks);

// Обработчики для кнопок менеджера
bot.action('manager_analytics', requireRole('manager'), async (ctx) => {
  await ctx.answerCbQuery();
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📈 История цен', callback_data: 'manager_price_history' }],
        [{ text: '💰 Анализ заказов', callback_data: 'manager_order_analysis' }],
        [{ text: '📊 Отчет по продуктам', callback_data: 'manager_product_report' }],
        [{ text: '🔙 Назад', callback_data: 'menu_main' }]
      ]
    }
  };
  await ctx.editMessageText(
    '📊 <b>Аналитика</b>\n\nВыберите тип отчета:',
    { parse_mode: 'HTML', ...keyboard }
  );
});

bot.action('manager_documents', requireRole('manager'), documentsHandlers.documentsMenu);
bot.action('manager_email_settings', requireRole('manager'), emailSettings.emailSettingsMenu);

// Обработчики для аналитики менеджера
bot.action('manager_price_history', requireRole('manager'), analyticsHandlers.priceHistory);
bot.action('manager_order_analysis', requireRole('manager'), analyticsHandlers.orderCostAnalysis);
bot.action('manager_product_report', requireRole('manager'), async (ctx) => {
  await ctx.answerCbQuery();
  await analyticsHandlers.priceHistory(ctx);
});

// Обработчики профиля
bot.action('profile_edit_phone', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session = ctx.session || {};
  ctx.session.editingPhone = true;
  await ctx.reply(
    '📱 <b>Изменение номера телефона</b>\n\n' +
    'Введите новый номер телефона:\n\n' +
    '<b>Примеры формата:</b>\n' +
    '• +7 (999) 123-45-67\n' +
    '• 8 999 123 45 67\n' +
    '• 89991234567\n\n' +
    '<i>Отправьте /cancel для отмены</i>',
    { parse_mode: 'HTML' }
  );
});

// Обработчики команд для обработки заказов менеджером
bot.command(/^process_order_\d+$/, requireRole('manager'), managerHandlers.processOrderCommand);
bot.command(/^continue_process_\d+$/, requireRole('manager'), managerHandlers.continueProcessOrder);

// Команда для управления расписанием для менеджера
bot.command(/^schedule_\d+$/, requireRole(['manager', 'admin']), async (ctx) => {
  const scheduleId = ctx.match[0].split('_')[1];
  const user = ctx.user;
  
  if (user.role === 'admin') {
    // Если админ - используем обработчик админа
    return adminHandlers.handleScheduleCommand(ctx);
  }
  
  // Для менеджера - показываем расписание с ограниченными возможностями
  const { ScheduledOrder } = require('./src/database/models');
  const schedule = await ScheduledOrder.findByPk(scheduleId, {
    include: [{
      model: require('./src/database/models').Restaurant,
      as: 'restaurant'
    }]
  });
  
  if (!schedule) {
    return ctx.reply('❌ Расписание не найдено');
  }
  
  // Показываем расписание менеджеру
  return managerHandlers.showScheduleDetails(ctx, schedule);
});

// Обработчик callback для обработки заказа
bot.action(/^process_order:(\d+)$/, requireRole('manager'), async (ctx) => {
  const orderId = ctx.match[1];
  return managerHandlers.processOrderCommand({
    ...ctx,
    message: { text: `/process_order_${orderId}` }
  });
});

// Команды для работы с документами
bot.command(/^generate_torg12_\d+$/, documentsHandlers.generateTorg12Command);
bot.command(/^order_documents_\d+$/, documentsHandlers.listOrderDocuments);
bot.command('documents_menu', documentsHandlers.documentsMenu);

// Команды для аналитики и отчетности
bot.command('price_history', analyticsHandlers.priceHistory);
bot.command('profitability', analyticsHandlers.profitabilityReport);
bot.command('update_prices', analyticsHandlers.updatePrices);
bot.command('order_analysis', analyticsHandlers.orderCostAnalysis);

// Команды для настроек email
bot.command('email_settings', requireRole('manager'), emailSettings.emailSettingsMenu);

// Команды администратора
bot.command('admin_panel', requireAdmin, adminHandlers.adminPanel);
bot.command('users', requireAdmin, adminHandlers.usersList);
bot.command('restaurants', requireAdmin, adminHandlers.restaurantsList);
bot.command('settings', requireAdmin, adminHandlers.systemSettings);
bot.command('backup', requireAdmin, adminHandlers.createBackup);
bot.command('stats', requireAdmin, adminHandlers.systemStats);
bot.command(/^user_(\d+)$/, requireRole(['admin', 'manager']), adminHandlers.handleUserCommand);
bot.command(/^restaurant_(\d+)$/, requireAdmin, async (ctx) => {
  const restaurantId = ctx.match[1];
  return adminHandlers.restaurantManagement(ctx, restaurantId);
});
bot.command('logs', requireAdmin, adminHandlers.viewLogs);

// Обработчики callback для документов
bot.action(/^send_doc_email:(.+):(.+)$/, documentsHandlers.sendDocumentByEmail);
bot.action(/^delete_doc:(.+)$/, documentsHandlers.deleteDocument);
bot.action(/^quick_torg12:(\d+)$/, documentsHandlers.quickGenerateTorg12);
bot.action('cleanup_old_docs', documentsHandlers.cleanupOldDocuments);

// Обработчики callback для аналитики
bot.action('confirm_update_prices', analyticsHandlers.handleAnalyticsCallbacks);
bot.action('cancel_update_prices', analyticsHandlers.handleAnalyticsCallbacks);
bot.action('report_top_quantity', analyticsHandlers.handleAnalyticsCallbacks);
bot.action('report_price_trends', analyticsHandlers.handleAnalyticsCallbacks);
bot.action('report_order_analysis', analyticsHandlers.handleAnalyticsCallbacks);

// Обработчики callback для email настроек (более специфичные, чтобы не конфликтовать с edit_day_)
bot.action(/^edit_email_/, emailSettings.handleEmailSettingsCallbacks);
bot.action(/^edit_smtp_/, emailSettings.handleEmailSettingsCallbacks);
bot.action(/^back_to_email_menu$/, emailSettings.handleEmailSettingsCallbacks);
bot.action(/^cancel_test_email$/, emailSettings.handleEmailSettingsCallbacks);
bot.action(/^cancel_email_edit$/, emailSettings.handleEmailSettingsCallbacks);

// Временный обработчик для отладки
bot.action(/^edit_day_(\d+)$/, async (ctx) => {
  logger.info('DEBUG: edit_day callback caught', ctx.callbackQuery.data);
  return adminHandlers.handleScheduleEditCallbacks(ctx);
});

// Обработчики callback для редактирования расписания (должны быть ПЕРЕД общим admin обработчиком)
bot.action('save_schedule_days', adminHandlers.handleScheduleEditCallbacks);
bot.action('cancel_schedule_edit', adminHandlers.handleScheduleEditCallbacks);
bot.action('confirm_schedule_conflicts', adminHandlers.handleScheduleEditCallbacks);
bot.action(/^confirm_delete_schedule_(\d+)$/, adminHandlers.handleScheduleEditCallbacks);
bot.action(/^schedule_(\d+)$/, adminHandlers.handleScheduleEditCallbacks);

// Обработчики callback для черновиков заказов
bot.action('draft_view', requireRole('restaurant'), draftOrderHandlers.viewDraft);
bot.action('draft_search', requireRole('restaurant'), productSearchHandlers.startProductSearch);
bot.action('draft_cancel', async (ctx) => {
  await ctx.answerCbQuery();
  delete ctx.session.addingProducts;
  delete ctx.session.draftOrderId;
  delete ctx.session.selectedBranchId;
  return ctx.reply('❌ Добавление продуктов отменено');
});
bot.action('draft_add_more', requireRole('restaurant'), draftOrderHandlers.startAddingProducts);
bot.action(/^draft_add_more:(\d+)$/, requireRole('restaurant'), draftOrderHandlers.startAddingProducts);
bot.action('draft_done', requireRole('restaurant'), draftOrderHandlers.finishAdding);
bot.action('draft_edit', requireRole('restaurant'), draftOrderHandlers.editDraft);
bot.action(/^draft_edit:(\d+)$/, requireRole('restaurant'), draftOrderHandlers.editDraft);
bot.action('draft_send', requireRole('restaurant'), draftOrderHandlers.sendDraft);
bot.action(/^draft_send:(\d+)$/, requireRole('restaurant'), draftOrderHandlers.sendDraft);
bot.action(/^select_draft:(\d+)$/, requireRole('restaurant'), draftOrderHandlers.selectDraft);
bot.action(/^draft_edit_item:(\d+)$/, requireRole('restaurant'), draftOrderHandlers.editDraftItem);
bot.action(/^draft_change_qty:(\d+)$/, requireRole('restaurant'), draftOrderHandlers.changeDraftItemQuantity);
bot.action(/^draft_match:(\d+):(\d+)$/, requireRole('restaurant'), draftOrderHandlers.confirmProductMatch);
bot.action(/^temp_match:(.+):(\d+)$/, requireRole('restaurant'), async (ctx) => {
  try {
    const [tempId, productId] = ctx.match.slice(1);
    
    // Получаем временные данные
    const tempData = ctx.session.tempProducts?.[tempId];
    if (!tempData) {
      return ctx.answerCbQuery('❌ Данные продукта устарели');
    }
    
    // Создаем DraftOrderItem
    const { DraftOrderItem, NomenclatureCache } = require('./src/database/models');
    const draftOrderService = require('./src/services/DraftOrderService');
    
    const item = await DraftOrderItem.create({
      draft_order_id: tempData.draftOrderId,
      product_name: tempData.name,
      original_name: tempData.name,
      quantity: tempData.quantity,
      unit: tempData.unit,
      status: 'unmatched',
      matched_product_id: null,
      added_by: ctx.user.id
    });
    
    logger.info('Created draft item:', { id: item.id, productId });
    
    // Вызываем confirmProductMatch напрямую через сервис
    const updatedItem = await draftOrderService.confirmProductMatch(item.id, productId);
    
    // Отвечаем на callback query
    await ctx.answerCbQuery('✅ Продукт подтвержден');
    
    // Обновляем сообщение с кнопками
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Добавить еще продукты', callback_data: 'draft_add_more' }],
          [{ text: '🔍 Поиск в каталоге', callback_data: 'draft_search' }],
          [{ text: '📋 Посмотреть текущий заказ', callback_data: 'draft_view' }],
          [{ text: '❌ Отмена', callback_data: 'draft_cancel' }]
        ]
      }
    };
    
    await ctx.editMessageText(
      `✅ Подтверждено: ${updatedItem.product_name} - ${updatedItem.quantity} ${updatedItem.unit}`,
      { parse_mode: 'HTML', ...keyboard }
    );
    
    // Удаляем временные данные
    delete ctx.session.tempProducts[tempId];
  } catch (error) {
    logger.error('Error in temp_match handler:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
});
bot.action(/^draft_remove:(\d+)$/, requireRole('restaurant'), draftOrderHandlers.removeItem);
bot.action(/^unit_clarify:(.+):(.+)(?::(.+))?$/, requireRole('restaurant'), draftOrderHandlers.handleUnitClarification);
bot.action(/^draft_search_for:(\d+)$/, requireRole('restaurant'), async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.searchingForItem = ctx.callbackQuery.data.split(':')[1];
  return productSearchHandlers.startProductSearch(ctx);
});
bot.action(/^unit_duplicate:(\d+):(.+):(.+)$/, requireRole('restaurant'), draftOrderHandlers.handleUnitDuplicate);
bot.action(/^duplicate_add:(\d+):(.+?)(?::(.+))?$/, requireRole('restaurant'), draftOrderHandlers.handleDuplicateAdd);
bot.action(/^duplicate_replace:(\d+):(.+?)(?::(.+))?$/, requireRole('restaurant'), draftOrderHandlers.handleDuplicateReplace);
bot.action(/^duplicate_cancel:(\d+)$/, requireRole('restaurant'), draftOrderHandlers.handleDuplicateCancel);

// Обработчики для неподтвержденных позиций
bot.action('draft_edit_unmatched', requireRole('restaurant'), draftOrderHandlers.editUnmatchedItems);
bot.action(/^draft_confirm_item:(\d+)$/, requireRole('restaurant'), draftOrderHandlers.confirmDraftItem);
bot.action(/^draft_match_item:(\d+):(\d+)$/, requireRole('restaurant'), draftOrderHandlers.matchDraftItem);
bot.action(/^draft_no_match:(\d+)$/, requireRole('restaurant'), draftOrderHandlers.confirmDraftItem);
bot.action('draft_remove_unmatched', requireRole('restaurant'), draftOrderHandlers.removeUnmatchedItems);
bot.action('draft_confirm_remove_unmatched', requireRole('restaurant'), draftOrderHandlers.confirmRemoveUnmatched);

// Обработчики callback для действий с продуктами
bot.action(/^add_to_order:(.+)$/, productSearchHandlers.handleAddToOrder);
bot.action(/^product_info:(.+)$/, productSearchHandlers.handleProductInfo);
bot.action(/^find_similar:(.+)$/, productSearchHandlers.handleFindSimilar);
bot.action('close_actions', productSearchHandlers.handleCloseActions);
bot.action('close_info', productSearchHandlers.handleCloseActions);

// Обработчики callback для администратора (включая обработку заявок)
// ВАЖНО: Специфичные обработчики должны идти ПЕРЕД общим обработчиком
bot.action(/^admin_reg_request:/, requireRole(['manager', 'admin']), adminHandlers.handleAdminCallbacks);
bot.action(/^admin_approve_reg:/, requireRole(['manager', 'admin']), adminHandlers.handleAdminCallbacks);
bot.action(/^admin_assign_restaurant:/, requireRole(['manager', 'admin']), adminHandlers.handleAdminCallbacks);
bot.action(/^admin_skip_restaurant:/, requireRole(['manager', 'admin']), adminHandlers.handleAdminCallbacks);
bot.action(/^admin_reject_reg:/, requireRole(['manager', 'admin']), adminHandlers.handleAdminCallbacks);
bot.action(/^admin_create_restaurant_for:/, requireRole(['manager', 'admin']), adminHandlers.handleAdminCallbacks);
bot.action('admin_users_pending', requireRole(['manager', 'admin']), adminHandlers.handleAdminCallbacks);
bot.action('admin_users', requireRole(['manager', 'admin']), adminHandlers.handleAdminCallbacks);
bot.action('admin_users_list', requireRole(['manager', 'admin']), adminHandlers.handleAdminCallbacks);
bot.action(/^admin_users_list_/, requireRole(['manager', 'admin']), adminHandlers.handleAdminCallbacks);
bot.action('admin_users_search', requireRole(['manager', 'admin']), adminHandlers.handleAdminCallbacks);
bot.action('admin_users_search_cancel', requireRole(['manager', 'admin']), adminHandlers.handleAdminCallbacks);

// Обработчики филиалов для админа
bot.action(/^admin_branches:(\d+)$/, requireAdmin, adminHandlers.handleAdminCallbacks);
bot.action(/^admin_add_branch:(\d+)$/, requireAdmin, handleBranchCallbacks);
bot.action(/^admin_edit_branches:(\d+)$/, requireAdmin, handleBranchCallbacks);

// Общий обработчик для остальных admin_ callback'ов
bot.action(/^admin_/, requireAdmin, adminHandlers.handleAdminCallbacks);
bot.action(/^user_(\d+)$/, requireAdmin, adminHandlers.handleAdminCallbacks);
bot.action(/^user_block:(\d+)$/, requireAdmin, adminHandlers.handleAdminCallbacks);
bot.action(/^user_unblock:(\d+)$/, requireAdmin, adminHandlers.handleAdminCallbacks);
bot.action(/^user_change_role:(\d+)$/, requireAdmin, adminHandlers.handleAdminCallbacks);
bot.action(/^set_role:(\d+):(.+)$/, requireAdmin, adminHandlers.handleAdminCallbacks);
bot.action(/^restaurant_toggle:(\d+)$/, requireAdmin, adminHandlers.handleAdminCallbacks);
bot.action(/^restaurant_edit:(\d+)$/, requireAdmin, adminHandlers.handleAdminCallbacks);
bot.action(/^user_page:(\d+)$/, requireAdmin, adminHandlers.handleAdminCallbacks);

// Обработчики для ReplyKeyboard кнопок
bot.hears('🔧 Панель администратора', requireAdmin, adminHandlers.adminPanel);
bot.hears('📋 Команды', async (ctx) => {
  return ctx.reply('Доступные команды:\n\n/start - Главное меню\n/help - Помощь');
});
bot.hears('👤 Профиль', registrationHandlers.profileCommand);

bot.hears('📋 Меню менеджера', requireRole('manager'), async (ctx) => {
  // Проверяем активные состояния перед показом меню
  if (ctx.session?.creatingRestaurant || 
      ctx.session?.editingRestaurant || 
      ctx.session?.awaitingBranchAddress ||
      ctx.session?.isManagerAddingBranch ||
      ctx.session?.editingRestaurantId) {
    // Не показываем меню, если идет редактирование
    return;
  }
  
  // Показываем меню менеджера через inline клавиатуру
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📋 Заявки', callback_data: 'menu_orders' }],
        [{ text: '👥 Управление пользователями', callback_data: 'admin_users' }],
        [{ text: '🏢 Рестораны', callback_data: 'menu_restaurants' }],
        [{ text: '📊 Статистика', callback_data: 'manager_statistics' }],
        [{ text: '📧 Email настройки', callback_data: 'manager_email_settings' }]
      ]
    }
  };
  
  await ctx.reply(
    '👔 <b>Меню менеджера</b>\n\n' +
    'Выберите раздел:',
    { parse_mode: 'HTML', ...keyboard }
  );
});

bot.hears('📋 Заявки', requireRole('manager'), async (ctx) => {
  logger.info('Processing "Заявки" command in index.js for manager', {
    userId: ctx.from?.id,
    userName: ctx.from?.username
  });
  // Вызываем функцию подменю заявок
  return managerHandlers.ordersSubmenu(ctx);
});

bot.hears('👥 Управление пользователями', requireRole(['manager', 'admin']), async (ctx) => {
  // Вызываем функцию управления пользователями из adminHandlers
  return adminHandlers.usersManagement(ctx);
});
bot.hears('📊 Статистика', requireRole('manager'), analyticsHandlers.managerDashboard);

bot.hears('📊 Консолидация', requireRole('buyer'), procurementHandlers.consolidatedList);
bot.hears('🛒 Закупки', requireRole('buyer'), procurementHandlers.purchases);
bot.hears('📈 Отчеты', requireRole('buyer'), procurementHandlers.reports);

bot.hears('🛒 Создать заказ', requireRole('restaurant'), draftOrderHandlers.startAddingProducts);
bot.hears('📋 Мои заказы', requireRole('restaurant'), restaurantHandlers.myOrders);
// Убрали дублирующую функцию "Мои черновики" - она объединена с "Мои заказы"
bot.hears('🔍 Поиск продуктов', requireRole('restaurant'), restaurantHandlers.searchProducts);
bot.hears('🏢 Мои филиалы', requireRole('restaurant'), async (ctx) => {
  const user = ctx.user || ctx.session?.user;
  
  if (!user || !user.restaurant_id) {
    return ctx.reply('❌ Вы не привязаны к ресторану');
  }
  
  const { RestaurantBranch } = require('./src/database/models');
  const branches = await RestaurantBranch.findAll({
    where: { 
      restaurantId: user.restaurant_id,
      isActive: true
    },
    order: [
      ['isMain', 'DESC'],
      ['address', 'ASC']
    ]
  });
  
  let message = '🏢 <b>Мои филиалы:</b>\n\n';
  
  if (branches.length === 0) {
    message += '<i>У вас еще нет филиалов</i>\n';
  } else {
    branches.forEach((branch, index) => {
      message += `${index + 1}. 📍 ${branch.address}`;
      if (branch.isMain) message += ' <b>(Главный)</b>';
      message += '\n';
    });
  }
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Добавить филиал', callback_data: 'add_my_branch' }],
        [{ text: '🔙 Главное меню', callback_data: 'menu_main' }]
      ]
    }
  };
  
  await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
});

bot.on('text', async (ctx) => {
  logger.info('Text message handler', {
    text: ctx.message.text,
    userId: ctx.from.id,
    userName: ctx.from.username,
    userRole: ctx.user?.role,
    hasSession: !!ctx.session,
    sessionData: ctx.session
  });
  
  // Проверяем процесс регистрации
  const registrationHandled = await registrationHandlers.handleRegistrationText(ctx);
  logger.info('Registration handler result', { handled: registrationHandled });
  
  if (registrationHandled) {
    return;
  }
  
  // Проверяем редактирование телефона
  if (ctx.session?.editingPhone) {
    const text = ctx.message.text;
    
    if (text === '/cancel') {
      delete ctx.session.editingPhone;
      return ctx.reply('❌ Редактирование отменено');
    }
    
    // Валидация телефона
    const cleanPhone = text.replace(/[^\d+]/g, '');
    if (cleanPhone.length < 10) {
      return ctx.reply(
        '❌ Неверный формат телефона.\n\n' +
        '<b>Допустимые форматы:</b>\n' +
        '• +7 (999) 123-45-67\n' +
        '• 8 999 123 45 67\n' +
        '• 89991234567\n\n' +
        '<i>Попробуйте еще раз или отправьте /cancel для отмены</i>',
        { parse_mode: 'HTML' }
      );
    }
    
    // Обновляем телефон в базе данных
    if (ctx.user) {
      ctx.user.phone = cleanPhone;
      await ctx.user.save();
      delete ctx.session.editingPhone;
      return ctx.reply('✅ Номер телефона успешно обновлен!');
    }
  }
  
  // Проверяем ввод адреса для филиала
  if (ctx.session?.awaitingBranchAddress) {
    const handled = await handleBranchAddressText(ctx);
    if (handled) return;
  }
  
  // Проверяем ввод данных для закупки
  if (ctx.session?.awaitingPurchaseInput && ctx.session?.currentPurchaseItemId) {
    const text = ctx.message.text.trim();
    const parts = text.split(/\s+/);
    
    if (parts.length !== 2) {
      return ctx.reply(
        '❌ Неверный формат ввода.\n\n' +
        'Введите через пробел:\n' +
        '• Количество закупленного товара\n' +
        '• Общую сумму закупки\n\n' +
        'Пример: 10 2500'
      );
    }
    
    // Заменяем запятую на точку для корректного парсинга дробных чисел
    const quantity = parseFloat(parts[0].replace(',', '.'));
    const totalPrice = parseFloat(parts[1].replace(',', '.'))
    
    if (isNaN(quantity) || quantity <= 0 || isNaN(totalPrice) || totalPrice <= 0) {
      return ctx.reply('❌ Количество и сумма должны быть положительными числами');
    }
    
    try {
      const { PurchaseItem } = require('./src/database/models');
      
      // Обновляем данные о закупке товара
      const purchaseItem = await PurchaseItem.findByPk(ctx.session.currentPurchaseItemId);
      if (!purchaseItem) {
        return ctx.reply('❌ Товар не найден');
      }
      
      await purchaseItem.update({
        purchased_quantity: quantity,
        purchase_price: totalPrice,
        status: 'completed',
        purchased_at: new Date()
      });
      
      // Обновляем счетчик в основной закупке
      const { Purchase } = require('./src/database/models');
      const purchase = await Purchase.findByPk(purchaseItem.purchase_id);
      if (purchase) {
        await purchase.increment('completed_items');
      }
      
      // Очищаем сессию
      delete ctx.session.awaitingPurchaseInput;
      delete ctx.session.currentPurchaseItemId;
      
      await ctx.reply(
        `✅ <b>Товар закуплен!</b>\n\n` +
        `📦 ${purchaseItem.product_name}\n` +
        `📏 Количество: ${quantity.toString().replace('.', ',')} ${purchaseItem.unit}\n` +
        `💰 Сумма: ${totalPrice.toString().replace('.', ',')} ₽\n` +
        `💵 Цена за ${purchaseItem.unit}: ${(totalPrice / quantity).toFixed(2).replace('.', ',')} ₽`,
        { parse_mode: 'HTML' }
      );
      
      // Продолжаем закупку следующего товара
      return procurementHandlers.continuePurchaseSession(ctx);
      
    } catch (error) {
      logger.error('Error processing purchase input:', error);
      return ctx.reply('❌ Произошла ошибка при сохранении данных');
    }
  }
  
  // Проверяем добавление продуктов в черновик
  if (ctx.session?.addingProducts && ctx.user?.role === 'restaurant') {
    const handled = await draftOrderHandlers.handleProductText(ctx);
    if (handled) return;
  }
  
  // Отключено автоматическое создание заказа при вводе текста с продуктами
  // Это вызывало проблемы, так как требовало выбора филиала
  // Пользователи должны явно нажать "Создать заказ"
  /*
  if (ctx.user?.role === 'restaurant' && !ctx.session?.addingProducts) {
    const text = ctx.message.text.trim();
    // Проверяем, похоже ли это на ввод продуктов (содержит цифры или типичные единицы измерения)
    if (/\d+|кг|шт|л|уп|кор|ящ/i.test(text)) {
      // Автоматически начинаем создание заказа
      await draftOrderHandlers.startAddingProducts(ctx);
      // Обрабатываем введённый текст как продукт
      const handled = await draftOrderHandlers.handleProductText(ctx);
      if (handled) return;
    }
  }
  */
  
  // Проверяем ввод времени для настроек
  if (await settingsHandlers.handleTimeTextInput(ctx)) {
    return;
  }
  
  // Проверяем состояния менеджера ПЕРЕД обработкой команд
  if (ctx.user && (ctx.user.role === 'manager' || ctx.user.role === 'admin')) {
    // Проверяем активные состояния сессии менеджера
    if (ctx.session?.creatingRestaurant || 
        ctx.session?.editingRestaurant || 
        ctx.session?.isManagerAddingBranch) {
      // Передаем обработку в manager.js
      const text = ctx.message.text;
      
      // Обработка создания ресторана
      if (ctx.session?.creatingRestaurant) {
        const restaurantName = text.trim();
        
        if (restaurantName.length < 3) {
          await ctx.reply('❌ Название ресторана слишком короткое. Введите корректное название:');
          return;
        }
        
        try {
          const { Restaurant, RestaurantBranch } = require('./src/database/models');
          
          // Создаем новый ресторан
          const restaurant = await Restaurant.create({
            name: restaurantName,
            is_active: true
          });
          
          // Создаем главный филиал
          await RestaurantBranch.create({
            restaurantId: restaurant.id,
            address: `Главный филиал ${restaurantName}`,
            isMain: true,
            isActive: true
          });
          
          delete ctx.session.creatingRestaurant;
          
          // Показываем сообщение о создании ресторана
          await ctx.reply(
            `✅ <b>Ресторан создан!</b>\n\n` +
            `Название: ${restaurantName}\n` +
            `ID: ${restaurant.id}\n` +
            `Создан главный филиал\n\n` +
            `Теперь вы можете привязать пользователей к этому ресторану.`,
            { parse_mode: 'HTML' }
          );
          
          // Небольшая задержка для лучшего UX
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Показываем информацию о ресторане
          return managerHandlers.manageRestaurant(ctx, restaurant.id);
        } catch (error) {
          logger.error('Error creating restaurant:', error);
          await ctx.reply('❌ Ошибка при создании ресторана');
          delete ctx.session.creatingRestaurant;
        }
        return;
      }
      
      // Обработка редактирования ресторана
      if (ctx.session?.editingRestaurant) {
        const { field, restaurantId } = ctx.session.editingRestaurant;
        const value = text.trim();
        
        if (value.length === 0) {
          await ctx.reply('❌ Значение не может быть пустым');
          return;
        }
        
        try {
          const { Restaurant } = require('./src/database/models');
          const restaurant = await Restaurant.findByPk(restaurantId);
          if (!restaurant) {
            await ctx.reply('❌ Ресторан не найден');
            delete ctx.session.editingRestaurant;
            delete ctx.session.editingRestaurantId;
            return;
          }
          
          const fieldNames = {
            name: 'Название',
            address: 'Адрес',
            contact_phone: 'Телефон',
            contact_email: 'Email',
            contact_person: 'Контактное лицо'
          };
          
          restaurant[field] = value;
          await restaurant.save();
          
          delete ctx.session.editingRestaurant;
          delete ctx.session.editingRestaurantId;
          
          // Показываем сообщение об успешном обновлении
          await ctx.reply(
            `✅ ${fieldNames[field]} успешно обновлено!`,
            { parse_mode: 'HTML' }
          );
          
          // Небольшая задержка для лучшего UX
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Возвращаемся в меню редактирования
          return managerHandlers.showEditRestaurantMenu(ctx, restaurantId);
        } catch (error) {
          logger.error('Error updating restaurant:', error);
          await ctx.reply('❌ Ошибка при обновлении ресторана');
          delete ctx.session.editingRestaurant;
          delete ctx.session.editingRestaurantId;
        }
        return;
      }
      
      // Завершаем обработку, не передаем управление дальше
      return;
    }
    
    // Только если нет активных состояний, обрабатываем команды
    const handled = await managerHandlers.handleTextCommands(ctx);
    if (handled) return;
  }
  
  // Проверяем команды документов
  if (ctx.user && ['manager', 'buyer'].includes(ctx.user.role)) {
    const text = ctx.message.text;
    if (text === '📄 Последние документы') {
      return documentsHandlers.recentDocuments(ctx);
    }
    if (text === '🗑 Очистка документов') {
      return documentsHandlers.cleanupOldDocuments(ctx);
    }
  }
  
  // Проверяем команды аналитики для менеджеров
  if (ctx.user && ctx.user.role === 'manager') {
    const handled = await analyticsHandlers.handleTextCommands(ctx);
    if (handled) return;
  }
  
  // Проверяем неправильные команды для ресторана
  if (ctx.user && ctx.user.role === 'restaurant') {
    const managerCommands = ['📋 Заявки', '📋 Меню менеджера', '👥 Управление пользователями', '📊 Статистика'];
    if (managerCommands.includes(ctx.message.text)) {
      await ctx.reply(
        '❌ Эта команда недоступна для ресторана.\n\n' +
        '✅ Вот ваше правильное меню:',
        Markup.keyboard([
          ['🛒 Создать заказ', '📋 Мои заказы'],
          ['🔍 Поиск продуктов', '🏢 Мои филиалы'],
          ['👤 Профиль']
        ]).resize()
      );
      
      // Показываем главное меню
      const { showMainMenu } = require('./src/handlers/registration');
      await showMainMenu(ctx, ctx.user);
      
      return;
    }
  }
  
  // Проверяем команды email настроек
  if (ctx.user && ctx.user.role === 'manager') {
    if (ctx.message.text === '📧 Email настройки') {
      return emailSettings.emailSettingsMenu(ctx);
    }
    const handled = await emailSettings.handleTextCommands(ctx);
    if (handled) return;
  }
  
  // Проверяем команды администратора и менеджера (для создания ресторанов)
  if (ctx.user && (ctx.user.role === 'admin' || ctx.user.role === 'manager')) {
    // Проверяем создание ресторана для пользователя (доступно и менеджерам)
    if (ctx.session?.creatingRestaurantForUser || ctx.session?.rejectingRequestId) {
      const handled = await adminHandlers.handleTextCommands(ctx);
      if (handled) return;
    }
    
    // Проверяем команду /user_ для менеджеров
    if (ctx.message.text.match(/^\/user_(\d+)$/)) {
      const handled = await adminHandlers.handleTextCommands(ctx);
      if (handled) return;
    }
    
    // Остальные команды только для админов
    if (ctx.user.role === 'admin') {
      // Проверяем редактирование расписания
      const scheduleHandled = await adminHandlers.handleScheduleTextInput(ctx);
      if (scheduleHandled) return;
      
      // Проверяем редактирование данных пользователя
      const userEditHandled = await adminHandlers.handleUserEditTextInput(ctx);
      if (userEditHandled) return;
      
      // Проверяем поиск пользователя
      const userSearchHandled = await adminHandlers.handleUserSearch(ctx);
      if (userSearchHandled) return;
      
      const handled = await adminHandlers.handleTextCommands(ctx);
      if (handled) return;
    }
  }
  
  // Проверяем команды закупщика
  if (ctx.user && ctx.user.role === 'buyer') {
    const handled = await buyerHandlers.handleTextCommands(ctx);
    if (handled) return;
  }
  
  // Проверяем, находится ли пользователь в режиме поиска
  if (ctx.session && ctx.session.searchMode === 'text') {
    ctx.session.lastSearchQuery = ctx.message.text;
    return productSearchHandlers.handleTextSearch(ctx);
  }
  
  // Проверяем, ожидается ли ввод количества
  if (ctx.session && ctx.session.awaitingQuantity) {
    const quantity = parseFloat(ctx.message.text);
    if (isNaN(quantity) || quantity <= 0) {
      return ctx.reply('⚠️ Введите корректное число больше 0');
    }
    
    const product = ctx.session.selectedProduct;
    if (product) {
      const keyboard = KeyboardHelper.createConfirmationKeyboard(
        product.product_name,
        quantity,
        product.unit
      );
      ctx.session.awaitingQuantity = null;
      return ctx.reply(
        `📦 Товар для добавления:\n\n` +
        `• ${product.product_name}\n` +
        `• Количество: ${quantity} ${product.unit}\n\n` +
        `Подтвердите добавление в заказ:`,
        keyboard
      );
    }
  }
  
  // Обработка текстовых команд через клавиатуру
  const text = ctx.message.text;
  
  if (text === '🔍 Добавить продукт' || text === '➕ Добавить еще продукт') {
    return ctx.scene.enter('add_product');
  }
  
  if (text === '📋 Посмотреть заказ') {
    return orderHandlers.myOrderCommand(ctx);
  }
  
  if (text === '✅ Отправить заказ') {
    return orderHandlers.handleOrderCallbacks({
      ...ctx,
      callbackQuery: { data: 'send_order' },
      answerCbQuery: () => {}
    });
  }
  
  if (text === '🆕 Новый заказ') {
    return orderHandlers.newOrderCommand(ctx);
  }
  
  if (text === '📋 Мои заказы') {
    return orderHandlers.orderHistoryCommand(ctx);
  }
  
  if (text === 'Мои заявки') {
    return restaurantHandlers.myOrders(ctx);
  }
  
  // Обработка кнопок постоянной клавиатуры для админа
  if (text === '🔧 Панель администратора' && ctx.user && ctx.user.role === 'admin') {
    return adminHandlers.adminPanel(ctx);
  }
  
  if (text === '📋 Команды' && ctx.user && ctx.user.role === 'admin') {
    // Показываем доступные команды для админа
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔧 Панель администратора', callback_data: 'admin_panel' },
            { text: '👤 Профиль', callback_data: 'menu_profile' }
          ],
          [
            { text: '👥 Управление пользователями', callback_data: 'admin_users' },
            { text: '🏢 Управление ресторанами', callback_data: 'admin_restaurants' }
          ],
          [
            { text: '⚙️ Настройки системы', callback_data: 'admin_settings' },
            { text: '📊 Статистика', callback_data: 'admin_stats' }
          ],
          [
            { text: '💾 Резервная копия БД', callback_data: 'admin_backup' },
            { text: '📋 Логи системы', callback_data: 'admin_logs' }
          ]
        ]
      }
    };
    return ctx.reply('🔧 <b>Доступные команды администратора:</b>', { parse_mode: 'HTML', ...keyboard });
  }
  
  if (text === '👤 Профиль') {
    return registrationHandlers.profileCommand(ctx);
  }
  
  // Обработка кнопок постоянной клавиатуры для менеджера
  if (text === '📋 Меню менеджера' && ctx.user && ctx.user.role === 'manager') {
    // Проверяем активные состояния перед показом меню
    if (ctx.session?.creatingRestaurant || 
        ctx.session?.editingRestaurant || 
        ctx.session?.awaitingBranchAddress ||
        ctx.session?.isManagerAddingBranch ||
        ctx.session?.editingRestaurantId) {
      // Не показываем меню, если идет редактирование
      return;
    }
    return managerHandlers.menu(ctx);
  }
  
  if (text === '👥 Управление пользователями' && ctx.user && ctx.user.role === 'manager') {
    const { RegistrationRequest } = require('./src/database/models');
    const pendingCount = await RegistrationRequest.count({ where: { status: 'pending' } });
    
    if (pendingCount > 0) {
      return managerHandlers.pendingRegistrations(ctx);
    } else {
      return ctx.reply('✅ Нет новых заявок на регистрацию');
    }
  }
  
  if (text === '📊 Статистика' && ctx.user && ctx.user.role === 'manager') {
    return managerHandlers.statistics(ctx);
  }
  
  // Обработка кнопок постоянной клавиатуры для закупщика
  if (text === '📊 Консолидация' && ctx.user && ctx.user.role === 'buyer') {
    return procurementHandlers.consolidatedList(ctx);
  }
  
  if (text === '🛒 Закупки' && ctx.user && ctx.user.role === 'buyer') {
    return procurementHandlers.purchases(ctx);
  }
  
  if (text === '📈 Отчеты' && ctx.user && ctx.user.role === 'buyer') {
    return procurementHandlers.reports(ctx);
  }
  
  // Обработка кнопок постоянной клавиатуры для ресторана
  if (text === '🛒 Создать заказ' && ctx.user && ctx.user.role === 'restaurant') {
    // Очищаем выбранный филиал при создании нового заказа
    ctx.session = ctx.session || {};
    delete ctx.session.selectedBranchId;
    return draftOrderHandlers.startAddingProducts(ctx);
  }
  
  if (text === '🔍 Поиск продуктов' && ctx.user && ctx.user.role === 'restaurant') {
    return productSearchHandlers.startProductSearch(ctx);
  }
  
  if (text === '📋 Мои заказы' && ctx.user && ctx.user.role === 'restaurant') {
    return restaurantHandlers.myOrders(ctx);
  }
  
  if (text === '🏢 Мои филиалы' && ctx.user && ctx.user.role === 'restaurant') {
    const { RestaurantBranch } = require('./src/database/models');
    const branches = await RestaurantBranch.findAll({
      where: { 
        restaurantId: ctx.user.restaurant_id,
        isActive: true
      },
      order: [
        ['isMain', 'DESC'],
        ['address', 'ASC']
      ]
    });
    
    let message = '🏢 <b>Мои филиалы:</b>\n\n';
    
    if (branches.length === 0) {
      message += '<i>У вас еще нет филиалов</i>\n';
    } else {
      branches.forEach((branch, index) => {
        message += `${index + 1}. 📍 ${branch.address}`;
        if (branch.isMain) message += ' <b>(Главный)</b>';
        message += '\n';
      });
    }
    
    message += '\n<i>Для управления филиалами обратитесь к менеджеру</i>';
    
    return ctx.reply(message, { parse_mode: 'HTML' });
  }
  
  if (text === '👤 Профиль' && ctx.user && ctx.user.role === 'restaurant') {
    return registrationHandlers.profileCommand(ctx);
  }
  
  // Не показываем меню по умолчанию для необработанных сообщений
  // Это предотвращает появление главного меню при вводе любого текста
  /*
  if (ctx.user && ctx.user.role === 'admin') {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔧 Панель администратора', callback_data: 'admin_panel' },
            { text: '👤 Профиль', callback_data: 'menu_profile' }
          ],
          [
            { text: '👥 Управление пользователями', callback_data: 'admin_users' },
            { text: '🏢 Управление ресторанами', callback_data: 'admin_restaurants' }
          ],
          [
            { text: '⚙️ Настройки системы', callback_data: 'admin_settings' },
            { text: '📊 Статистика', callback_data: 'admin_stats' }
          ],
          [
            { text: '💾 Резервная копия БД', callback_data: 'admin_backup' },
            { text: '📋 Логи системы', callback_data: 'admin_logs' }
          ]
        ]
      }
    };
    return ctx.reply('🔧 <b>Доступные команды администратора:</b>', { parse_mode: 'HTML', ...keyboard });
  } else if (ctx.user && ctx.user.role === 'manager') {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 Заявки', callback_data: 'menu_orders' },
            { text: '👥 Управление пользователями', callback_data: 'admin_users' }
          ],
          [
            { text: '🏢 Рестораны', callback_data: 'menu_restaurants' },
            { text: '📊 Статистика', callback_data: 'manager_statistics' }
          ],
          [
            { text: '📊 Аналитика', callback_data: 'manager_analytics' },
            { text: '📄 Документы', callback_data: 'manager_documents' }
          ],
          [
            { text: '📧 Email настройки', callback_data: 'manager_email_settings' },
            { text: '👤 Профиль', callback_data: 'menu_profile' }
          ]
        ]
      }
    };
    return ctx.reply('📋 <b>Доступные команды менеджера:</b>', { parse_mode: 'HTML', ...keyboard });
  } else if (ctx.user && ctx.user.role === 'buyer') {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📦 Консолидация', callback_data: 'menu_consolidation' },
            { text: '🛒 Закупки', callback_data: 'menu_purchases' }
          ],
          [
            { text: '📊 Отчеты', callback_data: 'menu_reports' },
            { text: '👤 Профиль', callback_data: 'menu_profile' }
          ]
        ]
      }
    };
    return ctx.reply('🛒 <b>Доступные команды закупщика:</b>', { parse_mode: 'HTML', ...keyboard });
  } else if (ctx.user && ctx.user.role === 'restaurant') {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔍 Поиск продуктов', callback_data: 'menu_search_products' },
            { text: '📝 Создать заказ', callback_data: 'menu_create_order' }
          ],
          [
            { text: '📋 Мои заказы', callback_data: 'menu_my_orders' },
            { text: '📋 Черновик', callback_data: 'draft_view' }
          ],
          [
            { text: '👤 Профиль', callback_data: 'menu_profile' }
          ]
        ]
      }
    };
    return ctx.reply('🏢 <b>Доступные команды ресторана:</b>', { parse_mode: 'HTML', ...keyboard });
  } else {
    return ctx.reply('Используйте команды меню для навигации');
  }
  */
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  isShuttingDown = true;
  
  // Устанавливаем статус shutting down для health check
  healthCheckService.setShuttingDown();
  
  // Даем время на завершение текущих операций
  logger.info('Waiting for ongoing operations to complete...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Останавливаем сервисы
  try {
    logger.info('Stopping services...');
    
    // Останавливаем планировщик
    orderSchedulerService.destroy();
    logger.info('OrderSchedulerService stopped');
    
    // Останавливаем Google Sheets
    googleSheetsService.destroy();
    logger.info('GoogleSheetsService stopped');
    
    // Останавливаем health check сервер
    await healthCheckService.stop();
    logger.info('Health check server stopped');
    
    // Останавливаем бота
    await bot.stop(signal);
    logger.info('Bot stopped');
    
    // Закрываем базу данных
    try {
      const { sequelize } = require('./src/database/models');
      if (sequelize) {
        await sequelize.close();
      }
    } catch (dbError) {
      logger.error('Error closing database:', dbError);
    }
    logger.info('Database connection closed');
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.logError(error, { context: 'graceful_shutdown', critical: true });
    process.exit(1);
  }
};

// Обработка сигналов завершения
process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Запуск бота
logger.info('Attempting to launch bot...');

// Функция для попытки запуска с повторами
const launchWithRetry = async (retries = 3, delay = 5000) => {
  // Если установлен IGNORE_CONFLICTS, бот работает несмотря на конфликты
  const ignoreConflicts = process.env.IGNORE_BOT_CONFLICTS === 'true';
  
  for (let i = 0; i < retries; i++) {
    try {
      await bot.launch({ dropPendingUpdates: true });
      logger.info('Bot launched successfully');
      return;
    } catch (err) {
      if (err.message.includes('409: Conflict')) {
        logger.warn(`Bot launch attempt ${i + 1} failed due to conflict. Retrying in ${delay}ms...`);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          if (ignoreConflicts) {
            logger.warn('Running in conflict mode. Bot will work but may miss some updates.');
            // Продолжаем работу несмотря на конфликт
            return;
          } else {
            logger.error('Failed to launch bot after all retries. Running in limited mode.');
            logger.error('To ignore conflicts, set IGNORE_BOT_CONFLICTS=true environment variable');
          }
        }
      } else {
        logger.logError(err, { context: 'bot_launch', critical: true });
        throw err;
      }
    }
  }
};

launchWithRetry().catch(err => {
  logger.error('Critical error launching bot:', err);
});

// The bot.launch() promise only resolves when the bot stops, so we log success after launch
logger.info('Bot started successfully');
logger.info(`Environment: ${config.nodeEnv}`);
logger.info(`Log level: ${config.logLevel}`);