const { Markup } = require('telegraf');
const { Order, OrderItem, Restaurant } = require('../database/models');
const OrderService = require('../services/OrderService');
const OrderFormatter = require('../utils/orderFormatter');
const logger = require('../utils/logger');
const { notifyNewOrder } = require('../services/NotificationService');

// Команда создания нового заказа
const newOrderCommand = async (ctx) => {
  try {
    // Проверяем, есть ли незавершенный заказ
    if (ctx.session.currentOrder && ctx.session.currentOrder.items.length > 0) {
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📋 Продолжить текущий', 'continue_current_order')],
        [Markup.button.callback('🆕 Начать новый', 'start_new_order')],
        [Markup.button.callback('❌ Отмена', 'cancel')]
      ]);

      return ctx.reply(
        '⚠️ У вас есть незавершенный заказ.\n\n' +
        `Позиций: ${ctx.session.currentOrder.items.length}\n` +
        `Сумма: ${OrderFormatter.calculateTotal(ctx.session.currentOrder.items)} ₽\n\n` +
        'Что вы хотите сделать?',
        keyboard
      );
    }

    // Создаем новый заказ
    await startNewOrder(ctx);
  } catch (error) {
    logger.error('Error in newOrderCommand:', error);
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
};

// Начало нового заказа
const startNewOrder = async (ctx) => {
  // Инициализируем новый заказ
  ctx.session.currentOrder = {
    items: [],
    restaurant_id: ctx.user.restaurant_id,
    user_id: ctx.user.id,
    created_at: new Date(),
    status: 'draft',
    notes: ''
  };

  const keyboard = Markup.keyboard([
    ['🔍 Добавить продукт'],
    ['📋 Шаблоны заказов'],
    ['❌ Отмена']
  ]).resize();

  await ctx.reply(
    '📝 Новый заказ создан!\n\n' +
    'Добавьте продукты в заказ.\n' +
    'Вы можете использовать готовые шаблоны или добавить продукты вручную.',
    keyboard
  );
};

// Добавление продукта
const addProductCommand = async (ctx) => {
  if (!ctx.session.currentOrder) {
    return ctx.reply(
      '❌ Сначала создайте новый заказ.\n' +
      'Используйте команду /new_order'
    );
  }

  // Переходим в сцену добавления продукта
  return ctx.scene.enter('add_product');
};

// Просмотр текущего заказа
const myOrderCommand = async (ctx) => {
  if (!ctx.session.currentOrder || ctx.session.currentOrder.items.length === 0) {
    return ctx.reply(
      '📋 У вас нет активного заказа.\n\n' +
      'Используйте /new_order для создания нового заказа.'
    );
  }

  const order = ctx.session.currentOrder;
  const orderText = OrderFormatter.formatOrder(order);

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('➕ Добавить продукт', 'add_more_products')],
    [Markup.button.callback('✏️ Редактировать', 'edit_order')],
    [Markup.button.callback('📝 Добавить примечание', 'add_note')],
    [Markup.button.callback('✅ Отправить заказ', 'send_order')],
    [Markup.button.callback('❌ Удалить заказ', 'delete_order')]
  ]);

  await ctx.reply(orderText, {
    parse_mode: 'HTML',
    ...keyboard
  });
};

// Редактирование заказа
const editOrderCommand = async (ctx) => {
  if (!ctx.session.currentOrder || ctx.session.currentOrder.items.length === 0) {
    return ctx.reply('❌ Нет заказа для редактирования.');
  }

  const buttons = ctx.session.currentOrder.items.map((item, index) => [
    Markup.button.callback(
      `${item.product_name} (${item.quantity} ${item.unit})`,
      `edit_item:${index}`
    )
  ]);

  buttons.push([Markup.button.callback('⬅️ Назад', 'back_to_order')]);

  const keyboard = Markup.inlineKeyboard(buttons);

  await ctx.reply(
    '✏️ Выберите позицию для редактирования:',
    keyboard
  );
};

// Удаление позиции
const deleteItemCommand = async (ctx) => {
  if (!ctx.session.currentOrder || ctx.session.currentOrder.items.length === 0) {
    return ctx.reply('❌ Нет заказа для редактирования.');
  }

  const buttons = ctx.session.currentOrder.items.map((item, index) => [
    Markup.button.callback(
      `❌ ${item.product_name} (${item.quantity} ${item.unit})`,
      `delete_item:${index}`
    )
  ]);

  buttons.push([Markup.button.callback('⬅️ Назад', 'back_to_order')]);

  const keyboard = Markup.inlineKeyboard(buttons);

  await ctx.reply(
    '❌ Выберите позицию для удаления:',
    keyboard
  );
};

