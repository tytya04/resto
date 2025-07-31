const { Scenes, Markup } = require('telegraf');
const { Order, OrderItem, Restaurant, User, NomenclatureCache, PriceHistory } = require('../database/models');
const OrderService = require('../services/OrderService');
const OrderFormatter = require('../utils/orderFormatter');
const logger = require('../utils/logger');
const { notificationService } = require('../services/NotificationService');
const { formatInTimezone } = require('../utils/timezone');

// Сцена обработки заявки менеджером
const processOrderScene = new Scenes.BaseScene('process_order');

// Вход в сцену
processOrderScene.enter(async (ctx) => {
  const orderId = ctx.scene.state.orderId;
  
  if (!orderId) {
    await ctx.reply('❌ Ошибка: не указан номер заказа');
    return ctx.scene.leave();
  }
  
  try {
    // Получаем заказ с деталями
    const order = await OrderService.getOrderById(orderId);
    
    if (!order) {
      await ctx.reply('❌ Заказ не найден');
      return ctx.scene.leave();
    }
    
    // Логируем для отладки
    logger.info('Order loaded:', {
      orderId: order.id,
      orderNumber: order.order_number,
      itemsCount: order.orderItems ? order.orderItems.length : 0,
      status: order.status
    });
    
    // Для continue_process разрешаем обработку заказов в статусе processing
    const isProcessing = order.status === 'processing' && order.processed_by === ctx.user.id;
    const isSent = order.status === 'sent';
    
    if (!isSent && !isProcessing) {
      await ctx.reply('⚠️ Этот заказ уже завершен или обрабатывается другим менеджером');
      return ctx.scene.leave();
    }
    
    // Проверяем наличие позиций
    if (!order.orderItems || order.orderItems.length === 0) {
      await ctx.reply('❌ В заказе нет позиций');
      return ctx.scene.leave();
    }
    
    // Обновляем статус на "в обработке" только если заказ еще не обрабатывается
    if (order.status === 'sent') {
      await OrderService.updateOrderStatus(orderId, 'processing', ctx.user.id);
    }
    
    // Сохраняем данные заказа в сессии сцены
    ctx.scene.session.order = order;
    ctx.scene.session.currentItemIndex = 0;
    ctx.scene.session.editedItems = [];
    
    // Начинаем обработку позиций
    await showOrderItem(ctx);
    
  } catch (error) {
    logger.error('Error in processOrderScene.enter:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке заказа');
    return ctx.scene.leave();
  }
});

// Показ позиции заказа
async function showOrderItem(ctx) {
  const { order, currentItemIndex, editedItems } = ctx.scene.session;
  const item = order.orderItems[currentItemIndex];
  
  if (!item) {
    // Все позиции обработаны, показываем итог
    return await showOrderSummary(ctx);
  }
  
  // Ищем цену и техническую пометку в номенклатуре
  const nomenclature = await NomenclatureCache.findOne({
    where: { product_name: item.product_name }
  });
  
  const suggestedPrice = nomenclature ? nomenclature.price : null;
  const currentPrice = editedItems[currentItemIndex]?.price || item.price || suggestedPrice;
  
  let message = `📦 <b>Позиция ${currentItemIndex + 1} из ${order.orderItems.length}</b>\n\n`;
  message += `<b>${item.product_name}</b>`;
  
  // Добавляем техническую пометку если есть
  if (nomenclature?.technical_note) {
    message += ` <i>(${nomenclature.technical_note})</i>`;
  }
  
  message += `\n`;
  message += `Количество: ${item.quantity} ${item.unit}\n`;
  
  if (suggestedPrice) {
    message += `💰 Цена из номенклатуры: ${suggestedPrice} ₽\n`;
  }
  
  if (currentPrice) {
    message += `💵 Текущая цена: ${currentPrice} ₽\n`;
    message += `📊 Сумма: ${(currentPrice * item.quantity).toFixed(2)} ₽\n`;
  } else {
    message += `⚠️ Цена не указана\n`;
  }
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💰 Изменить цену', 'change_price')],
    suggestedPrice && currentPrice !== suggestedPrice ? 
      [Markup.button.callback(`✅ Применить ${suggestedPrice} ₽`, 'apply_suggested')] : [],
    [
      Markup.button.callback('⬅️ Назад', 'prev_item'),
      Markup.button.callback('➡️ Далее', 'next_item')
    ],
    [Markup.button.callback('📋 К итогу', 'show_summary')]
  ].filter(row => row.length > 0));
  
  await ctx.reply(message, { 
    parse_mode: 'HTML',
    reply_markup: keyboard 
  });
}

