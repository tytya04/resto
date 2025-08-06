const { Markup } = require('telegraf');
const { Order, OrderItem, Restaurant, Purchase, PurchaseItem, User } = require('../database/models');
const { Op } = require('sequelize');
const OrderService = require('../services/OrderService');
const logger = require('../utils/logger');
const moment = require('moment');
const { formatInTimezone } = require('../utils/timezone');
const { notificationService } = require('../services/NotificationService');

// Меню закупщика
const menu = async (ctx) => {
  const keyboard = Markup.keyboard([
    ['📋 Общий список продуктов', '📦 Заявки по ресторанам'],
    ['🛒 Закупка', '📊 Комплектация корзин'],
    ['✅ Завершенные заказы', '📈 Статистика'],
    ['🔙 Главное меню']
  ]).resize();

  await ctx.reply(
    '🛒 <b>Меню закупщика</b>\n\n' +
    'Выберите раздел для работы:',
    { 
      reply_markup: keyboard,
      parse_mode: 'HTML' 
    }
  );
};

// Консолидированный список для закупки
const consolidatedList = async (ctx) => {
  try {
    // Получаем консолидированные заказы
    const consolidated = await OrderService.getConsolidatedOrders();
    
    if (consolidated.length === 0) {
      return ctx.reply('📋 Нет заказов для консолидации');
    }
    
    // Получаем активные закупки для проверки
    const activePurchases = await OrderService.getActivePurchases();
    const activePurchaseIds = new Set(activePurchases.map(p => p.consolidated_product_id));
    
    let message = '📋 <b>Консолидированный список для закупки</b>\n\n';
    
    // Группируем по категориям
    const byCategory = {};
    consolidated.forEach(item => {
      const category = item.category || 'Без категории';
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(item);
    });
    
    // Формируем inline клавиатуру
    const inlineKeyboard = [];
    
    // Выводим по категориям
    Object.entries(byCategory).forEach(([category, items]) => {
      message += `\n<b>📂 ${category}</b>\n`;
      
      items.forEach(item => {
        const isActive = activePurchaseIds.has(item.consolidated_product_id);
        const statusEmoji = isActive ? '🔄' : '📦';
        
        // Добавляем техническую пометку к названию, если она есть
        let productName = item.product_name;
        if (item.technical_note) {
          productName += ` (${item.technical_note})`;
        }
        
        message += `\n${statusEmoji} <b>${productName}</b>\n`;
        message += `   📏 ${item.total_quantity} ${item.unit} (из ${item.orders_count} заказов)\n`;
        
        if (item.average_price > 0) {
          message += `   💰 ~${item.average_price} ₽/${item.unit}\n`;
        }
        
        if (isActive) {
          message += `   ⚠️ <i>Уже в закупке</i>\n`;
        } else {
          // Добавляем кнопку для закупки
          inlineKeyboard.push([{
            text: `🛒 Закупить ${item.product_name}`,
            callback_data: `purchase_start:${item.consolidated_product_id}`
          }]);
        }
      });
    });
    
    message += '\n\n💡 Нажмите на кнопку под продуктом для начала закупки';
    
    const keyboard = inlineKeyboard.length > 0 ? {
      reply_markup: { inline_keyboard: inlineKeyboard }
    } : {};
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    
  } catch (error) {
    logger.error('Error in consolidatedList:', error);
    ctx.reply('❌ Произошла ошибка при получении списка');
  }
};

// Команда начала закупки конкретного продукта
const purchaseProductCommand = async (ctx) => {
  const match = ctx.message.text.match(/^\/purchase_(.+)$/);
  
  if (!match) {
    return ctx.reply('❌ Неверный формат команды');
  }
  
  const consolidatedProductId = match[1];
  
  try {
    // Получаем актуальные данные о консолидированном продукте
    const consolidated = await OrderService.getConsolidatedOrders();
    const product = consolidated.find(item => item.consolidated_product_id === consolidatedProductId);
    
    if (!product) {
      return ctx.reply('❌ Продукт не найден в консолидированном списке');
    }
    
    // Запускаем сцену закупки
    return ctx.scene.enter('purchase_product', {
      consolidatedProductId,
      consolidatedProduct: product
    });
    
  } catch (error) {
    logger.error('Error in purchaseProductCommand:', error);
    ctx.reply('❌ Произошла ошибка при начале закупки');
  }
};

