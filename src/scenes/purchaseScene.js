const { Scenes, Markup } = require('telegraf');
const { Order, OrderItem, Restaurant, Purchase } = require('../database/models');
const OrderService = require('../services/OrderService');
const logger = require('../utils/logger');
const moment = require('moment');

// Сцена закупки продукта
const purchaseScene = new Scenes.BaseScene('purchase_product');

// Вход в сцену
purchaseScene.enter(async (ctx) => {
  const consolidatedProductId = ctx.scene.state.consolidatedProductId;
  const consolidatedProduct = ctx.scene.state.consolidatedProduct;
  
  if (!consolidatedProductId || !consolidatedProduct) {
    await ctx.reply('❌ Ошибка: не указан продукт для закупки');
    return ctx.scene.leave();
  }
  
  // Проверяем, нет ли уже активной закупки для этого продукта
  const existingPurchase = await Purchase.findOne({
    where: {
      consolidated_product_id: consolidatedProductId,
      status: ['pending', 'partial']
    }
  });
  
  if (existingPurchase) {
    await ctx.reply(
      '⚠️ Для этого продукта уже есть активная закупка.\n' +
      'Завершите её перед созданием новой.'
    );
    return ctx.scene.leave();
  }
  
  // Сохраняем данные в сессии сцены
  ctx.scene.session.consolidatedProduct = consolidatedProduct;
  ctx.scene.session.step = 'confirm';
  
  // Показываем информацию о продукте
  await showProductInfo(ctx);
});

// Показ информации о продукте
async function showProductInfo(ctx) {
  const product = ctx.scene.session.consolidatedProduct;
  
  let message = `📦 <b>Закупка продукта</b>\n\n`;
  message += `<b>${product.product_name}</b>\n`;
  message += `📏 Единица: ${product.unit}\n`;
  message += `📊 Необходимо: ${product.total_quantity} ${product.unit}\n`;
  message += `🏢 Для ресторанов: ${product.restaurants_count} шт\n`;
  message += `📋 Заказов: ${product.orders_count} шт\n`;
  
  if (product.average_price > 0) {
    message += `💰 Средняя цена: ${product.average_price} ₽/${product.unit}\n`;
    message += `💵 Ожидаемая сумма: ${(product.total_quantity * product.average_price).toFixed(2)} ₽\n`;
  }
  
  message += `\n<b>Распределение по ресторанам:</b>\n`;
  
  // Группируем по ресторанам
  const byRestaurant = {};
  product.orders.forEach(order => {
    if (!byRestaurant[order.restaurant]) {
      byRestaurant[order.restaurant] = 0;
    }
    byRestaurant[order.restaurant] += order.quantity;
  });
  
  Object.entries(byRestaurant).forEach(([restaurant, quantity]) => {
    message += `• ${restaurant}: ${quantity} ${product.unit}\n`;
  });
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Начать закупку', 'start_purchase')],
    [Markup.button.callback('❌ Отмена', 'cancel_purchase')]
  ]);
  
  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

// Начало закупки
purchaseScene.action('start_purchase', async (ctx) => {
  await ctx.answerCbQuery();
  
  try {
    // Создаем запись о закупке
    const product = ctx.scene.session.consolidatedProduct;
    const purchase = await OrderService.createPurchaseFromConsolidated(product, ctx.user.id);
    
    ctx.scene.session.purchase = purchase;
    ctx.scene.session.step = 'enter_quantity';
    
    await ctx.editMessageText(
      `✅ Закупка создана!\n\n` +
      `Теперь введите фактически закупленное количество.\n` +
      `Необходимо: ${product.total_quantity} ${product.unit}\n\n` +
      `Введите количество:`,
      {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(`✅ ${product.total_quantity} ${product.unit}`, `quick_qty:${product.total_quantity}`)],
          [Markup.button.callback('❌ Отмена', 'cancel_purchase')]
        ])
      }
    );
    
  } catch (error) {
    logger.error('Error creating purchase:', error);
    await ctx.reply('❌ Ошибка при создании закупки');
    return ctx.scene.leave();
  }
});

// Быстрый ввод количества
purchaseScene.action(/^quick_qty:(.+)$/, async (ctx) => {
  const quantity = parseFloat(ctx.match[1]);
  await ctx.answerCbQuery();
  
  ctx.scene.session.purchasedQuantity = quantity;
  ctx.scene.session.step = 'enter_price';
  
  await ctx.editMessageText(
    `📦 Количество: ${quantity} ${ctx.scene.session.consolidatedProduct.unit}\n\n` +
    `💰 Теперь введите общую сумму закупки (в рублях):`,
    {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отмена', 'cancel_purchase')]
      ])
    }
  );
});

