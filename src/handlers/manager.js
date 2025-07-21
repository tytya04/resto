const { Markup } = require('telegraf');
const { Order, OrderItem, Restaurant, User } = require('../database/models');
const OrderService = require('../services/OrderService');
const OrderFormatter = require('../utils/orderFormatter');
const logger = require('../utils/logger');
const { notificationService } = require('../services/NotificationService');
const { Op } = require('sequelize');
const { formatInTimezone } = require('../utils/timezone');

// Меню менеджера
const menu = async (ctx) => {
  logger.info('Manager menu called', {
    from: ctx.callbackQuery ? 'callback' : 'message',
    text: ctx.message?.text,
    callbackData: ctx.callbackQuery?.data
  });
  const keyboard = Markup.keyboard([
    ['📋 Заявки', '👥 Управление пользователями'],
    ['🏢 Рестораны', '📊 Статистика'],
    ['📑 Сводка заказов', '💰 Рентабельность'],
    ['📈 Обновить цены', '📧 Email настройки'],
    ['⚙️ Настройки', '🔙 Главное меню']
  ]).resize();

  await ctx.reply(
    '👔 <b>Меню менеджера</b>\n\n' +
    'Выберите раздел для работы:',
    { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    }
  );
};

// Список новых заявок
const pendingOrders = async (ctx) => {
  try {
    const orders = await OrderService.getPendingOrders(50);

    if (orders.length === 0) {
      return ctx.reply('📋 Нет новых заявок для обработки');
    }

    let message = '📥 <b>Новые заявки:</b>\n\n';
    
    // Группируем по ресторанам
    const ordersByRestaurant = {};
    orders.forEach(order => {
      const restaurantName = order.restaurant.name;
      if (!ordersByRestaurant[restaurantName]) {
        ordersByRestaurant[restaurantName] = [];
      }
      ordersByRestaurant[restaurantName].push(order);
    });

    Object.entries(ordersByRestaurant).forEach(([restaurantName, restaurantOrders]) => {
      message += `\n🏢 <b>${restaurantName}</b>\n`;
      
      restaurantOrders.forEach(order => {
        const time = new Date(order.sent_at).toLocaleTimeString('ru-RU', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        message += `\n📋 Заказ #${order.order_number} (${time})\n`;
        message += `👤 ${order.user.first_name || order.user.username}\n`;
        message += `📦 Позиций: ${order.orderItems.length}\n`;
        message += `💰 Сумма: ${order.total_amount || 'не указана'} ₽\n`;
        message += `/process_order_${order.id}\n`;
      });
    });

    message += '\n\n💡 Нажмите на команду под заказом для начала обработки';

    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    logger.error('Error in pendingOrders:', error);
    ctx.reply('❌ Произошла ошибка при получении заявок');
  }
};

// Команда обработки конкретного заказа
const processOrderCommand = async (ctx) => {
  const match = ctx.message.text.match(/^\/process_order_(\d+)$/);
  
  if (!match) {
    return ctx.reply('❌ Неверный формат команды');
  }
  
  const orderId = parseInt(match[1]);
  
  // Запускаем сцену обработки заказа
  return ctx.scene.enter('process_order', { orderId });
};

// Список заказов в обработке
const processingOrders = async (ctx) => {
  try {
    const orders = await Order.findAll({
      where: { 
        status: 'processing',
        processed_by: ctx.user.id
      },
      include: [
        { model: OrderItem, as: 'orderItems' },
        { model: Restaurant, as: 'restaurant' },
        { model: User, as: 'user' }
      ],
      order: [['processed_at', 'DESC']],
      limit: 20
    });

    if (orders.length === 0) {
      return ctx.reply('📋 У вас нет заказов в обработке');
    }

    let message = '⏳ <b>Заказы в обработке:</b>\n';
    
    orders.forEach(order => {
      message += `\n📋 Заказ #${order.order_number}\n`;
      message += `🏢 ${order.restaurant.name}\n`;
      message += `📅 В работе с: ${new Date(order.processed_at).toLocaleDateString('ru-RU')}\n`;
      message += `/continue_process_${order.id}\n`;
    });

    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    logger.error('Error in processingOrders:', error);
    ctx.reply('❌ Произошла ошибка при получении заказов');
  }
};

// Список одобренных заказов
const approvedOrders = async (ctx) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const orders = await Order.findAll({
      where: { 
        status: 'approved',
        approved_at: {
          [Op.gte]: today
        }
      },
      include: [
        { model: OrderItem, as: 'orderItems' },
        { model: Restaurant, as: 'restaurant' }
      ],
      order: [['approved_at', 'DESC']],
      limit: 30
    });

    if (orders.length === 0) {
      return ctx.reply('📋 Сегодня нет одобренных заказов');
    }

    let message = '✅ <b>Одобренные заказы за сегодня:</b>\n';
    let totalAmount = 0;
    
    orders.forEach(order => {
      const time = new Date(order.approved_at).toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      message += `\n📋 #${order.order_number} (${time})\n`;
      message += `🏢 ${order.restaurant.name}\n`;
      message += `💰 ${order.total_amount} ₽\n`;
      message += `📄 /generate_torg12_${order.id}\n`;
      
      totalAmount += parseFloat(order.total_amount || 0);
    });
    
    message += `\n💰 <b>Итого за день: ${totalAmount.toFixed(2)} ₽</b>`;

    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    logger.error('Error in approvedOrders:', error);
    ctx.reply('❌ Произошла ошибка при получении заказов');
  }
};