// Список активных закупок
const activePurchases = async (ctx) => {
  try {
    // Отвечаем на callback query если это callback
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }
    
    logger.info('activePurchases called', { userId: ctx.user.id, role: ctx.user.role });
    
    // Проверяем есть ли активная закупка (включая этап сборки)
    const activePurchase = await Purchase.findOne({
      where: {
        buyer_id: ctx.user.id,
        status: ['pending', 'in_progress', 'packing'],
        product_name: 'Закупочная сессия' // Фильтруем только закупочные сессии
      }
    });
    
    logger.info('Active purchase found:', { 
      found: !!activePurchase, 
      purchaseId: activePurchase?.id,
      status: activePurchase?.status 
    });
    
    if (activePurchase) {
      // Если закупка в статусе packing - показываем интерфейс сборки
      if (activePurchase.status === 'packing') {
        const orders = await Order.findAll({
          where: { status: 'purchased' },
          include: [
            { model: OrderItem, as: 'orderItems' },
            { model: Restaurant, as: 'restaurant' }
          ]
        });
        return showPackingInterface(ctx, activePurchase, orders);
      }
      
      // Иначе показываем прогресс закупки
      return showActivePurchase(ctx, activePurchase);
    }
    
    // Если нет активной закупки, показываем консолидированный список
    const consolidated = await OrderService.getConsolidatedOrders();
    
    if (consolidated.length === 0) {
      return ctx.reply('📋 Нет заказов для закупки');
    }
    
    let message = '🛒 <b>Активные закупки</b>\n\n';
    message += '📋 У вас нет активной закупки.\n';
    message += 'Для начала закупки нажмите кнопку ниже:\n';
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛒 Начать закупку', callback_data: 'start_purchase_session' }],
          [{ text: '📊 Консолидированный список', callback_data: 'consolidate_orders' }]
        ]
      }
    };
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    
  } catch (error) {
    logger.error('Error in activePurchases:', error);
    ctx.reply('❌ Произошла ошибка при получении активных закупок');
  }
};

// Показать активную закупку
const showActivePurchase = async (ctx, purchase) => {
  try {
    // Получаем детали закупки
    const purchaseItems = await PurchaseItem.findAll({
      where: { purchase_id: purchase.id },
      order: [['status', 'ASC'], ['product_name', 'ASC']]
    });
    
    let message = '🛒 <b>Активная закупка</b>\n\n';
    message += `📅 Начата: ${formatInTimezone(purchase.created_at)}\n`;
    message += `📊 Статус: ${purchase.status === 'in_progress' ? 'В процессе' : 'Ожидает начала'}\n\n`;
    
    const pendingItems = purchaseItems.filter(item => item.status === 'pending');
    const completedItems = purchaseItems.filter(item => item.status === 'completed');
    
    message += `✅ Закуплено: ${completedItems.length}\n`;
    message += `⏳ Осталось: ${pendingItems.length}\n\n`;
    
    if (pendingItems.length > 0) {
      message += '<b>Следующие товары:</b>\n';
      pendingItems.slice(0, 5).forEach(item => {
        message += `• ${item.product_name} - ${item.quantity} ${item.unit}\n`;
      });
      if (pendingItems.length > 5) {
        message += `...и еще ${pendingItems.length - 5} товаров\n`;
      }
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          purchase.status === 'pending' ? 
            [{ text: '▶️ Начать закупку', callback_data: 'continue_purchase_session' }] :
            [{ text: '➡️ Продолжить закупку', callback_data: 'continue_purchase_session' }],
          [{ text: '📋 Список товаров', callback_data: 'show_purchase_list' }],
          [{ text: '❌ Отменить закупку', callback_data: 'cancel_purchase_session' }]
        ]
      }
    };
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    
  } catch (error) {
    logger.error('Error in showActivePurchase:', error);
    ctx.reply('❌ Произошла ошибка при отображении закупки');
  }
};