// Обработка текстового ввода
purchaseScene.on('text', async (ctx) => {
  const text = ctx.message.text;
  const { step } = ctx.scene.session;
  
  if (step === 'enter_quantity') {
    const quantity = parseFloat(text);
    
    if (isNaN(quantity) || quantity <= 0) {
      return ctx.reply('⚠️ Введите корректное количество (число больше 0)');
    }
    
    ctx.scene.session.purchasedQuantity = quantity;
    ctx.scene.session.step = 'enter_price';
    
    await ctx.reply(
      `📦 Количество: ${quantity} ${ctx.scene.session.consolidatedProduct.unit}\n\n` +
      `💰 Теперь введите общую сумму закупки (в рублях):`,
      {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('❌ Отмена', 'cancel_purchase')]
        ])
      }
    );
    
  } else if (step === 'enter_price') {
    const price = parseFloat(text);
    
    if (isNaN(price) || price <= 0) {
      return ctx.reply('⚠️ Введите корректную сумму (число больше 0)');
    }
    
    ctx.scene.session.totalPrice = price;
    ctx.scene.session.step = 'confirm_purchase';
    
    // Рассчитываем цену за единицу
    const unitPrice = price / ctx.scene.session.purchasedQuantity;
    
    await showPurchaseSummary(ctx, unitPrice);
    
  } else if (step === 'add_notes') {
    ctx.scene.session.notes = text;
    await completePurchase(ctx);
  }
});

// Показ итоговой информации
async function showPurchaseSummary(ctx, unitPrice) {
  const { consolidatedProduct, purchasedQuantity, totalPrice } = ctx.scene.session;
  
  let message = `📋 <b>Подтверждение закупки</b>\n\n`;
  message += `<b>${consolidatedProduct.product_name}</b>\n`;
  message += `📦 Закуплено: ${purchasedQuantity} ${consolidatedProduct.unit}\n`;
  message += `💰 Общая сумма: ${totalPrice.toFixed(2)} ₽\n`;
  message += `💵 Цена за ${consolidatedProduct.unit}: ${unitPrice.toFixed(2)} ₽\n\n`;
  
  message += `<b>Распределение стоимости:</b>\n`;
  
  // Показываем, как распределится стоимость
  let totalAllocated = 0;
  consolidatedProduct.orders.forEach(order => {
    const allocatedPrice = order.quantity * unitPrice;
    totalAllocated += allocatedPrice;
    message += `• ${order.restaurant}: ${order.quantity} × ${unitPrice.toFixed(2)} = ${allocatedPrice.toFixed(2)} ₽\n`;
  });
  
  message += `\n💵 Итого распределено: ${totalAllocated.toFixed(2)} ₽`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Подтвердить', 'confirm_final')],
    [Markup.button.callback('📝 Добавить примечание', 'add_notes')],
    [Markup.button.callback('❌ Отмена', 'cancel_purchase')]
  ]);
  
  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

// Добавление примечания
purchaseScene.action('add_notes', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.scene.session.step = 'add_notes';
  
  await ctx.reply(
    '📝 Введите примечание к закупке:',
    {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('⏭ Пропустить', 'skip_notes')]
      ])
    }
  );
});

// Пропуск примечания
purchaseScene.action('skip_notes', async (ctx) => {
  await ctx.answerCbQuery();
  await completePurchase(ctx);
});

// Финальное подтверждение
purchaseScene.action('confirm_final', async (ctx) => {
  await ctx.answerCbQuery();
  await completePurchase(ctx);
});

// Завершение закупки
async function completePurchase(ctx) {
  try {
    const { purchase, purchasedQuantity, totalPrice, notes } = ctx.scene.session;
    
    await ctx.reply('⏳ Обрабатываю закупку...');
    
    // Завершаем закупку
    const completedPurchase = await OrderService.completePurchase(purchase.id, {
      quantity: purchasedQuantity,
      totalPrice: totalPrice,
      notes: notes || null
    });
    
    await ctx.reply(
      `✅ <b>Закупка успешно завершена!</b>\n\n` +
      `📦 ${completedPurchase.product_name}\n` +
      `📏 Закуплено: ${completedPurchase.purchased_quantity} ${completedPurchase.unit}\n` +
      `💰 Сумма: ${completedPurchase.total_price} ₽\n` +
      `💵 Цена за единицу: ${completedPurchase.unit_price} ₽\n\n` +
      `✅ Цены автоматически распределены по заказам ресторанов.`,
      { parse_mode: 'HTML' }
    );
    
    return ctx.scene.leave();
    
  } catch (error) {
    logger.error('Error completing purchase:', error);
    await ctx.reply(
      `❌ Ошибка при завершении закупки:\n${error.message}`
    );
    return ctx.scene.leave();
  }
}

// Отмена закупки
purchaseScene.action('cancel_purchase', async (ctx) => {
  await ctx.answerCbQuery();
  
  // Если закупка была создана, удаляем её
  if (ctx.scene.session.purchase) {
    try {
      await Purchase.destroy({
        where: { id: ctx.scene.session.purchase.id }
      });
    } catch (error) {
      logger.error('Error deleting cancelled purchase:', error);
    }
  }
  
  await ctx.editMessageText('❌ Закупка отменена');
  return ctx.scene.leave();
});

// Выход из сцены
purchaseScene.leave(async (ctx) => {
  delete ctx.scene.session.consolidatedProduct;
  delete ctx.scene.session.purchase;
  delete ctx.scene.session.step;
  delete ctx.scene.session.purchasedQuantity;
  delete ctx.scene.session.totalPrice;
  delete ctx.scene.session.notes;
});

module.exports = purchaseScene;