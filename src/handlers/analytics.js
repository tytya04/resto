const { Markup } = require('telegraf');
const AnalyticsService = require('../services/AnalyticsService');
const googleSheetsService = require('../services/GoogleSheetsService');
const { PriceHistory, Order } = require('../database/models');
const logger = require('../utils/logger');
const moment = require('moment');

// История цен продукта
const priceHistory = async (ctx) => {
  try {
    const args = ctx.message.text.split(' ').slice(1).join(' ');
    
    if (!args) {
      return ctx.reply(
        '📊 Для просмотра истории цен укажите название продукта:\n\n' +
        'Например: /price_history Томаты'
      );
    }
    
    // Получаем историю цен
    const history = await AnalyticsService.getProductPriceHistory(args, null, 90);
    
    if (!history.purchase.length && !history.sale.length && !history.suggested.length) {
      return ctx.reply(`❌ История цен для "${args}" не найдена`);
    }
    
    let message = `📊 <b>История цен: ${args}</b>\n\n`;
    
    // Закупочные цены
    if (history.purchase.length > 0) {
      message += '💰 <b>Закупочные цены:</b>\n';
      history.purchase.slice(0, 5).forEach(record => {
        const date = moment(record.date).format('DD.MM.YYYY');
        message += `• ${date}: ${record.price} ₽/${record.unit}`;
        if (record.notes) message += ` (${record.notes})`;
        message += '\n';
      });
      message += '\n';
    }
    
    // Цены продажи
    if (history.sale.length > 0) {
      message += '💵 <b>Цены продажи:</b>\n';
      history.sale.slice(0, 5).forEach(record => {
        const date = moment(record.date).format('DD.MM.YYYY');
        message += `• ${date}: ${record.price} ₽/${record.unit}`;
        if (record.restaurant) message += ` (${record.restaurant.name})`;
        message += '\n';
      });
      message += '\n';
    }
    
    // Рекомендованные цены
    if (history.suggested.length > 0) {
      message += '📋 <b>Рекомендованные цены:</b>\n';
      history.suggested.slice(0, 3).forEach(record => {
        const date = moment(record.date).format('DD.MM.YYYY');
        message += `• ${date}: ${record.price} ₽/${record.unit}\n`;
      });
    }
    
    // Рассчитываем маржинальность
    if (history.purchase.length > 0 && history.sale.length > 0) {
      const latestPurchase = history.purchase[0];
      const latestSale = history.sale[0];
      
      if (latestPurchase.unit === latestSale.unit) {
        const margin = await AnalyticsService.calculateProductMargin(
          args, 
          latestPurchase.unit,
          latestSale.restaurant?.id
        );
        
        if (margin) {
          message += '\n📈 <b>Текущая маржинальность:</b>\n';
          message += `• Закупка: ${margin.purchase_price} ₽/${margin.unit}\n`;
          message += `• Продажа: ${margin.sale_price} ₽/${margin.unit}\n`;
          message += `• Наценка: ${margin.margin_percent}%\n`;
          message += `• Прибыль: ${margin.profit_per_unit} ₽/${margin.unit}`;
        }
      }
    }
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    logger.error('Error in priceHistory:', error);
    ctx.reply('❌ Произошла ошибка при получении истории цен');
  }
};

