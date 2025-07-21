const { Markup } = require('telegraf');
const { Order, OrderItem, Restaurant, Purchase, User } = require('../database/models');
const OrderService = require('../services/OrderService');
const logger = require('../utils/logger');
const moment = require('moment');
const { formatInTimezone } = require('../utils/timezone');

// Меню закупщика
const menu = async (ctx) => {
  const keyboard = Markup.keyboard([
    ['📋 Консолидированный список', '🛒 Активные закупки'],
    ['✅ Завершенные закупки', '📊 Статистика закупок'],
    ['⚙️ Настройки', '🔙 Главное меню']
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
    
    // Выводим по категориям
    Object.entries(byCategory).forEach(([category, items]) => {
      message += `\n<b>📂 ${category}</b>\n`;
      
      items.forEach(item => {
        const isActive = activePurchaseIds.has(item.consolidated_product_id);
        const statusEmoji = isActive ? '🔄' : '📦';
        
        message += `\n${statusEmoji} <b>${item.product_name}</b>\n`;
        message += `   📏 ${item.total_quantity} ${item.unit} (из ${item.orders_count} заказов)\n`;
        
        if (item.average_price > 0) {
          message += `   💰 ~${item.average_price} ₽/${item.unit}\n`;
        }
        
        if (isActive) {
          message += `   ⚠️ <i>Уже в закупке</i>\n`;
        } else {
          message += `   /purchase_${item.consolidated_product_id}\n`;
        }
      });
    });
    
    message += '\n\n💡 Нажмите на команду под продуктом для начала закупки';
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
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
    const purchases = await OrderService.getActivePurchases();
    
    if (purchases.length === 0) {
      return ctx.reply('📋 Нет активных закупок');
    }
    
    let message = '🛒 <b>Активные закупки</b>\n';
    
    purchases.forEach(purchase => {
      const progress = purchase.purchased_quantity > 0 
        ? `${purchase.purchased_quantity}/${purchase.total_quantity}`
        : `0/${purchase.total_quantity}`;
      
      const statusText = purchase.status === 'partial' ? 'Частично закуплено' : 'В процессе';
      
      message += `\n📦 <b>${purchase.product_name}</b>\n`;
      message += `   📏 Прогресс: ${progress} ${purchase.unit}\n`;
      message += `   📊 Статус: ${statusText}\n`;
      message += `   👤 Закупщик: ${purchase.buyer?.first_name || purchase.buyer?.username || 'Не назначен'}\n`;
      message += `   📅 Начато: ${formatInTimezone(purchase.purchase_date)}\n`;
      
      if (purchase.buyer_id === ctx.user.id) {
        message += `   /continue_purchase_${purchase.id}\n`;
      }
    });
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    logger.error('Error in activePurchases:', error);
    ctx.reply('❌ Произошла ошибка при получении активных закупок');
  }
};

// Завершенные закупки
const completedPurchases = async (ctx) => {
  try {
    const purchases = await Purchase.findAll({
      where: { 
        status: 'completed',
        purchase_date: {
          [Purchase.sequelize.Op.gte]: moment().subtract(30, 'days').toDate()
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
    
    // Статистика за сегодня
    const todayStats = await Purchase.findOne({
      where: {
        purchase_date: {
          [Purchase.sequelize.Op.gte]: today
        },
        status: 'completed'
      },
      attributes: [
        [Purchase.sequelize.fn('COUNT', 'id'), 'count'],
        [Purchase.sequelize.fn('SUM', Purchase.sequelize.col('total_price')), 'total']
      ]
    });
    
    // Статистика за месяц
    const monthStats = await Purchase.findOne({
      where: {
        purchase_date: {
          [Purchase.sequelize.Op.gte]: monthStart
        },
        status: 'completed'
      },
      attributes: [
        [Purchase.sequelize.fn('COUNT', 'id'), 'count'],
        [Purchase.sequelize.fn('SUM', Purchase.sequelize.col('total_price')), 'total']
      ]
    });
    
    // Топ продуктов по количеству закупок
    const topProducts = await Purchase.findAll({
      where: {
        purchase_date: {
          [Purchase.sequelize.Op.gte]: monthStart
        },
        status: 'completed'
      },
      attributes: [
        'product_name',
        'unit',
        [Purchase.sequelize.fn('COUNT', 'id'), 'count'],
        [Purchase.sequelize.fn('SUM', Purchase.sequelize.col('purchased_quantity')), 'total_quantity'],
        [Purchase.sequelize.fn('SUM', Purchase.sequelize.col('total_price')), 'total_price']
      ],
      group: ['product_name', 'unit'],
      order: [[Purchase.sequelize.fn('COUNT', 'id'), 'DESC']],
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

// Обработка текстовых команд из клавиатуры
const handleTextCommands = async (ctx) => {
  const text = ctx.message.text;
  
  switch (text) {
    case '📋 Консолидированный список':
      return consolidatedList(ctx);
    case '🛒 Активные закупки':
      return activePurchases(ctx);
    case '✅ Завершенные закупки':
      return completedPurchases(ctx);
    case '📊 Статистика закупок':
      return purchaseStatistics(ctx);
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
    await ctx.answerCbQuery();
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Активные закупки', callback_data: 'purchases_active' }],
          [{ text: '✅ Завершенные закупки', callback_data: 'purchases_completed' }],
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
    await ctx.answerCbQuery();
    
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

module.exports = {
  menu,
  consolidatedList,
  consolidatedOrders: consolidatedList, // Алиас для совместимости
  markPurchased,
  purchaseProductCommand,
  activePurchases,
  completedPurchases,
  purchaseStatistics,
  continuePurchase,
  handleTextCommands,
  purchases,
  reports
};