// Обработчики callback queries
const handleOrderCallbacks = async (ctx) => {
  const { data } = ctx.callbackQuery;
  await ctx.answerCbQuery();

  try {
    // Продолжить текущий заказ
    if (data === 'continue_current_order') {
      return myOrderCommand(ctx);
    }

    // Начать новый заказ
    if (data === 'start_new_order') {
      await ctx.editMessageText('🆕 Создаю новый заказ...');
      return startNewOrder(ctx);
    }

    // Добавить больше продуктов
    if (data === 'add_more_products') {
      await ctx.editMessageText('➕ Добавление продукта...');
      return ctx.scene.enter('add_product');
    }

    // Редактировать заказ
    if (data === 'edit_order') {
      return editOrderCommand(ctx);
    }

    // Редактировать позицию
    if (data.startsWith('edit_item:')) {
      const index = parseInt(data.split(':')[1]);
      return editOrderItem(ctx, index);
    }

    // Удалить позицию
    if (data.startsWith('delete_item:')) {
      const index = parseInt(data.split(':')[1]);
      return deleteOrderItem(ctx, index);
    }

    // Добавить примечание
    if (data === 'add_note') {
      ctx.session.awaitingOrderNote = true;
      await ctx.editMessageText(
        '📝 Введите примечание к заказу:\n\n' +
        'Например: Доставка после 14:00, звонить заранее'
      );
      return;
    }

    // Отправить заказ
    if (data === 'send_order') {
      return sendOrder(ctx);
    }

    // Удалить заказ
    if (data === 'delete_order') {
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Да, удалить', 'confirm_delete_order')],
        [Markup.button.callback('❌ Отмена', 'back_to_order')]
      ]);

      await ctx.editMessageText(
        '⚠️ Вы уверены, что хотите удалить весь заказ?',
        keyboard
      );
      return;
    }

    // Подтвердить удаление заказа
    if (data === 'confirm_delete_order') {
      ctx.session.currentOrder = null;
      await ctx.editMessageText('✅ Заказ удален');
      return;
    }

    // Вернуться к заказу
    if (data === 'back_to_order') {
      return myOrderCommand(ctx);
    }

  } catch (error) {
    logger.error('Error in order callbacks:', error);
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
};

// Редактирование позиции заказа
const editOrderItem = async (ctx, index) => {
  const item = ctx.session.currentOrder.items[index];
  if (!item) {
    return ctx.reply('❌ Позиция не найдена');
  }

  ctx.session.editingItemIndex = index;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Изменить количество', `change_quantity:${index}`)],
    [Markup.button.callback('❌ Удалить позицию', `delete_item:${index}`)],
    [Markup.button.callback('⬅️ Назад', 'back_to_order')]
  ]);

  await ctx.editMessageText(
    `📦 ${item.product_name}\n` +
    `Количество: ${item.quantity} ${item.unit}\n` +
    `Цена: ${item.price || 'н/д'} ₽/${item.unit}\n` +
    `Сумма: ${item.total || 'н/д'} ₽\n\n` +
    'Выберите действие:',
    keyboard
  );
};

// Удаление позиции из заказа
const deleteOrderItem = async (ctx, index) => {
  const item = ctx.session.currentOrder.items[index];
  if (!item) {
    return ctx.reply('❌ Позиция не найдена');
  }

  // Удаляем позицию
  ctx.session.currentOrder.items.splice(index, 1);

  await ctx.editMessageText(
    `✅ Позиция "${item.product_name}" удалена из заказа.\n\n` +
    `Осталось позиций: ${ctx.session.currentOrder.items.length}`
  );

  // Если заказ пустой
  if (ctx.session.currentOrder.items.length === 0) {
    ctx.session.currentOrder = null;
    setTimeout(() => {
      ctx.reply('Заказ пуст. Используйте /new_order для создания нового.');
    }, 1000);
  } else {
    setTimeout(() => myOrderCommand(ctx), 1000);
  }
};