// Список отклоненных заказов
const rejectedOrders = async (ctx) => {
  try {
    const orders = await Order.findAll({
      where: { 
        status: 'rejected',
        rejected_at: {
          [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // За последнюю неделю
        }
      },
      include: [
        { model: Restaurant, as: 'restaurant' },
        { model: User, as: 'user' }
      ],
      order: [['rejected_at', 'DESC']],
      limit: 20
    });

    if (orders.length === 0) {
      return ctx.reply('📋 Нет отклоненных заказов за последнюю неделю');
    }

    let message = '❌ <b>Отклоненные заказы:</b>\n';
    
    orders.forEach(order => {
      const date = new Date(order.rejected_at).toLocaleDateString('ru-RU');
      
      message += `\n📋 #${order.order_number} (${date})\n`;
      message += `🏢 ${order.restaurant.name}\n`;
      message += `❌ Причина: ${order.rejection_reason || 'не указана'}\n`;
    });

    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    logger.error('Error in rejectedOrders:', error);
    ctx.reply('❌ Произошла ошибка при получении заказов');
  }
};

// Расписание отправки заказов для ресторана
const manageRestaurantSchedule = async (ctx, restaurantId) => {
  try {
    const { ScheduledOrder } = require('../database/models');
    
    const restaurant = await Restaurant.findByPk(restaurantId);
    if (!restaurant) {
      return ctx.reply('❌ Ресторан не найден');
    }
    
    const schedules = await ScheduledOrder.findAll({
      where: { restaurant_id: restaurantId },
      order: [['id', 'ASC']]
    });
    
    let message = `⏰ <b>Расписание отправки заказов</b>\n`;
    message += `🏢 Ресторан: ${restaurant.name}\n\n`;
    
    if (schedules.length === 0) {
      message += '📅 Расписание не настроено.\n\n';
      message += 'Заказы будут отправляться по умолчанию в 10:00 на следующий день.';
    } else {
      schedules.forEach((schedule, index) => {
        const daysMap = {
          1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс'
        };
        const days = JSON.parse(schedule.schedule_days || '[]');
        const daysStr = days.map(d => daysMap[d]).join(', ') || 'Не выбрано';
        
        message += `${index + 1}. <b>Расписание #${schedule.id}</b>\n`;
        message += `   ⏰ Время: ${schedule.schedule_time}\n`;
        message += `   📅 Дни: ${daysStr}\n`;
        message += `   📊 Статус: ${schedule.is_active ? '✅ Активно' : '❌ Неактивно'}\n`;
        message += `   /schedule_${schedule.id}\n\n`;
      });
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Добавить расписание', callback_data: `manager_schedule_add:${restaurantId}` }],
          [{ text: '🔙 Назад', callback_data: `manager_restaurant:${restaurantId}` }]
        ]
      }
    };
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
    } else {
      await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (error) {
    logger.error('Error in manageRestaurantSchedule:', error);
    ctx.reply('❌ Ошибка при загрузке расписания');
  }
};

// Статистика
const statistics = async (ctx) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Статистика за сегодня
    const todayStats = await Order.findAll({
      where: {
        created_at: {
          [Op.between]: [today, tomorrow]
        }
      },
      attributes: [
        'status',
        [Order.sequelize.fn('COUNT', 'id'), 'count'],
        [Order.sequelize.fn('SUM', Order.sequelize.col('total_amount')), 'total']
      ],
      group: ['status']
    });
    
    // Общая статистика за месяц
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthStats = await Order.findAll({
      where: {
        created_at: {
          [Op.gte]: monthStart
        },
        status: 'approved'
      },
      attributes: [
        [Order.sequelize.fn('COUNT', 'id'), 'count'],
        [Order.sequelize.fn('SUM', Order.sequelize.col('total_amount')), 'total']
      ]
    });
    
    let message = '📊 <b>Статистика обработки заказов</b>\n\n';
    message += '📅 <b>Сегодня:</b>\n';
    
    const statusMap = {
      'sent': '📤 Новых',
      'processing': '⏳ В обработке',
      'approved': '✅ Одобрено',
      'rejected': '❌ Отклонено'
    };
    
    let todayTotal = 0;
    todayStats.forEach(stat => {
      const data = stat.get({ plain: true });
      message += `${statusMap[data.status] || data.status}: ${data.count} шт`;
      if (data.total) {
        message += ` (${parseFloat(data.total).toFixed(2)} ₽)`;
        todayTotal += parseFloat(data.total);
      }
      message += '\n';
    });
    
    if (todayTotal > 0) {
      message += `💰 Сумма за день: ${todayTotal.toFixed(2)} ₽\n`;
    }
    
    const monthData = monthStats[0]?.get({ plain: true });
    if (monthData && monthData.count > 0) {
      message += `\n📅 <b>За текущий месяц:</b>\n`;
      message += `✅ Одобрено заказов: ${monthData.count}\n`;
      message += `💰 На сумму: ${parseFloat(monthData.total || 0).toFixed(2)} ₽`;
    }
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    logger.error('Error in statistics:', error);
    ctx.reply('❌ Произошла ошибка при получении статистики');
  }
};

// Быстрое одобрение заказа (устаревшая функция, оставлена для совместимости)
const approveOrder = async (ctx) => {
  await ctx.reply(
    '⚠️ Используйте команду /pending_orders для просмотра новых заявок\n' +
    'и начните обработку нажатием на команду под нужным заказом'
  );
};

