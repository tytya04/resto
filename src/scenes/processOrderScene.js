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
      status: order.status,
      hasUser: !!order.user,
      userId: order.user?.id,
      userTelegramId: order.user?.telegram_id
    });
    
    // Для continue_process разрешаем обработку заказов в статусе processing
    const isProcessing = order.status === 'processing' && order.processed_by === ctx.user.id;
    const isSent = order.status === 'sent';
    const isPurchased = order.status === 'purchased'; // Добавляем проверку для заказов после закупки
    
    if (!isSent && !isProcessing && !isPurchased) {
      await ctx.reply('⚠️ Этот заказ уже завершен или обрабатывается другим менеджером');
      return ctx.scene.leave();
    }
    
    // Проверяем наличие позиций
    if (!order.orderItems || order.orderItems.length === 0) {
      await ctx.reply('❌ В заказе нет позиций');
      return ctx.scene.leave();
    }
    
    // Обновляем статус на "в обработке" только если заказ еще не обрабатывается
    if (order.status === 'sent' || order.status === 'purchased') {
      await OrderService.updateOrderStatus(orderId, 'processing', ctx.user.id);
    }
    
    // Сохраняем данные заказа и пользователя в сессии сцены
    ctx.scene.session.order = order;
    ctx.scene.session.currentItemIndex = 0;
    ctx.scene.session.editedItems = [];
    ctx.scene.session.managerId = ctx.user.id; // Сохраняем ID менеджера
    
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
  
  // Используем last_sale_price как предложенную цену для продажи
  const suggestedPrice = nomenclature ? nomenclature.last_sale_price : null;
  const currentPrice = editedItems[currentItemIndex]?.price || item.price;
  
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
    message += `💵 Цена продажи: ${currentPrice} ₽\n`;
    message += `📊 Сумма: ${(currentPrice * item.quantity).toFixed(2)} ₽\n`;
  } else {
    message += `⚠️ Цена не указана\n`;
  }
  
  const buttons = [
    [Markup.button.callback('💰 Изменить цену', 'change_price')],
    [
      Markup.button.callback('⬅️ Назад', 'prev_item'),
      Markup.button.callback('➡️ Далее', 'next_item')
    ],
    [Markup.button.callback('📋 К итогу', 'show_summary')]
  ];
  
  const keyboard = Markup.inlineKeyboard(buttons);
  
  // Логируем для отладки
  logger.info('Showing order item:', {
    itemIndex: currentItemIndex,
    productName: item.product_name,
    currentPrice,
    suggestedPrice,
    hasKeyboard: !!keyboard,
    buttonsCount: buttons.length,
    hasCallbackQuery: !!ctx.callbackQuery,
    hasUpdateMessage: !!(ctx.update && ctx.update.message)
  });
  
  // Проверяем, можем ли мы редактировать сообщение
  // Редактировать можем только если есть callbackQuery (нажата inline кнопка)
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(message, { 
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
      });
    } catch (error) {
      // Если не удалось отредактировать (например, сообщение было удалено),
      // отправляем новое
      logger.warn('Failed to edit message, sending new one:', error.message);
      await ctx.reply(message, { 
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
      });
    }
  } else {
    // Если это обычное сообщение или команда, отправляем новое сообщение
    await ctx.reply(message, { 
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup
    });
  }
}

// Обработчик изменения цены
processOrderScene.action('change_price', async (ctx) => {
  await ctx.answerCbQuery();
  
  await ctx.reply(
    '💰 Введите новую цену за единицу товара:\n\n' +
    'Например: 150.50 или 200',
    {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отмена', 'cancel_price_change')]
      ]).reply_markup
    }
  );
  
  ctx.scene.session.awaitingPrice = true;
});