// Завершенные закупки
const completedPurchases = async (ctx) => {
  try {
    const purchases = await Purchase.findAll({
      where: { 
        status: 'completed',
        purchase_date: {
          [Op.gte]: moment().subtract(30, 'days').toDate()
        }
      },
      include: [
        {
          model: User,
          as: 'buyer',
          attributes: ['id', 'first_name', 'last_name', 'username']
        }
      ],
      order: [['purchase_date', 'DESC']],
      limit: 20
    });
    
    if (purchases.length === 0) {
      return ctx.reply('📋 Нет завершенных закупок за последние 30 дней');
    }
    
    let message = '✅ <b>Завершенные закупки</b>\n';
    let totalSum = 0;
    
    purchases.forEach(purchase => {
      const date = moment(purchase.purchase_date).format('DD.MM.YYYY');
      
      message += `\n📦 ${purchase.product_name}\n`;
      message += `   📏 ${purchase.purchased_quantity} ${purchase.unit}\n`;
      message += `   💰 ${purchase.total_price} ₽ (${purchase.unit_price} ₽/${purchase.unit})\n`;
      message += `   👤 ${purchase.buyer?.first_name || purchase.buyer?.username}\n`;
      message += `   📅 ${date}\n`;
      
      totalSum += parseFloat(purchase.total_price || 0);
    });
    
    message += `\n💰 <b>Итого за период: ${totalSum.toFixed(2)} ₽</b>`;
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    logger.error('Error in completedPurchases:', error);
    ctx.reply('❌ Произошла ошибка при получении завершенных закупок');
  }
};

// Статистика закупок
const purchaseStatistics = async (ctx) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const { sequelize } = require('../database/models');
    
    // Статистика за сегодня
    const todayStats = await Purchase.findOne({
      where: {
        purchase_date: {
          [Op.gte]: today
        },
        status: 'completed'
      },
      attributes: [
        [sequelize.fn('COUNT', 'id'), 'count'],
        [sequelize.fn('SUM', sequelize.col('total_price')), 'total']
      ]
    });
    
    // Статистика за месяц
    const monthStats = await Purchase.findOne({
      where: {
        purchase_date: {
          [Op.gte]: monthStart
        },
        status: 'completed'
      },
      attributes: [
        [sequelize.fn('COUNT', 'id'), 'count'],
        [sequelize.fn('SUM', sequelize.col('total_price')), 'total']
      ]
    });
    
    // Топ продуктов по количеству закупок
    const topProducts = await Purchase.findAll({
      where: {
        purchase_date: {
          [Op.gte]: monthStart
        },
        status: 'completed'
      },
      attributes: [
        'product_name',
        'unit',
        [sequelize.fn('COUNT', 'id'), 'count'],
        [sequelize.fn('SUM', sequelize.col('purchased_quantity')), 'total_quantity'],
        [sequelize.fn('SUM', sequelize.col('total_price')), 'total_price']
      ],
      group: ['product_name', 'unit'],
      order: [[sequelize.fn('COUNT', 'id'), 'DESC']],
      limit: 10
    });
    
    let message = '📊 <b>Статистика закупок</b>\n\n';
    
    message += '📅 <b>Сегодня:</b>\n';
    const todayData = todayStats?.get({ plain: true }) || { count: 0, total: 0 };
    message += `Закупок: ${todayData.count}\n`;
    message += `Сумма: ${parseFloat(todayData.total || 0).toFixed(2)} ₽\n\n`;
    
    message += '📅 <b>За текущий месяц:</b>\n';
    const monthData = monthStats?.get({ plain: true }) || { count: 0, total: 0 };
    message += `Закупок: ${monthData.count}\n`;
    message += `Сумма: ${parseFloat(monthData.total || 0).toFixed(2)} ₽\n\n`;
    
    if (topProducts.length > 0) {
      message += '🏆 <b>Топ продуктов за месяц:</b>\n';
      topProducts.forEach((product, index) => {
        const data = product.get({ plain: true });
        message += `${index + 1}. ${data.product_name}\n`;
        message += `   📦 ${data.total_quantity} ${data.unit} | 💰 ${parseFloat(data.total_price).toFixed(2)} ₽\n`;
      });
    }
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    logger.error('Error in purchaseStatistics:', error);
    ctx.reply('❌ Произошла ошибка при получении статистики');
  }
};

// Продолжение незавершенной закупки
const continuePurchase = async (ctx) => {
  const match = ctx.message.text.match(/^\/continue_purchase_(\d+)$/);
  
  if (!match) {
    return ctx.reply('❌ Неверный формат команды');
  }
  
  const purchaseId = parseInt(match[1]);
  
  try {
    const purchase = await Purchase.findOne({
      where: {
        id: purchaseId,
        buyer_id: ctx.user.id,
        status: ['pending', 'partial']
      }
    });
    
    if (!purchase) {
      return ctx.reply('❌ Закупка не найдена или уже завершена');
    }
    
    // Получаем данные о консолидированном продукте
    const consolidated = await OrderService.getConsolidatedOrders();
    const product = consolidated.find(item => 
      item.consolidated_product_id === purchase.consolidated_product_id
    );
    
    if (!product) {
      return ctx.reply('❌ Не удалось получить данные о продукте');
    }
    
    // Запускаем сцену с существующей закупкой
    return ctx.scene.enter('purchase_product', {
      consolidatedProductId: purchase.consolidated_product_id,
      consolidatedProduct: product,
      existingPurchase: purchase
    });
    
  } catch (error) {
    logger.error('Error in continuePurchase:', error);
    ctx.reply('❌ Произошла ошибка при продолжении закупки');
  }
};