// Продолжение обработки заказа
const continueProcessOrder = async (ctx) => {
  const match = ctx.message.text.match(/^\/continue_process_(\d+)$/);
  
  if (!match) {
    return ctx.reply('❌ Неверный формат команды');
  }
  
  const orderId = parseInt(match[1]);
  
  // Проверяем, что заказ обрабатывается этим менеджером
  const order = await Order.findOne({
    where: {
      id: orderId,
      status: 'processing',
      processed_by: ctx.user.id
    }
  });
  
  if (!order) {
    return ctx.reply('❌ Заказ не найден или обрабатывается другим менеджером');
  }
  
  // Запускаем сцену обработки заказа
  return ctx.scene.enter('process_order', { orderId });
};

// Обработка текстовых команд из клавиатуры
const handleTextCommands = async (ctx) => {
  const text = ctx.message.text;
  
  // Логируем для отладки
  logger.info('Manager handleTextCommands called', {
    text,
    session: {
      creatingRestaurant: ctx.session?.creatingRestaurant,
      editingRestaurant: ctx.session?.editingRestaurant,
      awaitingBranchAddress: ctx.session?.awaitingBranchAddress,
      isManagerAddingBranch: ctx.session?.isManagerAddingBranch,
      editingRestaurantId: ctx.session?.editingRestaurantId
    }
  });
  
  // Обработка редактирования времени расписания
  if (ctx.session?.editingScheduleId && ctx.session?.editingScheduleField === 'time') {
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    
    if (!timeRegex.test(text)) {
      await ctx.reply(
        '❌ Неверный формат времени.\n\n' +
        'Введите время в формате HH:MM (например, 09:30)',
        { parse_mode: 'HTML' }
      );
      return true;
    }
    
    try {
      const { ScheduledOrder } = require('../database/models');
      const orderSchedulerService = require('../services/OrderSchedulerService');
      
      const schedule = await ScheduledOrder.findByPk(ctx.session.editingScheduleId);
      if (!schedule) {
        await ctx.reply('❌ Расписание не найдено');
        return true;
      }
      
      schedule.schedule_time = text;
      await schedule.save();
      
      await orderSchedulerService.updateRestaurantSchedule(schedule.restaurant_id);
      
      await ctx.reply('✅ Время обновлено');
      
      // Показываем обновленное расписание
      const updatedSchedule = await ScheduledOrder.findByPk(ctx.session.editingScheduleId, {
        include: [{
          model: Restaurant,
          as: 'restaurant'
        }]
      });
      
      await showScheduleDetails(ctx, updatedSchedule);
      
      // Очищаем сессию
      delete ctx.session.editingScheduleId;
      delete ctx.session.editingScheduleField;
      
    } catch (error) {
      logger.error('Error updating schedule time:', error);
      await ctx.reply('❌ Ошибка при обновлении времени');
    }
    
    return true;
  }
  
  // Проверяем все активные состояния сессии
  if (ctx.session?.creatingRestaurant || 
      ctx.session?.editingRestaurant || 
      ctx.session?.awaitingBranchAddress ||
      ctx.session?.isManagerAddingBranch ||
      ctx.session?.editingRestaurantId) {
    // Если есть активные состояния, передаем обработку дальше
    logger.info('Manager has active session state, skipping menu handling');
    return false;
  }
  
  // Проверяем создание ресторана
  if (ctx.session?.creatingRestaurant) {
    const restaurantName = text.trim();
    
    if (restaurantName.length < 3) {
      await ctx.reply('❌ Название ресторана слишком короткое. Введите корректное название:');
      return true;
    }
    
    try {
      // Создаем новый ресторан
      const restaurant = await Restaurant.create({
        name: restaurantName,
        is_active: true
      });
      
      // Создаем главный филиал
      const { RestaurantBranch } = require('../database/models');
      await RestaurantBranch.create({
        restaurantId: restaurant.id,
        address: `Главный филиал ${restaurantName}`,
        isMain: true,
        isActive: true
      });
      
      delete ctx.session.creatingRestaurant;
      
      await ctx.reply(
        `✅ <b>Ресторан создан!</b>\n\n` +
        `Название: ${restaurantName}\n` +
        `ID: ${restaurant.id}\n` +
        `Создан главный филиал\n\n` +
        `Теперь вы можете привязать пользователей к этому ресторану.`,
        { parse_mode: 'HTML' }
      );
      
      // Показываем информацию о ресторане
      return manageRestaurant(ctx, restaurant.id);
    } catch (error) {
      logger.error('Error creating restaurant:', error);
      await ctx.reply('❌ Ошибка при создании ресторана');
    }
    
    delete ctx.session.creatingRestaurant;
    return true;
  }
  
  // Эти проверки теперь не нужны здесь, так как мы уже проверили выше
  // и вернули false если есть активные состояния
  
  switch (text) {
    case '📋 Заявки':
      return ordersSubmenu(ctx);
    case '👥 Управление пользователями':
      // Вызываем функцию управления пользователями из adminHandlers
      const { usersManagement } = require('./adminHandlers');
      return usersManagement(ctx);
    case '🏢 Рестораны':
      return restaurantsList(ctx);
    case '📊 Статистика':
      return statistics(ctx);
    case '📑 Сводка заказов':
      return consolidatedOrders(ctx);
    case '💰 Рентабельность':
      // Передаем управление в analytics handler
      return false;
    case '📈 Обновить цены':
      // Передаем управление в analytics handler
      return false;
    case '📧 Email настройки':
      // Передаем управление в email settings handler
      return false;
    case '⚙️ Настройки':
      return ctx.reply('Настройки менеджера в разработке');
    case '🔙 Главное меню':
      return ctx.scene.leave();
    default:
      return false;
  }
};