// Обработчик изменения цены
processOrderScene.action('change_price', async (ctx) => {
  await ctx.answerCbQuery();
  
  await ctx.reply(
    '💰 Введите новую цену за единицу товара:\n\n' +
    'Например: 150.50 или 200',
    Markup.inlineKeyboard([
      [Markup.button.callback('❌ Отмена', 'cancel_price_change')]
    ])
  );
  
  ctx.scene.session.awaitingPrice = true;
});

// Обработчик применения предложенной цены
processOrderScene.action('apply_suggested', async (ctx) => {
  await ctx.answerCbQuery();
  
  const { order, currentItemIndex } = ctx.scene.session;
  const item = order.orderItems[currentItemIndex];
  
  const nomenclature = await NomenclatureCache.findOne({
    where: { product_name: item.product_name }
  });
  
  if (nomenclature && nomenclature.price) {
    // Сохраняем изменение
    if (!ctx.scene.session.editedItems[currentItemIndex]) {
      ctx.scene.session.editedItems[currentItemIndex] = { ...item.dataValues };
    }
    ctx.scene.session.editedItems[currentItemIndex].price = nomenclature.price;
    ctx.scene.session.editedItems[currentItemIndex].total = nomenclature.price * item.quantity;
    
    await ctx.editMessageText('✅ Цена применена');
    await showOrderItem(ctx);
  }
});

// Навигация между позициями
processOrderScene.action('prev_item', async (ctx) => {
  await ctx.answerCbQuery();
  
  if (ctx.scene.session.currentItemIndex > 0) {
    ctx.scene.session.currentItemIndex--;
    await ctx.deleteMessage();
    await showOrderItem(ctx);
  }
});

processOrderScene.action('next_item', async (ctx) => {
  await ctx.answerCbQuery();
  
  const { order, currentItemIndex } = ctx.scene.session;
  
  if (currentItemIndex < order.orderItems.length - 1) {
    ctx.scene.session.currentItemIndex++;
    await ctx.deleteMessage();
    await showOrderItem(ctx);
  } else {
    await showOrderSummary(ctx);
  }
});

// Показ итоговой информации
async function showOrderSummary(ctx) {
  const { order, editedItems } = ctx.scene.session;
  
  let message = `📋 <b>Итоговая информация по заказу #${order.order_number}</b>\n\n`;
  message += `🏢 Ресторан: ${order.restaurant.name}\n`;
  message += `👤 Заказал: ${order.user.first_name || order.user.username}\n`;
  message += `📅 Дата: ${formatInTimezone(order.created_at, 'DD.MM.YYYY HH:mm')}\n\n`;
  
  message += '<b>Позиции заказа:</b>\n';
  let totalAmount = 0;
  let hasEmptyPrices = false;
  
  order.orderItems.forEach((item, index) => {
    const editedItem = editedItems[index];
    const price = editedItem?.price || item.price;
    const total = price ? price * item.quantity : 0;
    
    message += `\n${index + 1}. ${item.product_name}\n`;
    message += `   ${item.quantity} ${item.unit}`;
    
    if (price) {
      message += ` × ${price} ₽ = ${total.toFixed(2)} ₽`;
      if (editedItem) {
        message += ' ✏️';
      }
    } else {
      message += ' - <b>цена не указана</b>';
      hasEmptyPrices = true;
    }
    
    totalAmount += total;
  });
  
  message += `\n\n💰 <b>Итого: ${totalAmount.toFixed(2)} ₽</b>`;
  
  if (order.notes) {
    message += `\n\n📝 Примечание от ресторана: ${order.notes}`;
  }
  
  const keyboard = [
    [Markup.button.callback('✏️ Редактировать позиции', 'edit_items')],
    [Markup.button.callback('💬 Добавить комментарий', 'add_comment')]
  ];
  
  if (!hasEmptyPrices) {
    keyboard.push([
      Markup.button.callback('✅ Подтвердить заказ', 'approve_order'),
      Markup.button.callback('❌ Отклонить заказ', 'reject_order')
    ]);
  }
  
  keyboard.push([
    Markup.button.callback('❓ Запросить уточнения', 'request_clarification'),
    Markup.button.callback('🚫 Отменить обработку', 'cancel_processing')
  ]);
  
  await ctx.editMessageText(message, { 
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard(keyboard)
  });
}