// Отметка всех одобренных заказов как закупленных (устаревшая функция)
const markPurchased = async (ctx) => {
  await ctx.reply(
    '⚠️ Эта функция устарела.\n\n' +
    'Используйте /consolidated_list для просмотра консолидированного списка ' +
    'и отмечайте закупку каждого продукта отдельно.'
  );
};

// Заявки по ресторанам
const ordersByRestaurants = async (ctx) => {
  try {
    const orders = await Order.findAll({
      where: {
        status: ['sent', 'processing']
      },
      include: [
        { model: OrderItem, as: 'orderItems' },
        { model: Restaurant, as: 'restaurant' },
        { model: User, as: 'user' }
      ],
      order: [['created_at', 'DESC']]
    });
    
    if (orders.length === 0) {
      return ctx.reply('📋 Нет активных заказов');
    }
    
    // Группируем по ресторанам
    const byRestaurant = {};
    orders.forEach(order => {
      const restaurantName = order.restaurant.name;
      if (!byRestaurant[restaurantName]) {
        byRestaurant[restaurantName] = [];
      }
      byRestaurant[restaurantName].push(order);
    });
    
    let message = '📦 <b>Заявки по ресторанам</b>\n\n';
    
    Object.entries(byRestaurant).forEach(([restaurantName, restaurantOrders]) => {
      message += `🏢 <b>${restaurantName}</b>\n`;
      restaurantOrders.forEach(order => {
        message += `\n📋 Заказ #${order.order_number}\n`;
        message += `   👤 ${order.user.first_name || order.user.username}\n`;
        message += `   📅 ${formatInTimezone(order.created_at, 'DD.MM.YYYY HH:mm')}\n`;
        message += `   📦 Позиций: ${order.orderItems.length}\n`;
        message += `   📊 Статус: ${order.status === 'sent' ? 'Отправлен' : 'В обработке'}\n`;
      });
      message += '\n';
    });
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    logger.error('Error in ordersByRestaurants:', error);
    ctx.reply('❌ Произошла ошибка при получении заказов');
  }
};

// Обработка текстовых команд из клавиатуры
const handleTextCommands = async (ctx) => {
  const text = ctx.message.text;
  
  switch (text) {
    case '📋 Консолидированный список':
    case '📋 Общий список продуктов':
      return consolidatedList(ctx);
    case '📦 Заявки по ресторанам':
      return ordersByRestaurants(ctx);
    case '🛒 Активные закупки':
    case '🛒 Закупка':
      return activePurchases(ctx);
    case '✅ Завершенные закупки':
    case '✅ Завершенные заказы':
      return completedPurchases(ctx);
    case '📊 Статистика закупок':
    case '📈 Статистика':
      return purchaseStatistics(ctx);
    case '📊 Комплектация корзин':
      return ctx.reply('Комплектация корзин в разработке');
    case '⚙️ Настройки':
      return ctx.reply('Настройки закупщика в разработке');
    case '🔙 Главное меню':
      return ctx.scene.leave();
    default:
      return false;
  }
};

// Закупки
const purchases = async (ctx) => {
  try {
    // Отвечаем на callback query только если это callback
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }
    
    // Считаем активные закупки (включая этап сборки)
    const activePurchasesCount = await Purchase.count({
      where: {
        buyer_id: ctx.user.id,
        status: ['pending', 'in_progress', 'packing'],
        product_name: 'Закупочная сессия'
      }
    });
    
    // Считаем завершенные закупки за последние 30 дней
    const completedPurchasesCount = await Purchase.count({
      where: {
        buyer_id: ctx.user.id,
        status: 'completed',
        product_name: 'Закупочная сессия',
        created_at: {
          [Op.gte]: moment().subtract(30, 'days').toDate()
        }
      }
    });
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: `📋 Активные закупки${activePurchasesCount > 0 ? ` (${activePurchasesCount})` : ''}`, callback_data: 'purchases_active' }],
          [{ text: `✅ Завершенные закупки${completedPurchasesCount > 0 ? ` (${completedPurchasesCount})` : ''}`, callback_data: 'purchases_completed' }],
          [{ text: '📊 Статистика закупок', callback_data: 'purchases_stats' }],
          [{ text: '🔙 Назад в меню', callback_data: 'menu_main' }]
        ]
      }
    };
    
    await ctx.reply(
      '🛒 <b>Управление закупками</b>\n\n' +
      'Выберите раздел:',
      { parse_mode: 'HTML', ...keyboard }
    );
  } catch (error) {
    logger.error('Error in purchases:', error);
    ctx.reply('Произошла ошибка');
  }
};