// Список заявок на регистрацию
const pendingRegistrations = async (ctx) => {
  try {
    const { RegistrationRequest } = require('../database/models');
    
    const requests = await RegistrationRequest.findAll({
      where: { status: 'pending' },
      order: [['created_at', 'DESC']],
      limit: 20
    });
    
    if (requests.length === 0) {
      return ctx.reply('✅ Нет новых заявок на регистрацию');
    }
    
    let message = '👥 <b>Заявки на регистрацию</b>\n\n';
    
    requests.forEach((request, index) => {
      message += `${index + 1}. ${request.first_name || ''} ${request.last_name || ''}\n`;
      message += `📱 @${request.username || 'нет username'}\n`;
      
      if (request.notes || request.contact_info) {
        const info = (request.notes || request.contact_info).substring(0, 50);
        message += `📝 ${info}${(request.notes || request.contact_info).length > 50 ? '...' : ''}\n`;
      }
      
      message += `📅 ${new Date(request.created_at).toLocaleString('ru-RU')}\n\n`;
    });
    
    message += '💡 Для обработки заявок используйте кнопку "Обработать заявку" в уведомлениях';
    
    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    logger.error('Error in pendingRegistrations:', error);
    ctx.reply('❌ Ошибка при загрузке заявок на регистрацию');
  }
};

// Обработанные заказы
const processedOrders = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const orders = await Order.findAll({
      where: {
        status: ['approved', 'completed', 'rejected']
      },
      include: [{
        model: Restaurant,
        as: 'restaurant'
      }],
      order: [['updated_at', 'DESC']],
      limit: 20
    });

    let message = '✅ <b>Обработанные заказы</b>\n\n';
    
    if (orders.length === 0) {
      message += 'Нет обработанных заказов';
    } else {
      orders.forEach((order, index) => {
        const statusEmoji = {
          'approved': '✅',
          'completed': '📦',
          'rejected': '❌'
        };
        
        message += `${index + 1}. ${statusEmoji[order.status]} Заказ #${order.id}\n`;
        message += `🏢 ${order.restaurant.name}\n`;
        message += `📅 ${new Date(order.created_at).toLocaleDateString('ru-RU')}\n`;
        message += `💰 ${order.total_amount || 0} руб.\n\n`;
      });
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Назад в меню', callback_data: 'menu_main' }]
        ]
      }
    };
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error in processedOrders:', error);
    ctx.reply('Произошла ошибка при загрузке обработанных заказов');
  }
};

// Список ресторанов
const restaurantsList = async (ctx) => {
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }
    
    const { RestaurantBranch } = require('../database/models');
    
    const restaurants = await Restaurant.findAll({
      where: { is_active: true },
      include: [
        {
          model: User,
          as: 'users'
        },
        {
          model: RestaurantBranch,
          as: 'branches',
          where: { isActive: true },
          required: false
        }
      ],
      order: [['name', 'ASC']]
    });
    
    let message = '🏢 <b>Список ресторанов</b>\n\n';
    
    if (restaurants.length === 0) {
      message += 'Нет активных ресторанов\n';
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ Создать ресторан', callback_data: 'manager_create_restaurant' }],
            [{ text: '🔙 Назад в меню', callback_data: 'menu_main' }]
          ]
        }
      };
      
      return ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    }
    
    // Создаем кнопки для каждого ресторана
    const restaurantButtons = restaurants.map(restaurant => [{
      text: `🏢 ${restaurant.name} (${restaurant.users?.length || 0} польз., ${restaurant.branches?.length || 0} фил.)`,
      callback_data: `manager_restaurant:${restaurant.id}`
    }]);
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          ...restaurantButtons,
          [{ text: '➕ Создать ресторан', callback_data: 'manager_create_restaurant' }],
          [{ text: '🔙 Назад в меню', callback_data: 'menu_main' }]
        ]
      }
    };
    
    message += 'Выберите ресторан для управления:';
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
    } else {
      await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (error) {
    logger.error('Error in restaurantsList:', error);
    ctx.reply('Произошла ошибка при загрузке списка ресторанов');
  }
};

// Подменю заявок
const ordersSubmenu = async (ctx) => {
  try {
    const { RegistrationRequest } = require('../database/models');
    
    // Подсчитываем количество заявок
    const [newOrdersCount, processingCount, registrationCount] = await Promise.all([
      Order.count({ where: { status: 'sent' } }),
      Order.count({ where: { status: 'processing', processed_by: ctx.user.id } }),
      RegistrationRequest.count({ where: { status: 'pending' } })
    ]);
    
    let message = '📋 <b>Управление заявками</b>\n\n';
    
    if (newOrdersCount > 0) {
      message += `📥 Новых заявок на закупку: ${newOrdersCount}\n`;
    }
    if (processingCount > 0) {
      message += `⏳ В обработке: ${processingCount}\n`;
    }
    if (registrationCount > 0) {
      message += `👥 Заявок на регистрацию: ${registrationCount}\n`;
    }
    
    message += '\nВыберите тип заявок:';
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: `📥 Новые заявки${newOrdersCount > 0 ? ` (${newOrdersCount})` : ''}`, callback_data: 'orders_new' },
            { text: `⏳ В обработке${processingCount > 0 ? ` (${processingCount})` : ''}`, callback_data: 'orders_processing' }
          ],
          [
            { text: '✅ Одобренные', callback_data: 'orders_approved' },
            { text: '❌ Отклонённые', callback_data: 'orders_rejected' }
          ],
          [
            { text: `👥 Заявки на регистрацию${registrationCount > 0 ? ` (${registrationCount})` : ''}`, callback_data: 'admin_users_pending' }
          ],
          [
            { text: '🔙 Назад в меню', callback_data: 'menu_back' }
          ]
        ]
      }
    };
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
    } else {
      await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (error) {
    logger.error('Error in ordersSubmenu:', error);
    ctx.reply('❌ Произошла ошибка при загрузке меню заявок');
  }
};