// Обработчик применения предложенной цены - удален, так как не используется
// (цена из номенклатуры - это себестоимость, а не отпускная цена)

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
  
  // Проверяем, можем ли мы редактировать сообщение
  // Редактировать можем только если есть callbackQuery (нажата inline кнопка)
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(message, { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup
      });
    } catch (error) {
      // Если не удалось отредактировать (например, сообщение было удалено),
      // отправляем новое
      logger.warn('Failed to edit summary message, sending new one:', error.message);
      await ctx.reply(message, { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup
      });
    }
  } else {
    // Если это обычное сообщение или команда, отправляем новое сообщение
    await ctx.reply(message, { 
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup
    });
  }
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
  
  await ctx.reply(message, {
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('❌ Отмена', 'cancel_comment')]
    ]).reply_markup
  });
  
  ctx.scene.session.awaitingComment = true;
});

// Подтверждение заказа
processOrderScene.action('approve_order', async (ctx) => {
  await ctx.answerCbQuery();
  
  const { order, editedItems, managerComment, managerId } = ctx.scene.session;
  
  // Проверяем наличие order в сессии
  if (!order || !order.id) {
    logger.error('Order not found in session:', { 
      hasOrder: !!order, 
      orderId: order?.id,
      sessionKeys: Object.keys(ctx.scene.session || {})
    });
    await ctx.reply('❌ Ошибка: данные заказа не найдены. Пожалуйста, начните обработку заново.');
    return ctx.scene.leave();
  }
  
  try {
    // Обновляем цены в базе данных (используем специальный метод для заказов после закупки)
    for (let i = 0; i < order.orderItems.length; i++) {
      const editedItem = editedItems[i];
      const orderItem = order.orderItems[i];
      
      if (!orderItem || !orderItem.id) {
        logger.error('Order item missing or invalid:', {
          index: i,
          hasOrderItem: !!orderItem,
          orderItemId: orderItem?.id,
          orderItemsLength: order.orderItems.length
        });
        continue;
      }
      
      if (editedItem && editedItem.price) {
        // Используем метод updateOrderItemPrice для заказов со статусом purchased
        await OrderService.updateOrderItemPrice(order.id, orderItem.id, editedItem.price);
        
        // Сохраняем цену в историю
        orderItem.price = editedItem.price;
        orderItem.total = editedItem.total;
        await PriceHistory.createFromOrderItem(orderItem, order, 'sale');
      }
    }
    
    // Проверяем order еще раз перед обновлением статуса
    if (!order || !order.id) {
      logger.error('Order lost before status update:', {
        hasOrder: !!order,
        orderId: order?.id,
        orderKeys: order ? Object.keys(order) : 'order is null'
      });
      throw new Error('Order data lost during processing');
    }
    
    // Проверяем наличие managerId
    if (!managerId) {
      logger.error('Manager ID not found in session:', {
        managerId: managerId,
        sessionKeys: Object.keys(ctx.scene.session || {})
      });
      throw new Error('Manager ID lost during processing');
    }
    
    // Обновляем статус заказа
    logger.info('About to update order status:', {
      orderId: order.id,
      managerId: managerId,
      hasOrder: !!order
    });
    await OrderService.updateOrderStatus(order.id, 'approved', managerId);
    
    // Сохраняем комментарий менеджера
    if (managerComment) {
      await Order.update(
        { manager_comment: managerComment },
        { where: { id: order.id } }
      );
    }
    
    // Перезагружаем заказ для получения связанных данных
    const updatedOrder = await OrderService.getOrderById(order.id);
    
    // Вычисляем итоговую сумму
    let totalAmount = 0;
    if (updatedOrder && updatedOrder.orderItems) {
      totalAmount = updatedOrder.orderItems.reduce((sum, item) => sum + (item.total || 0), 0);
    }
    
    // Отправляем уведомление ресторану (проверяем наличие user)
    if (updatedOrder && updatedOrder.user && updatedOrder.user.telegram_id) {
      await notificationService.sendToTelegramId(
        updatedOrder.user.telegram_id,
        `✅ <b>Ваш заказ #${updatedOrder.order_number} подтвержден!</b>\n\n` +
      `💰 Сумма: ${totalAmount.toFixed(2)} ₽\n` +
      (managerComment ? `\n💬 Комментарий менеджера: ${managerComment}` : ''),
      { parse_mode: 'HTML' }
      );
    }
    
    // Проверяем наличие других необработанных заказов
    const pendingOrders = await Order.findAll({
      where: { 
        status: 'sent',
        '$restaurant.is_active$': true
      },
      include: [
        { model: Restaurant, as: 'restaurant' },
        { model: User, as: 'user' }
      ],
      order: [['created_at', 'ASC']]
    });
    
    logger.info('Checking for pending orders:', { count: pendingOrders.length });
    
    const buttons = [
      [Markup.button.callback('📄 Создать ТОРГ-12', `generate_torg12_after:${order.id}`)]
    ];
    
    // Если есть еще необработанные заказы, добавляем кнопку для обработки следующего
    if (pendingOrders.length > 0) {
      const nextOrder = pendingOrders[0];
      buttons.push([
        Markup.button.callback(
          `📋 Обработать следующий заказ (#${nextOrder.order_number})`, 
          `process_next_order:${nextOrder.id}`
        )
      ]);
    }
    
    buttons.push([Markup.button.callback('✅ Готово', 'done')]);
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    let message = `✅ <b>Заказ #${order.order_number} успешно подтвержден!</b>\n\n` +
                  `Уведомление отправлено в ресторан.\n\n`;
    
    if (pendingOrders.length > 0) {
      message += `📌 <b>Осталось обработать заказов: ${pendingOrders.length}</b>\n\n`;
    }
    
    message += `Хотите сгенерировать документы?`;
    
    await ctx.editMessageText(message, { 
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup
    });
    
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
    {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('Нет в наличии', 'reject_no_stock')],
        [Markup.button.callback('Неверная позиция', 'reject_wrong_item')],
        [Markup.button.callback('Другая причина', 'reject_other')],
        [Markup.button.callback('❌ Отмена', 'cancel_rejection')]
      ]).reply_markup
    }
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
    
    // Проверяем наличие других необработанных заказов
    const pendingOrders = await Order.findAll({
      where: { 
        status: 'sent',
        '$restaurant.is_active$': true
      },
      include: [
        { model: Restaurant, as: 'restaurant' },
        { model: User, as: 'user' }
      ],
      order: [['created_at', 'ASC']]
    });
    
    let message = `❌ <b>Заказ #${order.order_number} отклонен</b>\n\n` +
                  `Причина: ${rejectionReason}\n\n` +
                  `Уведомление отправлено в ресторан.`;
    
    if (pendingOrders.length > 0) {
      message += `\n\n📌 <b>Осталось обработать заказов: ${pendingOrders.length}</b>`;
      
      const nextOrder = pendingOrders[0];
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(
          `📋 Обработать следующий заказ (#${nextOrder.order_number})`, 
          `process_next_order:${nextOrder.id}`
        )],
        [Markup.button.callback('✅ Готово', 'done')]
      ]);
      
      await ctx.reply(message, { 
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
      });
    } else {
      await ctx.reply(message, { parse_mode: 'HTML' });
    }
    
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

// Обработка следующего заказа
processOrderScene.action(/^process_next_order:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const orderId = parseInt(ctx.match[1]);
  
  logger.info('Processing next order:', { orderId });
  
  // Покидаем текущую сцену и запускаем обработку следующего заказа
  await ctx.scene.leave();
  
  // Входим в сцену обработки заказа с новым ID
  await ctx.scene.enter('process_order', { orderId });
});

// Генерация ТОРГ-12 после подтверждения
processOrderScene.action(/^generate_torg12_after:(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery('Генерируем ТОРГ-12...');
    const orderId = parseInt(ctx.match[1]);
    
    logger.info('Generating TORG-12 from scene', { orderId, userId: ctx.user?.id });
    
    // Покидаем сцену и вызываем команду генерации
    await ctx.scene.leave();
    ctx.message = { text: `/generate_torg12_${orderId}` };
    
    const documentsHandlers = require('../handlers/documents');
    return documentsHandlers.generateTorg12Command(ctx);
  } catch (error) {
    logger.error('Error in generate_torg12_after handler:', error);
    await ctx.reply('❌ Ошибка при генерации ТОРГ-12');
  }
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
  delete ctx.scene.session.managerId;
});

module.exports = processOrderScene;