// Обработчик ввода цены
processOrderScene.on('text', async (ctx) => {
  if (!ctx.scene.session.awaitingPrice && !ctx.scene.session.awaitingComment && !ctx.scene.session.awaitingRejectionReason) {
    return;
  }
  
  const text = ctx.message.text;
  
  if (ctx.scene.session.awaitingPrice) {
    const price = parseFloat(text);
    
    if (isNaN(price) || price < 0) {
      return ctx.reply('⚠️ Введите корректную цену (положительное число)');
    }
    
    const { order, currentItemIndex } = ctx.scene.session;
    const item = order.orderItems[currentItemIndex];
    
    // Сохраняем изменение
    if (!ctx.scene.session.editedItems[currentItemIndex]) {
      ctx.scene.session.editedItems[currentItemIndex] = { ...item.dataValues };
    }
    ctx.scene.session.editedItems[currentItemIndex].price = price;
    ctx.scene.session.editedItems[currentItemIndex].total = price * item.quantity;
    
    ctx.scene.session.awaitingPrice = false;
    
    await ctx.reply('✅ Цена сохранена');
    await showOrderItem(ctx);
    
  } else if (ctx.scene.session.awaitingComment) {
    ctx.scene.session.managerComment = text;
    ctx.scene.session.awaitingComment = false;
    
    await ctx.reply('✅ Комментарий добавлен');
    await showOrderSummary(ctx);
    
  } else if (ctx.scene.session.awaitingRejectionReason) {
    ctx.scene.session.rejectionReason = text;
    ctx.scene.session.awaitingRejectionReason = false;
    
    await rejectOrder(ctx);
  }
});

// Редактирование позиций
processOrderScene.action('edit_items', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.scene.session.currentItemIndex = 0;
  await ctx.deleteMessage();
  await showOrderItem(ctx);
});

// Добавление комментария
processOrderScene.action('add_comment', async (ctx) => {
  await ctx.answerCbQuery();
  
  const currentComment = ctx.scene.session.managerComment;
  const message = currentComment ? 
    `💬 Текущий комментарий:\n${currentComment}\n\nВведите новый комментарий:` :
    '💬 Введите комментарий к заказу:';
  
  await ctx.reply(message, Markup.inlineKeyboard([
    [Markup.button.callback('❌ Отмена', 'cancel_comment')]
  ]));
  
  ctx.scene.session.awaitingComment = true;
});

// Подтверждение заказа
processOrderScene.action('approve_order', async (ctx) => {
  await ctx.answerCbQuery();
  
  const { order, editedItems, managerComment } = ctx.scene.session;
  
  try {
    // Обновляем цены в базе данных
    for (let i = 0; i < order.orderItems.length; i++) {
      const editedItem = editedItems[i];
      if (editedItem) {
        await OrderService.updateOrderItem(order.id, order.orderItems[i].id, {
          price: editedItem.price,
          total: editedItem.total
        });
        
        // Сохраняем цену в историю
        const orderItem = order.orderItems[i];
        orderItem.price = editedItem.price;
        orderItem.total = editedItem.total;
        await PriceHistory.createFromOrderItem(orderItem, order, 'sale');
      }
    }
    
    // Обновляем статус заказа
    await OrderService.updateOrderStatus(order.id, 'approved', ctx.user.id);
    
    // Сохраняем комментарий менеджера
    if (managerComment) {
      await Order.update(
        { manager_comment: managerComment },
        { where: { id: order.id } }
      );
    }
    
    // Отправляем уведомление ресторану
    await notificationService.sendNotification(
      order.user.telegram_id,
      `✅ <b>Ваш заказ #${order.order_number} подтвержден!</b>\n\n` +
      `💰 Сумма: ${order.total_amount} ₽\n` +
      (managerComment ? `\n💬 Комментарий менеджера: ${managerComment}` : ''),
      { parse_mode: 'HTML' }
    );
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📄 Создать ТОРГ-12', `generate_torg12_after:${order.id}`)],
      [Markup.button.callback('✅ Готово', 'done')]
    ]);
    
    await ctx.editMessageText(
      `✅ <b>Заказ #${order.order_number} успешно подтвержден!</b>\n\n` +
      `Уведомление отправлено в ресторан.\n\n` +
      `Хотите сгенерировать документы?`,
      { 
        parse_mode: 'HTML',
        reply_markup: keyboard
      }
    );
    
    return ctx.scene.leave();
    
  } catch (error) {
    logger.error('Error approving order:', error);
    await ctx.reply('❌ Ошибка при подтверждении заказа');
  }
});

// Отклонение заказа
processOrderScene.action('reject_order', async (ctx) => {
  await ctx.answerCbQuery();
  
  await ctx.reply(
    '❌ Укажите причину отклонения заказа:',
    Markup.inlineKeyboard([
      [Markup.button.callback('Нет в наличии', 'reject_no_stock')],
      [Markup.button.callback('Неверная позиция', 'reject_wrong_item')],
      [Markup.button.callback('Другая причина', 'reject_other')],
      [Markup.button.callback('❌ Отмена', 'cancel_rejection')]
    ])
  );
});