// Управление конкретным рестораном
const manageRestaurant = async (ctx, restaurantId) => {
  try {
    const { RestaurantBranch } = require('../database/models');
    
    const restaurant = await Restaurant.findByPk(restaurantId, {
      include: [
        {
          model: User,
          as: 'users'
        },
        {
          model: RestaurantBranch,
          as: 'branches',
          where: { isActive: true },
          required: false
        }
      ]
    });
    
    if (!restaurant) {
      return ctx.reply('❌ Ресторан не найден');
    }
    
    let message = `🏢 <b>${restaurant.name}</b>\n\n`;
    message += `<b>Информация:</b>\n`;
    message += `📍 Адрес: ${restaurant.address || 'не указан'}\n`;
    message += `📞 Телефон: ${restaurant.contact_phone || 'не указан'}\n`;
    message += `📧 Email: ${restaurant.contact_email || 'не указан'}\n`;
    message += `👤 Контактное лицо: ${restaurant.contact_person || 'не указано'}\n\n`;
    
    message += `<b>Статистика:</b>\n`;
    message += `👥 Пользователей: ${restaurant.users?.length || 0}\n`;
    message += `🏢 Филиалов: ${restaurant.branches?.length || 0}\n\n`;
    
    if (restaurant.branches && restaurant.branches.length > 0) {
      message += `<b>Филиалы:</b>\n`;
      restaurant.branches.forEach((branch, index) => {
        message += `${index + 1}. 📍 ${branch.address}`;
        if (branch.isMain) message += ' (Главный)';
        message += '\n';
      });
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ Редактировать информацию', callback_data: `manager_edit_restaurant:${restaurantId}` }],
          [{ text: '🏢 Управление филиалами', callback_data: `manager_branches:${restaurantId}` }],
          [{ text: '👥 Пользователи ресторана', callback_data: `manager_restaurant_users:${restaurantId}` }],
          [{ text: '⏰ Расписание отправки заказов', callback_data: `manager_restaurant_schedule:${restaurantId}` }],
          [{ text: '📊 Статистика заказов', callback_data: `manager_restaurant_stats:${restaurantId}` }],
          [{ text: '🔙 Назад к списку', callback_data: 'menu_restaurants' }]
        ]
      }
    };
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
    } else {
      await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (error) {
    logger.error('Error in manageRestaurant:', error);
    ctx.reply('❌ Ошибка при загрузке информации о ресторане');
  }
};

// Показать меню редактирования ресторана
const showEditRestaurantMenu = async (ctx, restaurantId) => {
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Название', callback_data: `edit_rest_name:${restaurantId}` }],
        [{ text: '📍 Адрес', callback_data: `edit_rest_address:${restaurantId}` }],
        [{ text: '📞 Телефон', callback_data: `edit_rest_phone:${restaurantId}` }],
        [{ text: '📧 Email', callback_data: `edit_rest_email:${restaurantId}` }],
        [{ text: '👤 Контактное лицо', callback_data: `edit_rest_contact:${restaurantId}` }],
        [{ text: '🔙 Назад', callback_data: `manager_restaurant:${restaurantId}` }]
      ]
    }
  };
  
  const message = '✏️ <b>Редактирование ресторана</b>\n\n' +
    'Выберите, что хотите изменить:';
  
  if (ctx.callbackQuery) {
    await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
  } else {
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  }
};