// Отчеты
const reports = async (ctx) => {
  try {
    // Отвечаем на callback query только если это callback
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📈 История цен', callback_data: 'report_price_history' }],
          [{ text: '💰 Анализ рентабельности', callback_data: 'report_profitability' }],
          [{ text: '📊 Анализ заказов', callback_data: 'report_order_analysis' }],
          [{ text: '🔙 Назад в меню', callback_data: 'menu_main' }]
        ]
      }
    };
    
    await ctx.reply(
      '📈 <b>Отчеты и аналитика</b>\n\n' +
      'Выберите тип отчета:',
      { parse_mode: 'HTML', ...keyboard }
    );
  } catch (error) {
    logger.error('Error in reports:', error);
    ctx.reply('Произошла ошибка');
  }
};

// Обработчик для кнопки консолидации
const consolidateOrders = async (ctx) => {
  try {
    await ctx.answerCbQuery('Загружаем консолидированный список...');
    return consolidatedList(ctx);
  } catch (error) {
    logger.error('Error in consolidateOrders:', error);
    ctx.reply('❌ Произошла ошибка при загрузке списка');
  }
};

// Начало закупочной сессии
const startPurchaseSession = async (ctx) => {
  try {
    await ctx.answerCbQuery('Создаем закупочную сессию...');
    
    // Проверяем нет ли уже активной закупки
    const existingPurchase = await Purchase.findOne({
      where: {
        buyer_id: ctx.user.id,
        status: ['pending', 'in_progress'],
        product_name: 'Закупочная сессия'
      }
    });
    
    if (existingPurchase) {
      return ctx.reply('❌ У вас уже есть активная закупка. Завершите её перед началом новой.');
    }
    
    // Получаем консолидированные заказы
    const consolidated = await OrderService.getConsolidatedOrders();
    
    if (consolidated.length === 0) {
      return ctx.reply('📋 Нет заказов для закупки');
    }
    
    // Создаем новую закупку (используем старую структуру модели, но адаптируем)
    const purchase = await Purchase.create({
      consolidated_product_id: `session_${Date.now()}`, // Уникальный ID сессии
      product_name: 'Закупочная сессия',
      unit: 'шт',
      total_quantity: consolidated.length,
      purchased_quantity: 0,
      buyer_id: ctx.user.id,
      purchase_date: new Date(),
      status: 'pending',
      total_items: consolidated.length,
      completed_items: 0,
      orders_data: consolidated.map(item => ({
        consolidated_product_id: item.consolidated_product_id,
        product_name: item.product_name,
        quantity: item.total_quantity,
        unit: item.unit
      }))
    });
    
    // Создаем элементы закупки для каждого консолидированного товара
    for (const item of consolidated) {
      await PurchaseItem.create({
        purchase_id: purchase.id,
        product_name: item.product_name,
        unit: item.unit,
        quantity: item.total_quantity,
        required_quantity: item.total_quantity,
        purchased_quantity: 0,
        purchase_price: 0,
        status: 'pending',
        consolidated_product_id: item.consolidated_product_id
      });
    }
    
    await ctx.reply(
      '✅ <b>Закупочная сессия создана!</b>\n\n' +
      `📦 Товаров к закупке: ${consolidated.length}\n\n` +
      'Теперь вы можете начать закупку товаров.',
      { parse_mode: 'HTML' }
    );
    
    // Показываем активную закупку
    return showActivePurchase(ctx, purchase);
    
  } catch (error) {
    logger.error('Error in startPurchaseSession:', error);
    ctx.reply('❌ Произошла ошибка при создании закупочной сессии');
  }
};