// Быстрые причины отклонения
processOrderScene.action(/^reject_(.+)$/, async (ctx) => {
  const reason = ctx.match[1];
  await ctx.answerCbQuery();
  
  const reasons = {
    'no_stock': 'Товар отсутствует в наличии',
    'wrong_item': 'Неверно указана позиция',
    'other': null
  };
  
  if (reason === 'other') {
    await ctx.reply('📝 Введите причину отклонения:');
    ctx.scene.session.awaitingRejectionReason = true;
  } else {
    ctx.scene.session.rejectionReason = reasons[reason];
    await rejectOrder(ctx);
  }
});

// Функция отклонения заказа
async function rejectOrder(ctx) {
  const { order, rejectionReason } = ctx.scene.session;
  
  try {
    await OrderService.updateOrderStatus(order.id, 'rejected', ctx.user.id, rejectionReason);
    
    // Отправляем уведомление ресторану
    await notificationService.sendNotification(
      order.user.telegram_id,
      `❌ <b>Ваш заказ #${order.order_number} отклонен</b>\n\n` +
      `Причина: ${rejectionReason}`,
      { parse_mode: 'HTML' }
    );
    
    await ctx.reply(
      `❌ <b>Заказ #${order.order_number} отклонен</b>\n\n` +
      `Причина: ${rejectionReason}\n\n` +
      `Уведомление отправлено в ресторан.`,
      { parse_mode: 'HTML' }
    );
    
    return ctx.scene.leave();
    
  } catch (error) {
    logger.error('Error rejecting order:', error);
    await ctx.reply('❌ Ошибка при отклонении заказа');
  }
}

// Запрос уточнений
processOrderScene.action('request_clarification', async (ctx) => {
  await ctx.answerCbQuery();
  
  const { order } = ctx.scene.session;
  
  // Отправляем уведомление с просьбой связаться
  await notificationService.sendNotification(
    order.user.telegram_id,
    `❓ <b>По заказу #${order.order_number} требуются уточнения</b>\n\n` +
    `Менеджер ${ctx.user.first_name || ctx.user.username} просит связаться для уточнения деталей заказа.\n\n` +
    `Контакт менеджера: @${ctx.user.username}`,
    { parse_mode: 'HTML' }
  );
  
  await ctx.reply(
    '✅ Запрос на уточнение отправлен в ресторан.\n' +
    'Сотрудник ресторана свяжется с вами.'
  );
});

// Отмена обработки
processOrderScene.action('cancel_processing', async (ctx) => {
  await ctx.answerCbQuery();
  
  const { order } = ctx.scene.session;
  
  // Возвращаем статус обратно на "отправлен"
  await OrderService.updateOrderStatus(order.id, 'sent');
  
  await ctx.editMessageText('❌ Обработка заказа отменена');
  return ctx.scene.leave();
});

// Отмены различных действий
processOrderScene.action('cancel_price_change', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.scene.session.awaitingPrice = false;
  await ctx.deleteMessage();
  await showOrderItem(ctx);
});

processOrderScene.action('cancel_comment', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.scene.session.awaitingComment = false;
  await ctx.deleteMessage();
  await showOrderSummary(ctx);
});

processOrderScene.action('cancel_rejection', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  await showOrderSummary(ctx);
});

processOrderScene.action('show_summary', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  await showOrderSummary(ctx);
});

// Генерация ТОРГ-12 после подтверждения
processOrderScene.action(/^generate_torg12_after:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const orderId = parseInt(ctx.match[1]);
  
  // Покидаем сцену и вызываем команду генерации
  await ctx.scene.leave();
  ctx.message = { text: `/generate_torg12_${orderId}` };
  
  const documentsHandlers = require('../handlers/documents');
  return documentsHandlers.generateTorg12Command(ctx);
});

// Завершение без генерации документов
processOrderScene.action('done', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('✅ Обработка заказа завершена');
  await ctx.scene.leave();
  
  // Показываем главное меню менеджера
  const registrationHandlers = require('../handlers/registration');
  return registrationHandlers.showMainMenu(ctx, ctx.user);
});

// Выход из сцены
processOrderScene.leave(async (ctx) => {
  delete ctx.scene.session.order;
  delete ctx.scene.session.currentItemIndex;
  delete ctx.scene.session.editedItems;
  delete ctx.scene.session.awaitingPrice;
  delete ctx.scene.session.awaitingComment;
  delete ctx.scene.session.awaitingRejectionReason;
  delete ctx.scene.session.managerComment;
  delete ctx.scene.session.rejectionReason;
});

module.exports = processOrderScene;