// Обработка callback'ов менеджера
const handleManagerCallbacks = async (ctx) => {
  try {
    const action = ctx.callbackQuery.data;
    
    // Возврат в главное меню менеджера
    if (action === 'manager_main') {
      await ctx.answerCbQuery();
      return menu(ctx);
    }
    
    // Управление конкретным рестораном
    if (action.startsWith('manager_restaurant:')) {
      const restaurantId = parseInt(action.split(':')[1]);
      await ctx.answerCbQuery();
      return manageRestaurant(ctx, restaurantId);
    }
    
    // Управление филиалами
    if (action.startsWith('manager_branches:')) {
      const restaurantId = parseInt(action.split(':')[1]);
      await ctx.answerCbQuery();
      const { manageBranches } = require('./restaurantBranch');
      return manageBranches(ctx, restaurantId);
    }
    
    // Управление расписанием ресторана
    if (action.startsWith('manager_restaurant_schedule:')) {
      const restaurantId = parseInt(action.split(':')[1]);
      await ctx.answerCbQuery();
      return manageRestaurantSchedule(ctx, restaurantId);
    }
    
    // Добавление расписания
    if (action.startsWith('manager_schedule_add:')) {
      const restaurantId = parseInt(action.split(':')[1]);
      await ctx.answerCbQuery();
      await ctx.scene.enter('addScheduleScene', { restaurantId });
      return;
    }
    
    // Переключение статуса расписания
    if (action.startsWith('manager_schedule_toggle_')) {
      const scheduleId = parseInt(action.split('_')[3]);
      await ctx.answerCbQuery();
      
      const { ScheduledOrder } = require('../database/models');
      const orderSchedulerService = require('../services/OrderSchedulerService');
      
      const schedule = await ScheduledOrder.findByPk(scheduleId);
      if (!schedule) {
        return ctx.reply('❌ Расписание не найдено');
      }
      
      schedule.is_active = !schedule.is_active;
      await schedule.save();
      
      await orderSchedulerService.updateRestaurantSchedule(schedule.restaurant_id);
      
      await ctx.reply(`✅ Расписание ${schedule.is_active ? 'активировано' : 'приостановлено'}`);
      return;
    }
    
    // Редактирование времени расписания
    if (action.startsWith('manager_schedule_edit_time_')) {
      const scheduleId = parseInt(action.split('_')[4]);
      await ctx.answerCbQuery();
      
      ctx.session = ctx.session || {};
      ctx.session.editingScheduleId = scheduleId;
      ctx.session.editingScheduleField = 'time';
      
      await ctx.reply(
        '⏰ <b>Изменение времени отправки</b>\n\n' +
        'Введите новое время в формате HH:MM (например, 09:30):\n\n' +
        '⚠️ Время указывается по Самарскому времени (UTC+4)',
        { parse_mode: 'HTML' }
      );
      return;
    }
    
    // Редактирование дней расписания
    if (action.startsWith('manager_schedule_edit_days_')) {
      const scheduleId = parseInt(action.split('_')[4]);
      await ctx.answerCbQuery();
      
      ctx.session = ctx.session || {};
      ctx.session.editingScheduleId = scheduleId;
      ctx.session.editingScheduleField = 'days';
      
      // Показываем клавиатуру для выбора дней
      const { ScheduledOrder } = require('../database/models');
      const schedule = await ScheduledOrder.findByPk(scheduleId);
      const days = JSON.parse(schedule.schedule_days || '[]');
      
      // Инициализируем selectedDays текущими днями
      ctx.session.selectedDays = [...days];
      
      const daysButtons = [];
      const daysMap = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      
      for (let i = 0; i < 7; i++) {
        const dayNum = i + 1;
        const isSelected = days.includes(dayNum);
        daysButtons.push({
          text: `${isSelected ? '✅' : '⬜'} ${daysMap[i]}`,
          callback_data: `manager_edit_day_${dayNum}`
        });
      }
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            daysButtons.slice(0, 4),
            daysButtons.slice(4, 7),
            [{ text: '✅ Сохранить изменения', callback_data: 'manager_save_schedule_days' }],
            [{ text: '❌ Отмена', callback_data: 'manager_cancel_schedule_edit' }]
          ]
        }
      };
      
      await ctx.reply(
        '📅 <b>Выберите дни для отправки заказов:</b>\n\n' +
        'Нажмите на дни недели для выбора/отмены',
        { parse_mode: 'HTML', ...keyboard }
      );
      return;
    }
    
    // Обработка выбора дня недели при редактировании расписания
    if (action.startsWith('manager_edit_day_')) {
      const day = parseInt(action.split('_')[3]);
      await ctx.answerCbQuery();
      
      ctx.session = ctx.session || {};
      if (!ctx.session.selectedDays) {
        // Загружаем текущие дни из расписания
        const { ScheduledOrder } = require('../database/models');
        const schedule = await ScheduledOrder.findByPk(ctx.session.editingScheduleId);
        ctx.session.selectedDays = JSON.parse(schedule.schedule_days || '[]');
      }
      
      // Переключаем день
      const index = ctx.session.selectedDays.indexOf(day);
      if (index === -1) {
        ctx.session.selectedDays.push(day);
      } else {
        ctx.session.selectedDays.splice(index, 1);
      }
      
      // Обновляем клавиатуру
      const daysButtons = [];
      const daysMap = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      
      for (let i = 0; i < 7; i++) {
        const dayNum = i + 1;
        const isSelected = ctx.session.selectedDays.includes(dayNum);
        daysButtons.push({
          text: `${isSelected ? '✅' : '⬜'} ${daysMap[i]}`,
          callback_data: `manager_edit_day_${dayNum}`
        });
      }
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            daysButtons.slice(0, 4),
            daysButtons.slice(4, 7),
            [{ text: '✅ Сохранить изменения', callback_data: 'manager_save_schedule_days' }],
            [{ text: '❌ Отмена', callback_data: 'manager_cancel_schedule_edit' }]
          ]
        }
      };
      
      try {
        await ctx.editMessageReplyMarkup(keyboard.reply_markup);
      } catch (error) {
        // Если не удалось отредактировать, отправляем новое сообщение
        await ctx.reply(
          '📅 <b>Выберите дни для отправки заказов:</b>\n\n' +
          'Нажмите на дни недели для выбора/отмены',
          { parse_mode: 'HTML', ...keyboard }
        );
      }
      return;
    }
    
    // Сохранение изменений дней расписания
    if (action === 'manager_save_schedule_days') {
      await ctx.answerCbQuery();
      
      if (!ctx.session?.editingScheduleId || !ctx.session?.selectedDays) {
        await ctx.reply('❌ Ошибка: не найдена информация о редактируемом расписании');
        return;
      }
      
      const { ScheduledOrder } = require('../database/models');
      const schedule = await ScheduledOrder.findByPk(ctx.session.editingScheduleId);
      
      if (!schedule) {
        await ctx.reply('❌ Расписание не найдено');
        return;
      }
      
      // Сортируем дни
      ctx.session.selectedDays.sort((a, b) => a - b);
      
      // Сохраняем изменения
      schedule.schedule_days = JSON.stringify(ctx.session.selectedDays);
      await schedule.save();
      
      // Обновляем расписание в сервисе
      const OrderSchedulerService = require('../services/OrderSchedulerService');
      await OrderSchedulerService.updateRestaurantSchedule(schedule.restaurant_id);
      
      // Формируем сообщение с деталями
      const daysMap = {
        1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс'
      };
      const daysStr = ctx.session.selectedDays.map(d => daysMap[d]).join(', ') || 'Не выбрано';
      
      // Очищаем сессию
      delete ctx.session.editingScheduleId;
      delete ctx.session.editingScheduleField;
      delete ctx.session.selectedDays;
      
      const message = '✅ <b>Расписание успешно обновлено!</b>\n\n' +
        `📅 <b>Новые дни отправки:</b> ${daysStr}\n` +
        `⏰ <b>Время отправки:</b> ${schedule.schedule_time}\n\n` +
        `Заказы будут автоматически отправляться в выбранные дни.`;
      
      // Добавляем кнопку для возврата к деталям расписания
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 К деталям расписания', callback_data: `schedule_${schedule.id}` }],
            [{ text: '🔙 К списку расписаний', callback_data: `manager_restaurant_schedule:${schedule.restaurant_id}` }]
          ]
        }
      };
      
      await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
      return;
    }
    
    // Отмена редактирования расписания
    if (action === 'manager_cancel_schedule_edit') {
      await ctx.answerCbQuery('Отменено');
      
      // Очищаем сессию
      delete ctx.session?.editingScheduleId;
      delete ctx.session?.editingScheduleField;
      delete ctx.session?.selectedDays;
      
      await ctx.editMessageText('❌ Редактирование отменено');
      return;
    }
    
    // Удаление расписания
    if (action.startsWith('manager_schedule_delete_')) {
      const scheduleId = parseInt(action.split('_')[3]);
      await ctx.answerCbQuery();
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Да, удалить', callback_data: `manager_confirm_delete_schedule_${scheduleId}` },
              { text: '❌ Отмена', callback_data: `schedule_${scheduleId}` }
            ]
          ]
        }
      };
      
      await ctx.reply(
        '⚠️ <b>Подтверждение удаления</b>\n\n' +
        'Вы действительно хотите удалить это расписание?',
        { parse_mode: 'HTML', ...keyboard }
      );
      return;
    }
    
    // Редактирование ресторана
    if (action.startsWith('manager_edit_restaurant:')) {
      const restaurantId = parseInt(action.split(':')[1]);
      await ctx.answerCbQuery();
      
      ctx.session = ctx.session || {};
      ctx.session.editingRestaurantId = restaurantId;
      
      return showEditRestaurantMenu(ctx, restaurantId);
    }
    
    // Обработка редактирования полей ресторана
    if (action.match(/^edit_rest_(name|address|phone|email|contact):(\d+)$/)) {
      const match = action.match(/^edit_rest_(name|address|phone|email|contact):(\d+)$/);
      const field = match[1];
      const restaurantId = parseInt(match[2]);
      await ctx.answerCbQuery();
      
      const fieldMap = {
        name: { field: 'name', label: 'название' },
        address: { field: 'address', label: 'адрес' },
        phone: { field: 'contact_phone', label: 'телефон' },
        email: { field: 'contact_email', label: 'email' },
        contact: { field: 'contact_person', label: 'контактное лицо' }
      };
      
      const fieldInfo = fieldMap[field];
      
      ctx.session = ctx.session || {};
      ctx.session.editingRestaurant = {
        field: fieldInfo.field,
        restaurantId: restaurantId
      };
      // Устанавливаем флаг, что мы в режиме редактирования
      ctx.session.editingRestaurantId = restaurantId;
      
      logger.info('Setting editingRestaurant session', {
        field: fieldInfo.field,
        restaurantId: restaurantId,
        session: ctx.session
      });
      
      await ctx.editMessageText(
        `✏️ Введите новое ${fieldInfo.label}:`,
        { parse_mode: 'HTML' }
      );
      return;
    }
    
    // Создание нового ресторана
    if (action === 'manager_create_restaurant') {
      await ctx.answerCbQuery();
      
      ctx.session = ctx.session || {};
      ctx.session.creatingRestaurant = true;
      
      await ctx.editMessageText(
        '🏢 <b>Создание нового ресторана</b>\n\n' +
        'Введите название ресторана:',
        { parse_mode: 'HTML' }
      );
      return;
    }
    
  } catch (error) {
    logger.error('Error in handleManagerCallbacks:', error);
    ctx.answerCbQuery('Произошла ошибка');
  }
};