// Отчет по рентабельности
const profitabilityReport = async (ctx) => {
  try {
    await ctx.reply('⏳ Формирую отчет по рентабельности...');
    
    const restaurantId = ctx.user.restaurant_id;
    const report = await AnalyticsService.getProfitabilityReport(restaurantId);
    
    if (report.length === 0) {
      return ctx.reply('📊 Нет данных для отчета по рентабельности');
    }
    
    let message = '📊 <b>Отчет по рентабельности (последние 30 дней)</b>\n\n';
    
    // Топ-10 прибыльных продуктов
    message += '💰 <b>Топ-10 прибыльных продуктов:</b>\n';
    report.slice(0, 10).forEach((product, index) => {
      message += `${index + 1}. <b>${product.product_name}</b>\n`;
      message += `   📦 ${product.total_quantity.toFixed(2)} ${product.unit}\n`;
      message += `   💵 Выручка: ${product.total_revenue.toFixed(2)} ₽\n`;
      message += `   💰 Себестоимость: ${product.total_cost.toFixed(2)} ₽\n`;
      message += `   📈 Прибыль: ${product.gross_profit.toFixed(2)} ₽ (${product.margin_percent}%)\n\n`;
    });
    
    // Общая статистика
    const totalRevenue = report.reduce((sum, p) => sum + p.total_revenue, 0);
    const totalCost = report.reduce((sum, p) => sum + p.total_cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(2) : 0;
    
    message += '\n📈 <b>Общая статистика:</b>\n';
    message += `• Выручка: ${totalRevenue.toFixed(2)} ₽\n`;
    message += `• Себестоимость: ${totalCost.toFixed(2)} ₽\n`;
    message += `• Валовая прибыль: ${totalProfit.toFixed(2)} ₽\n`;
    message += `• Средняя маржа: ${avgMargin}%`;
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
    // Предлагаем дополнительные действия
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📊 Топ по количеству', 'report_top_quantity')],
      [Markup.button.callback('📈 Динамика цен', 'report_price_trends')],
      [Markup.button.callback('💰 Анализ заказа', 'report_order_analysis')]
    ]);
    
    await ctx.reply(
      'Выберите дополнительный отчет:',
      keyboard
    );
    
  } catch (error) {
    logger.error('Error in profitabilityReport:', error);
    ctx.reply('❌ Произошла ошибка при формировании отчета');
  }
};

// Обновление цен в номенклатуре
const updatePrices = async (ctx) => {
  try {
    // Проверяем права доступа
    if (!['manager', 'admin'].includes(ctx.user.role)) {
      return ctx.reply('❌ Эта команда доступна только менеджерам');
    }
    
    await ctx.reply(
      '⚠️ <b>Обновление цен в номенклатуре</b>\n\n' +
      'Эта операция обновит цены в Google Sheets на основе средних закупочных цен за последние 30 дней.\n\n' +
      'Будут обновлены только те продукты, по которым есть минимум 3 закупки.\n\n' +
      'Продолжить?',
      {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Да, обновить', 'confirm_update_prices'),
            Markup.button.callback('❌ Отмена', 'cancel_update_prices')
          ]
        ])
      }
    );
  } catch (error) {
    logger.error('Error in updatePrices:', error);
    ctx.reply('❌ Произошла ошибка');
  }
};

// Подтверждение обновления цен
const confirmUpdatePrices = async (ctx) => {
  await ctx.answerCbQuery();
  
  try {
    await ctx.editMessageText('⏳ Обновляю цены в номенклатуре...');
    
    const result = await googleSheetsService.updatePricesFromPurchases(30);
    
    await ctx.editMessageText(
      `✅ <b>Цены успешно обновлены!</b>\n\n` +
      `Обновлено продуктов: ${result.updated}\n\n` +
      `Цены в Google Sheets теперь соответствуют средним закупочным ценам за последние 30 дней.`,
      { parse_mode: 'HTML' }
    );
    
  } catch (error) {
    logger.error('Error confirming price update:', error);
    await ctx.editMessageText('❌ Произошла ошибка при обновлении цен');
  }
};