// Продолжить закупку
const continuePurchaseSession = async (ctx) => {
  try {
    // Отвечаем на callback query только если это действительно callback query
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('Загружаем закупку...');
    }
    
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
    
    // Обновляем статус на in_progress
    if (purchase.status === 'pending') {
      await purchase.update({ status: 'in_progress' });
    }
    
    // Находим следующий товар для закупки
    const nextItem = await PurchaseItem.findOne({
      where: {
        purchase_id: purchase.id,
        status: 'pending'
      },
      order: [['product_name', 'ASC']]
    });
    
    if (!nextItem) {
      // Все товары закуплены
      return finishPurchaseSession(ctx, purchase);
    }
    
    // Показываем форму для ввода данных о закупке
    await ctx.reply(
      `🛒 <b>Закупка товара</b>\n\n` +
      `📦 <b>${nextItem.product_name}</b>\n` +
      `📏 Необходимо: ${nextItem.required_quantity} ${nextItem.unit}\n\n` +
      `Введите через пробел:\n` +
      `• Количество закупленного товара\n` +
      `• Общую сумму закупки\n\n` +
      `Пример: 10 2500`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⏭️ Пропустить товар', callback_data: `skip_purchase_item:${nextItem.id}` }],
            [{ text: '❌ Отменить закупку', callback_data: 'cancel_purchase_session' }]
          ]
        }
      }
    );
    
    // Сохраняем в сессии ID текущего товара
    ctx.session.currentPurchaseItemId = nextItem.id;
    ctx.session.awaitingPurchaseInput = true;
    
  } catch (error) {
    logger.error('Error in continuePurchaseSession:', error);
    ctx.reply('❌ Произошла ошибка при продолжении закупки');
  }
};

// Завершить закупочную сессию
const finishPurchaseSession = async (ctx, purchase) => {
  try {
    await ctx.reply(
      '✅ <b>Все товары обработаны!</b>\n\n' +
      'Подтвердите завершение закупки:',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Завершить закупку', callback_data: 'confirm_finish_purchase' }],
            [{ text: '📋 Просмотреть список', callback_data: 'show_purchase_list' }],
            [{ text: '↩️ Вернуться к закупке', callback_data: 'continue_purchase_session' }]
          ]
        }
      }
    );
  } catch (error) {
    logger.error('Error in finishPurchaseSession:', error);
    ctx.reply('❌ Произошла ошибка при завершении закупки');
  }
};

// Подтвердить завершение закупки
const confirmFinishPurchase = async (ctx) => {
  try {
    await ctx.answerCbQuery('Завершаем закупку...');
    
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
    
    // Обновляем статус закупки на 'packing' (сборка корзин)
    await purchase.update({ 
      status: 'packing',
      completed_at: new Date()
    });
    
    // Обновляем статус всех связанных заказов на 'purchased'
    const purchaseItems = await PurchaseItem.findAll({
      where: { purchase_id: purchase.id }
    });
    
    // Получаем все заказы для сборки корзин
    const orders = await Order.findAll({
      where: { 
        status: 'sent'
      },
      include: [
        { model: OrderItem, as: 'orderItems' },
        { model: Restaurant, as: 'restaurant' }
      ]
    });
    
    // Обновляем статус заказов на 'purchased' (готов для сборки)
    for (const order of orders) {
      await order.update({ status: 'purchased' });
    }
    
    // Переходим к этапу сборки корзин
    await showPackingInterface(ctx, purchase, orders);
    
  } catch (error) {
    logger.error('Error in confirmFinishPurchase:', error);
    ctx.reply('❌ Произошла ошибка при завершении закупки');
  }
};

// Уведомить менеджеров о завершении закупки
const notifyManagersAboutCompletedPurchase = async (purchase, orders) => {
  try {
    const managers = await User.findAll({
      where: { role: 'manager', is_active: true }
    });
    
    let message = '✅ <b>Закупка завершена!</b>\n\n';
    message += `👤 Закупщик: ${purchase.buyer?.first_name || purchase.buyer?.username || 'Неизвестен'}\n`;
    message += `📅 Дата: ${formatInTimezone(new Date())}\n\n`;
    
    // Группируем заказы по ресторанам
    const ordersByRestaurant = {};
    orders.forEach(order => {
      const restaurantName = order.restaurant.name;
      if (!ordersByRestaurant[restaurantName]) {
        ordersByRestaurant[restaurantName] = [];
      }
      ordersByRestaurant[restaurantName].push(order);
    });
    
    message += '<b>Заказы готовы к обработке:</b>\n';
    Object.entries(ordersByRestaurant).forEach(([restaurantName, restaurantOrders]) => {
      message += `\n🏢 ${restaurantName}:\n`;
      restaurantOrders.forEach(order => {
        message += `✅ Заказ #${order.order_number}\n`;
      });
    });
    
    message += '\n💡 Нажмите кнопку ниже для обработки заказов';
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Обработать заказы', callback_data: 'process_purchased_orders' }]
        ]
      }
    };
    
    // Отправляем уведомление каждому менеджеру
    for (const manager of managers) {
      await notificationService.sendToTelegramId(
        manager.telegram_id,
        message,
        { parse_mode: 'HTML', ...keyboard }
      );
    }
    
  } catch (error) {
    logger.error('Error notifying managers about completed purchase:', error);
  }
};