// Показать детали расписания для менеджера
const showScheduleDetails = async (ctx, schedule) => {
  try {
    const daysMap = {
      1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс'
    };
    const days = JSON.parse(schedule.schedule_days || '[]');
    const daysStr = days.map(d => daysMap[d]).join(', ') || 'Не выбрано';
    
    let message = `⏰ <b>Расписание #${schedule.id}</b>\n\n`;
    message += `🏢 <b>Ресторан:</b> ${schedule.restaurant.name}\n`;
    message += `⏰ <b>Время:</b> ${schedule.schedule_time}\n`;
    message += `📅 <b>Дни:</b> ${daysStr}\n`;
    message += `📊 <b>Статус:</b> ${schedule.is_active ? '✅ Активно' : '❌ Неактивно'}\n`;
    
    if (schedule.next_run) {
      message += `⏭️ <b>Следующая отправка:</b> ${formatInTimezone(schedule.next_run)}\n`;
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { 
              text: schedule.is_active ? '⏸️ Приостановить' : '▶️ Активировать', 
              callback_data: `manager_schedule_toggle_${schedule.id}` 
            }
          ],
          [
            { text: '📝 Изменить время', callback_data: `manager_schedule_edit_time_${schedule.id}` },
            { text: '📅 Изменить дни', callback_data: `manager_schedule_edit_days_${schedule.id}` }
          ],
          [
            { text: '🗑️ Удалить расписание', callback_data: `manager_schedule_delete_${schedule.id}` }
          ],
          [
            { text: '🔙 К списку расписаний', callback_data: `manager_restaurant_schedule:${schedule.restaurant_id}` }
          ]
        ]
      }
    };
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error in showScheduleDetails:', error);
    ctx.reply('❌ Ошибка при отображении расписания');
  }
};