// Отправка заказа
const sendOrder = async (ctx) => {
  try {
    const order = ctx.session.currentOrder;
    
    if (!order || order.orderItems.length === 0) {
      return ctx.reply('❌ Заказ пуст');
    }

    await ctx.editMessageText('⏳ Отправляю заказ...');

    // Сохраняем заказ в БД
    const savedOrder = await OrderService.createOrder(order);

    // Уведомляем менеджеров
    await notifyNewOrder({
      order_number: savedOrder.order_number,
      restaurant_name: ctx.user.restaurant?.name || 'Ресторан',
      items_count: savedOrder.items.length,
      total_amount: savedOrder.total_amount
    });

    // Очищаем текущий заказ
    ctx.session.currentOrder = null;

    await ctx.reply(
      `✅ Заказ #${savedOrder.order_number} успешно отправлен!\n\n` +
      `📋 Позиций: ${savedOrder.items.length}\n` +
      `💰 Сумма: ${savedOrder.total_amount} ₽\n\n` +
      'Менеджер рассмотрит вашу заявку в ближайшее время.\n' +
      'Вы получите уведомление об изменении статуса.',
      Markup.keyboard([
        ['📋 Мои заказы'],
        ['🆕 Новый заказ'],
        ['🏠 Главное меню']
      ]).resize()
    );

  } catch (error) {
    logger.error('Error sending order:', error);
    ctx.reply('❌ Ошибка при отправке заказа. Попробуйте позже.');
  }
};

// Обработка текстовых сообщений для заказов
const handleOrderText = async (ctx) => {
  // Ожидание примечания к заказу
  if (ctx.session.awaitingOrderNote && ctx.session.currentOrder) {
    ctx.session.currentOrder.notes = ctx.message.text;
    ctx.session.awaitingOrderNote = false;
    
    await ctx.reply(
      '✅ Примечание добавлено к заказу.\n\n' +
      `📝 ${ctx.message.text}`
    );
    
    setTimeout(() => myOrderCommand(ctx), 1000);
    return true;
  }

  // Ожидание нового количества для позиции
  if (ctx.session.editingItemIndex !== undefined && ctx.session.awaitingQuantity) {
    const quantity = parseFloat(ctx.message.text.replace(',', '.'));
    
    if (isNaN(quantity) || quantity <= 0) {
      await ctx.reply('⚠️ Введите корректное количество больше 0');
      return true;
    }

    const index = ctx.session.editingItemIndex;
    const item = ctx.session.currentOrder.items[index];
    
    if (item) {
      item.quantity = quantity;
      item.total = item.price ? quantity * item.price : null;
      
      await ctx.reply(
        `✅ Количество изменено:\n` +
        `${item.product_name}: ${quantity} ${item.unit}`
      );
    }

    ctx.session.editingItemIndex = undefined;
    ctx.session.awaitingQuantity = false;
    
    setTimeout(() => myOrderCommand(ctx), 1000);
    return true;
  }

  return false;
};

// История заказов
const orderHistoryCommand = async (ctx) => {
  try {
    const orders = await Order.findAll({
      where: {
        user_id: ctx.user.id
      },
      include: [{
        model: OrderItem,
        as: 'orderItems'
      }],
      order: [['created_at', 'DESC']],
      limit: 10
    });

    if (orders.length === 0) {
      return ctx.reply('📋 У вас пока нет заказов.');
    }

    let message = '📋 Ваши последние заказы:\n\n';
    
    orders.forEach((order, index) => {
      const statusEmoji = {
        'draft': '📝',
        'sent': '📤',
        'processing': '⏳',
        'approved': '✅',
        'rejected': '❌',
        'completed': '✅'
      };

      message += `${statusEmoji[order.status] || '📋'} #${order.order_number}\n`;
      message += `Дата: ${order.created_at.toLocaleDateString('ru-RU')}\n`;
      message += `Позиций: ${order.orderItems.length}\n`;
      message += `Сумма: ${order.total_amount} ₽\n`;
      message += `Статус: ${OrderFormatter.getStatusText(order.status)}\n\n`;
    });

    await ctx.reply(message);

  } catch (error) {
    logger.error('Error in order history:', error);
    ctx.reply('❌ Ошибка при загрузке истории заказов.');
  }
};

module.exports = {
  newOrderCommand,
  addProductCommand,
  myOrderCommand,
  editOrderCommand,
  deleteItemCommand,
  handleOrderCallbacks,
  handleOrderText,
  orderHistoryCommand
};