// Анализ конкретного заказа
const orderCostAnalysis = async (ctx) => {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    
    if (!args[0]) {
      return ctx.reply(
        '📊 Для анализа заказа укажите его номер:\n\n' +
        'Например: /order_analysis 12345'
      );
    }
    
    const orderNumber = args[0];
    const order = await Order.findOne({ where: { order_number: orderNumber } });
    
    if (!order) {
      return ctx.reply(`❌ Заказ #${orderNumber} не найден`);
    }
    
    await ctx.reply('⏳ Анализирую заказ...');
    
    const analysis = await AnalyticsService.getOrderCostAnalysis(order.id);
    
    let message = `📊 <b>Анализ заказа #${analysis.order_number}</b>\n`;
    message += `🏢 ${analysis.restaurant}\n`;
    message += `📌 Статус: ${analysis.status}\n\n`;
    
    // Позиции с наибольшим отклонением
    const itemsWithVariance = analysis.items
      .filter(item => Math.abs(item.cost_variance) > 0)
      .sort((a, b) => Math.abs(b.cost_variance) - Math.abs(a.cost_variance));
    
    if (itemsWithVariance.length > 0) {
      message += '⚠️ <b>Отклонения от плановой себестоимости:</b>\n';
      itemsWithVariance.slice(0, 5).forEach(item => {
        const icon = item.cost_variance > 0 ? '📈' : '📉';
        message += `${icon} ${item.product_name}: ${item.cost_variance > 0 ? '+' : ''}${item.cost_variance.toFixed(2)} ₽ (${item.cost_variance_percent}%)\n`;
      });
      message += '\n';
    }
    
    // Итоговые показатели
    message += '💰 <b>Финансовые показатели:</b>\n';
    message += `• Выручка: ${analysis.summary.total_revenue.toFixed(2)} ₽\n`;
    message += `• План. себестоимость: ${analysis.summary.total_planned_cost.toFixed(2)} ₽\n`;
    message += `• Факт. себестоимость: ${analysis.summary.total_actual_cost.toFixed(2)} ₽\n`;
    message += `• Отклонение: ${analysis.summary.cost_variance > 0 ? '+' : ''}${analysis.summary.cost_variance.toFixed(2)} ₽ (${analysis.summary.cost_variance_percent}%)\n`;
    message += `• Валовая прибыль: ${analysis.summary.gross_profit.toFixed(2)} ₽\n`;
    message += `• Маржинальность: ${analysis.summary.gross_margin_percent}%`;
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    logger.error('Error in orderCostAnalysis:', error);
    ctx.reply('❌ Произошла ошибка при анализе заказа');
  }
};

// Топ продуктов по количеству
const topProductsByQuantity = async (ctx) => {
  await ctx.answerCbQuery();
  
  try {
    const topProducts = await AnalyticsService.getTopProducts('quantity', 10);
    
    let message = '📊 <b>Топ-10 продуктов по количеству:</b>\n\n';
    
    topProducts.forEach((product, index) => {
      message += `${index + 1}. <b>${product.product_name}</b>\n`;
      message += `   📦 ${parseFloat(product.total_quantity).toFixed(2)} ${product.unit}\n`;
      message += `   💵 Выручка: ${parseFloat(product.total_revenue).toFixed(2)} ₽\n`;
      message += `   📋 Заказов: ${product.order_count}\n\n`;
    });
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    logger.error('Error in topProductsByQuantity:', error);
    ctx.reply('❌ Произошла ошибка при формировании отчета');
  }
};

// Обработка callback запросов
const handleAnalyticsCallbacks = async (ctx) => {
  const action = ctx.callbackQuery.data;
  
  switch (action) {
    case 'confirm_update_prices':
      return confirmUpdatePrices(ctx);
    case 'cancel_update_prices':
      await ctx.answerCbQuery('Отменено');
      return ctx.editMessageText('❌ Обновление цен отменено');
    case 'report_top_quantity':
      return topProductsByQuantity(ctx);
    case 'report_price_trends':
      await ctx.answerCbQuery();
      return ctx.reply('📈 Функция анализа динамики цен в разработке');
    case 'report_order_analysis':
      await ctx.answerCbQuery();
      return ctx.reply(
        '📊 Для анализа заказа используйте команду:\n' +
        '/order_analysis [номер заказа]'
      );
  }
};

// Обработка текстовых команд из меню
const handleTextCommands = async (ctx) => {
  const text = ctx.message.text;
  
  switch (text) {
    case '📊 История цен':
      return ctx.reply(
        '📊 Для просмотра истории цен используйте команду:\n' +
        '/price_history [название продукта]'
      );
    case '💰 Рентабельность':
      return profitabilityReport(ctx);
    case '📈 Обновить цены':
      return updatePrices(ctx);
    default:
      return false;
  }
};

module.exports = {
  priceHistory,
  profitabilityReport,
  updatePrices,
  orderCostAnalysis,
  handleAnalyticsCallbacks,
  handleTextCommands
};