// Консолидированный отчет по заказам
const consolidatedOrders = async (ctx) => {
  try {
    const { Order, OrderItem, Restaurant, RestaurantBranch, NomenclatureCache } = require('../database/models');
    const { Op } = require('sequelize');
    const { formatInTimezone } = require('../utils/timezone');
    
    // Получаем заказы за последние 24 часа
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    
    const orders = await Order.findAll({
      where: {
        order_date: {
          [Op.gte]: yesterday
        },
        status: ['new', 'processed', 'sent'] // Все активные статусы
      },
      include: [
        {
          model: OrderItem,
          as: 'orderItems',
          include: [{
            model: NomenclatureCache,
            as: 'product'
          }]
        },
        {
          model: Restaurant,
          as: 'restaurant'
        },
        {
          model: RestaurantBranch,
          as: 'branch'
        }
      ],
      order: [['order_date', 'DESC']]
    });
    
    if (orders.length === 0) {
      await ctx.reply('📋 За последние 24 часа заказов не было');
      return true;
    }
    
    // Группируем продукты по наименованию и единице измерения
    const consolidatedProducts = new Map();
    let totalOrders = 0;
    const restaurantsSummary = new Map();
    
    for (const order of orders) {
      totalOrders++;
      
      // Подсчет по ресторанам
      const restaurantKey = order.restaurant.name;
      if (!restaurantsSummary.has(restaurantKey)) {
        restaurantsSummary.set(restaurantKey, {
          name: restaurantKey,
          ordersCount: 0,
          branches: new Set()
        });
      }
      const restaurantData = restaurantsSummary.get(restaurantKey);
      restaurantData.ordersCount++;
      if (order.branch) {
        restaurantData.branches.add(order.branch.address);
      }
      
      // Группировка продуктов
      for (const item of order.orderItems) {
        const productKey = `${item.product_name}|${item.unit}`;
        
        if (!consolidatedProducts.has(productKey)) {
          consolidatedProducts.set(productKey, {
            name: item.product_name,
            unit: item.unit,
            totalQuantity: 0,
            restaurants: new Map()
          });
        }
        
        const productData = consolidatedProducts.get(productKey);
        productData.totalQuantity += parseFloat(item.quantity);
        
        // Подсчет по ресторанам для каждого продукта
        if (!productData.restaurants.has(restaurantKey)) {
          productData.restaurants.set(restaurantKey, 0);
        }
        productData.restaurants.set(
          restaurantKey, 
          productData.restaurants.get(restaurantKey) + parseFloat(item.quantity)
        );
      }
    }
    
    // Формируем сообщение
    let message = '📑 <b>Сводка заказов за последние 24 часа</b>\n\n';
    message += `📅 Период: ${formatInTimezone(yesterday)} - ${formatInTimezone(new Date())}\n`;
    message += `📦 Всего заказов: ${totalOrders}\n`;
    message += `🏢 Рестораны: ${restaurantsSummary.size}\n\n`;
    
    // Сводка по ресторанам
    message += '🏢 <b>По ресторанам:</b>\n';
    for (const [name, data] of restaurantsSummary) {
      message += `• ${name}: ${data.ordersCount} заказов`;
      if (data.branches.size > 0) {
        message += ` (${data.branches.size} филиалов)`;
      }
      message += '\n';
    }
    message += '\n';
    
    // Сводка по продуктам
    message += '📦 <b>Консолидированный список продуктов:</b>\n\n';
    
    // Сортируем продукты по названию
    const sortedProducts = Array.from(consolidatedProducts.values())
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    
    for (const product of sortedProducts) {
      message += `<b>${product.name}</b> - ${product.totalQuantity} ${product.unit}\n`;
      
      // Если продукт заказан из нескольких ресторанов, показываем детали
      if (product.restaurants.size > 1) {
        for (const [restaurant, quantity] of product.restaurants) {
          message += `   • ${restaurant}: ${quantity} ${product.unit}\n`;
        }
      }
      message += '\n';
    }
    
    // Разбиваем длинные сообщения
    const messages = [];
    const lines = message.split('\n');
    let currentMessage = '';
    
    for (const line of lines) {
      if (currentMessage.length + line.length > 3900) {
        messages.push(currentMessage);
        currentMessage = line + '\n';
      } else {
        currentMessage += line + '\n';
      }
    }
    if (currentMessage) {
      messages.push(currentMessage);
    }
    
    // Отправляем сообщения
    for (let i = 0; i < messages.length; i++) {
      await ctx.reply(messages[i], { parse_mode: 'HTML' });
      
      // Добавляем кнопку экспорта только к последнему сообщению
      if (i === messages.length - 1) {
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📥 Экспорт в Excel', callback_data: 'export_consolidated_orders' }],
              [{ text: '🔙 Назад', callback_data: 'manager_main' }]
            ]
          }
        };
        await ctx.reply('Выберите действие:', keyboard);
      }
    }
    
    return true;
  } catch (error) {
    logger.error('Error in consolidatedOrders:', error);
    await ctx.reply('❌ Произошла ошибка при формировании сводки заказов');
    return true;
  }
};

module.exports = {
  menu,
  pendingOrders,
  approveOrder,
  processOrderCommand,
  processingOrders,
  approvedOrders,
  rejectedOrders,
  statistics,
  continueProcessOrder,
  handleTextCommands,
  processedOrders,
  restaurantsList,
  ordersSubmenu,
  manageRestaurant,
  manageRestaurantSchedule,
  showScheduleDetails,
  handleManagerCallbacks,
  showEditRestaurantMenu,
  consolidatedOrders
};