// Показать интерфейс сборки корзин
const showPackingInterface = async (ctx, purchase, orders) => {
  try {
    // Считаем собранные и несобранные заказы
    const packedCount = orders.filter(o => o.packing_status === 'ready').length;
    const unpackedCount = orders.length - packedCount;
    
    let message = '📦 <b>Сборка корзин</b>\n\n';
    message += '✅ Закупка завершена! Теперь нужно собрать корзины для каждого заказа.\n\n';
    message += `📊 <b>Прогресс:</b> ${packedCount}/${orders.length} собрано\n`;
    if (unpackedCount > 0) {
      message += `⏳ Осталось собрать: ${unpackedCount}\n`;
    }
    message += `\n📋 <b>Заказы (${orders.length}):</b>\n\n`;
    
    const keyboard = [];
    
    orders.forEach((order, index) => {
      const isReady = order.packing_status === 'ready';
      
      message += `${index + 1}. <b>#${order.order_number}</b>\n`;
      message += `   🏢 ${order.restaurant.name}\n`;
      message += `   📦 ${order.orderItems.length} позиций\n`;
      message += `   📊 Статус: ${isReady ? '✅ Собран' : '⏳ Ожидает сборки'}\n`;
      
      // Добавляем кнопку только для несобранных заказов
      if (!isReady) {
        keyboard.push([{ 
          text: `📦 Собрать #${order.order_number}`, 
          callback_data: `start_packing:${order.id}` 
        }]);
      }
      
      message += '\n';
    });
    
    // Кнопка для завершения всей сборки (только если все заказы собраны)
    const allPacked = orders.every(order => order.packing_status === 'ready');
    if (allPacked) {
      keyboard.push([{ text: '✅ Завершить сборку всех корзин', callback_data: `finish_all_packing:${purchase.id}` }]);
    }
    
    keyboard.push([{ text: '🔄 Обновить статус', callback_data: `refresh_packing:${purchase.id}` }]);
    
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    });
    
  } catch (error) {
    logger.error('Error in showPackingInterface:', error);
    ctx.reply('❌ Произошла ошибка при отображении интерфейса сборки');
  }
};

// Начать сборку конкретного заказа
const startPacking = async (ctx) => {
  try {
    const orderId = parseInt(ctx.match[1]);
    await ctx.answerCbQuery('Открываем заказ...');
    
    const order = await Order.findByPk(orderId, {
      include: [
        { model: OrderItem, as: 'orderItems' },
        { model: Restaurant, as: 'restaurant' }
      ]
    });
    
    if (!order) {
      return ctx.reply('❌ Заказ не найден');
    }
    
    let message = `📦 <b>Сборка заказа #${order.order_number}</b>\n\n`;
    message += `🏢 <b>Ресторан:</b> ${order.restaurant.name}\n`;
    message += `📅 <b>Дата:</b> ${moment(order.created_at).format('DD.MM.YYYY HH:mm')}\n\n`;
    message += `📋 <b>Состав заказа:</b>\n`;
    
    order.orderItems.forEach((item, index) => {
      message += `${index + 1}. ${item.product_name} - ${item.quantity} ${item.unit}\n`;
    });
    
    message += `\n📝 Соберите все позиции в корзину и нажмите "Готово"`;
    
    const keyboard = [
      [{ text: '✅ Собрано - Готово!', callback_data: `mark_packed:${orderId}` }],
      [{ text: '🔙 Вернуться к списку', callback_data: `back_to_packing_list` }]
    ];
    
    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    });
    
  } catch (error) {
    logger.error('Error in startPacking:', error);
    ctx.reply('❌ Произошла ошибка при открытии заказа');
  }
};

// Отметить заказ как собранный
const markPacked = async (ctx) => {
  try {
    const orderId = parseInt(ctx.match[1]);
    await ctx.answerCbQuery('Отмечаем как собранное...');
    
    // Обновляем статус сборки заказа
    const updated = await Order.update(
      { packing_status: 'ready' },
      { where: { id: orderId } }
    );
    
    logger.info('Order packing status updated:', { orderId, updated });
    
    // Сразу возвращаемся к обновленному списку
    await ctx.editMessageText(
      `✅ <b>Заказ собран!</b>\n\nВозвращаемся к списку...`,
      { parse_mode: 'HTML' }
    );
    
    // Находим активную закупку в статусе packing
    const purchase = await Purchase.findOne({
      where: {
        buyer_id: ctx.user.id,
        status: 'packing',
        product_name: 'Закупочная сессия'
      }
    });
    
    if (!purchase) {
      return ctx.reply('❌ Активная закупка не найдена');
    }
    
    // Получаем обновленный список заказов
    const orders = await Order.findAll({
      where: { status: 'purchased' },
      include: [
        { model: OrderItem, as: 'orderItems' },
        { model: Restaurant, as: 'restaurant' }
      ]
    });
    
    // Показываем обновленный интерфейс сборки
    await showPackingInterface(ctx, purchase, orders);
    
  } catch (error) {
    logger.error('Error in markPacked:', error);
    ctx.reply('❌ Произошла ошибка при отметке заказа');
  }
};

// Вернуться к списку сборки
const backToPackingList = async (ctx) => {
  try {
    await ctx.answerCbQuery('Загружаем список...');
    
    // Находим активную закупку в статусе packing
    const purchase = await Purchase.findOne({
      where: {
        buyer_id: ctx.user.id,
        status: 'packing',
        product_name: 'Закупочная сессия'
      }
    });
    
    if (!purchase) {
      return ctx.reply('❌ Активная сборка не найдена');
    }
    
    // Получаем заказы для сборки
    const orders = await Order.findAll({
      where: { 
        status: 'purchased'
      },
      include: [
        { model: OrderItem, as: 'orderItems' },
        { model: Restaurant, as: 'restaurant' }
      ]
    });
    
    await showPackingInterface(ctx, purchase, orders);
    
  } catch (error) {
    logger.error('Error in backToPackingList:', error);
    ctx.reply('❌ Произошла ошибка при загрузке списка');
  }
};

// Завершить сборку всех корзин
const finishAllPacking = async (ctx) => {
  try {
    const purchaseId = parseInt(ctx.match[1]);
    await ctx.answerCbQuery('Завершаем сборку...');
    
    const purchase = await Purchase.findByPk(purchaseId);
    if (!purchase) {
      return ctx.reply('❌ Закупка не найдена');
    }
    
    // Проверяем, что все заказы собраны
    const unpackedOrders = await Order.count({
      where: { 
        status: 'purchased',
        [Op.or]: [
          { packing_status: { [Op.is]: null } },
          { packing_status: { [Op.ne]: 'ready' } }
        ]
      }
    });
    
    if (unpackedOrders > 0) {
      return ctx.reply('❌ Не все заказы собраны. Пожалуйста, соберите все корзины перед завершением.');
    }
    
    // Обновляем статус закупки на completed
    await purchase.update({ status: 'completed' });
    
    // Получаем все собранные заказы
    const orders = await Order.findAll({
      where: { 
        status: 'purchased',
        packing_status: 'ready'
      },
      include: [
        { model: OrderItem, as: 'orderItems' },
        { model: Restaurant, as: 'restaurant' }
      ]
    });
    
    // Теперь уведомляем менеджеров
    await notifyManagersAboutCompletedPurchase(purchase, orders);
    
    await ctx.reply(
      '✅ <b>Все корзины собраны!</b>\n\n' +
      'Менеджеры получили уведомление и могут приступить к обработке заказов.',
      { parse_mode: 'HTML' }
    );
    
  } catch (error) {
    logger.error('Error in finishAllPacking:', error);
    ctx.reply('❌ Произошла ошибка при завершении сборки');
  }
};

module.exports = {
  menu,
  consolidatedList,
  consolidatedOrders: consolidatedList, // Алиас для совместимости
  consolidateOrders, // Новый метод для кнопки
  ordersByRestaurants,
  markPurchased,
  purchaseProductCommand,
  activePurchases,
  completedPurchases,
  purchaseStatistics,
  continuePurchase,
  handleTextCommands,
  purchases,
  reports,
  showActivePurchase,
  startPurchaseSession,
  continuePurchaseSession,
  finishPurchaseSession,
  confirmFinishPurchase,
  showPackingInterface,
  startPacking,
  markPacked,
  backToPackingList,
  finishAllPacking
};