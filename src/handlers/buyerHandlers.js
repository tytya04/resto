const { Markup } = require('telegraf');
const { Order, OrderItem, Restaurant, User, sequelize } = require('../database/models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const { formatInTimezone } = require('../utils/timezone');

// Показать общий список продуктов для закупки
const showConsolidatedProducts = async (ctx) => {
  try {
    // Получаем все позиции из заказов со статусом sent
    const items = await OrderItem.findAll({
      include: [{
        model: Order,
        as: 'order',
        where: { status: 'sent' },
        attributes: ['id', 'order_number', 'restaurant_id']
      }],
      order: [['product_name', 'ASC']]
    });

    if (items.length === 0) {
      return ctx.reply('📋 Нет активных заказов для закупки');
    }

    // Группируем по продуктам
    const consolidated = {};
    items.forEach(item => {
      const key = `${item.product_name}_${item.unit}`;
      if (!consolidated[key]) {
        consolidated[key] = {
          product_name: item.product_name,
          unit: item.unit,
          total_quantity: 0,
          items: [],
          purchased_quantity: 0,
          is_purchased: false
        };
      }
      consolidated[key].total_quantity += parseFloat(item.quantity);
      consolidated[key].items.push(item);
    });

    // Сохраняем в сессии для работы
    ctx.session.consolidatedProducts = consolidated;

    let message = '📋 <b>Общий список продуктов для закупки</b>\n\n';
    
    let index = 1;
    Object.values(consolidated).forEach(product => {
      const emoji = product.is_purchased ? '✅' : '📦';
      message += `${emoji} ${index}. <b>${product.product_name}</b>\n`;
      message += `   Количество: ${product.total_quantity} ${product.unit}\n`;
      if (product.purchased_quantity > 0) {
        message += `   Закуплено: ${product.purchased_quantity} ${product.unit}\n`;
      }
      message += '\n';
      index++;
    });

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛒 Начать закупку', callback_data: 'buyer_start_purchase' }],
          [{ text: '📊 Экспорт в Excel', callback_data: 'buyer_export_consolidated' }],
          [{ text: '🔙 Назад', callback_data: 'menu_back' }]
        ]
      }
    };

    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error in showConsolidatedProducts:', error);
    ctx.reply('❌ Произошла ошибка при загрузке списка');
  }
};

// Начать процесс закупки
const startPurchase = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const consolidated = ctx.session.consolidatedProducts;
    if (!consolidated) {
      return ctx.reply('❌ Сессия истекла. Начните заново.');
    }

    // Находим первый незакупленный продукт
    const products = Object.values(consolidated);
    const unpurchased = products.find(p => !p.is_purchased);
    
    if (!unpurchased) {
      return ctx.editMessageText(
        '✅ <b>Все продукты закуплены!</b>\n\n' +
        'Теперь можно приступить к комплектации корзин.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📊 Перейти к комплектации', callback_data: 'buyer_start_packing' }],
              [{ text: '🔙 В меню', callback_data: 'menu_back' }]
            ]
          }
        }
      );
    }

    // Сохраняем текущий продукт в сессии
    ctx.session.currentProductKey = Object.keys(consolidated).find(
      key => consolidated[key] === unpurchased
    );

    await showPurchaseProduct(ctx, unpurchased);
  } catch (error) {
    logger.error('Error in startPurchase:', error);
    ctx.reply('❌ Произошла ошибка');
  }
};

// Показать продукт для закупки
const showPurchaseProduct = async (ctx, product) => {
  const message = `🛒 <b>Закупка продукта</b>\n\n` +
    `📦 <b>${product.product_name}</b>\n` +
    `📏 Необходимо: ${product.total_quantity} ${product.unit}\n\n` +
    `Введите закупленное количество:`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `✅ ${product.total_quantity} ${product.unit}`, callback_data: `buyer_purchase_exact:${product.total_quantity}` }
        ],
        [
          { text: '❌ Пропустить', callback_data: 'buyer_skip_product' },
          { text: '🔙 Отмена', callback_data: 'buyer_cancel_purchase' }
        ]
      ]
    }
  };

  await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
  
  // Ждем ввод количества
  ctx.session.awaitingPurchaseQuantity = true;
};

// Обработка ввода количества
const handlePurchaseQuantityInput = async (ctx) => {
  if (!ctx.session.awaitingPurchaseQuantity || !ctx.session.currentProductKey) {
    return false;
  }

  const text = ctx.message.text;
  const quantity = parseFloat(text);

  if (isNaN(quantity) || quantity <= 0) {
    await ctx.reply('❌ Введите корректное количество (положительное число)');
    return true;
  }

  const product = ctx.session.consolidatedProducts[ctx.session.currentProductKey];
  if (!product) {
    await ctx.reply('❌ Ошибка: продукт не найден');
    return true;
  }

  // Отмечаем как закупленный
  product.purchased_quantity = quantity;
  product.is_purchased = true;
  
  delete ctx.session.awaitingPurchaseQuantity;

  await ctx.reply(
    `✅ Закуплено: ${product.product_name} - ${quantity} ${product.unit}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➡️ Следующий продукт', callback_data: 'buyer_next_product' }],
          [{ text: '📋 Показать весь список', callback_data: 'buyer_show_list' }]
        ]
      }
    }
  );

  return true;
};

// Следующий продукт
const nextProduct = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    const consolidated = ctx.session.consolidatedProducts;
    const products = Object.values(consolidated);
    const unpurchased = products.find(p => !p.is_purchased);
    
    if (!unpurchased) {
      return ctx.editMessageText(
        '✅ <b>Все продукты закуплены!</b>\n\n' +
        'Теперь можно приступить к комплектации корзин.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📊 Перейти к комплектации', callback_data: 'buyer_start_packing' }],
              [{ text: '🔙 В меню', callback_data: 'menu_back' }]
            ]
          }
        }
      );
    }

    ctx.session.currentProductKey = Object.keys(consolidated).find(
      key => consolidated[key] === unpurchased
    );

    await showPurchaseProduct(ctx, unpurchased);
  } catch (error) {
    logger.error('Error in nextProduct:', error);
    ctx.reply('❌ Произошла ошибка');
  }
};

// Показать заявки по ресторанам
const showOrdersByRestaurant = async (ctx) => {
  try {
    const orders = await Order.findAll({
      where: { status: 'sent' },
      include: [
        {
          model: Restaurant,
          as: 'restaurant'
        },
        {
          model: OrderItem,
          as: 'orderItems'
        }
      ],
      order: [['restaurant_id', 'ASC'], ['created_at', 'DESC']]
    });

    if (orders.length === 0) {
      return ctx.reply('📋 Нет активных заказов');
    }

    let message = '📦 <b>Заявки по ресторанам</b>\n\n';

    // Группируем по ресторанам
    const byRestaurant = {};
    orders.forEach(order => {
      const restName = order.restaurant.name;
      if (!byRestaurant[restName]) {
        byRestaurant[restName] = [];
      }
      byRestaurant[restName].push(order);
    });

    Object.entries(byRestaurant).forEach(([restName, restOrders]) => {
      message += `🏢 <b>${restName}</b>\n`;
      
      restOrders.forEach(order => {
        message += `\n📋 Заказ #${order.order_number}\n`;
        message += `📅 ${formatInTimezone(order.created_at, 'DD.MM HH:mm')}\n`;
        message += `📦 Позиций: ${order.orderItems.length}\n`;
      });
      
      message += '\n';
    });

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 Начать комплектацию', callback_data: 'buyer_start_packing' }],
          [{ text: '🔙 Назад', callback_data: 'menu_back' }]
        ]
      }
    };

    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error in showOrdersByRestaurant:', error);
    ctx.reply('❌ Произошла ошибка при загрузке заказов');
  }
};

// Начать комплектацию корзин
const startPacking = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    // Получаем все заказы для комплектации
    const orders = await Order.findAll({
      where: { status: 'sent' },
      include: [
        {
          model: Restaurant,
          as: 'restaurant'
        },
        {
          model: OrderItem,
          as: 'orderItems'
        }
      ],
      order: [['created_at', 'ASC']]
    });

    if (orders.length === 0) {
      return ctx.reply('📋 Нет заказов для комплектации');
    }

    // Сохраняем в сессии
    ctx.session.packingOrders = orders.map(o => ({
      id: o.id,
      order_number: o.order_number,
      restaurant_name: o.restaurant.name,
      items: o.orderItems.map(i => ({
        id: i.id,
        product_name: i.product_name,
        quantity: i.quantity,
        unit: i.unit,
        packed_quantity: null
      }))
    }));
    
    ctx.session.currentOrderIndex = 0;

    await showPackingOrder(ctx);
  } catch (error) {
    logger.error('Error in startPacking:', error);
    ctx.reply('❌ Произошла ошибка');
  }
};

// Показать заказ для комплектации
const showPackingOrder = async (ctx) => {
  const order = ctx.session.packingOrders[ctx.session.currentOrderIndex];
  
  if (!order) {
    return ctx.editMessageText(
      '✅ <b>Комплектация завершена!</b>\n\n' +
      'Все заказы укомплектованы.',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 В меню', callback_data: 'menu_back' }]
          ]
        }
      }
    );
  }

  const unpackedItem = order.items.find(i => i.packed_quantity === null);
  
  if (!unpackedItem) {
    // Заказ полностью укомплектован, переходим к следующему
    ctx.session.currentOrderIndex++;
    return showPackingOrder(ctx);
  }

  ctx.session.currentItemId = unpackedItem.id;

  const message = `📊 <b>Комплектация корзины</b>\n\n` +
    `🏢 ${order.restaurant_name}\n` +
    `📋 Заказ #${order.order_number}\n\n` +
    `📦 <b>${unpackedItem.product_name}</b>\n` +
    `📏 Заказано: ${unpackedItem.quantity} ${unpackedItem.unit}\n\n` +
    `Введите фактическое количество:`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `✅ ${unpackedItem.quantity} ${unpackedItem.unit}`, callback_data: `buyer_pack_exact:${unpackedItem.quantity}` }
        ],
        [
          { text: '0️⃣ Нет в наличии', callback_data: 'buyer_pack_zero' },
          { text: '❌ Отмена', callback_data: 'buyer_cancel_packing' }
        ]
      ]
    }
  };

  await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
  
  // Ждем ввод количества
  ctx.session.awaitingPackQuantity = true;
};

// Обработка текстовых команд
const handleTextCommands = async (ctx) => {
  const text = ctx.message.text;

  // Обработка ввода количества при закупке
  if (ctx.session?.awaitingPurchaseQuantity) {
    return handlePurchaseQuantityInput(ctx);
  }

  // Обработка ввода количества при комплектации
  if (ctx.session?.awaitingPackQuantity) {
    return handlePackQuantityInput(ctx);
  }

  switch (text) {
    case '📋 Общий список продуктов':
      return showConsolidatedProducts(ctx);
    case '📦 Заявки по ресторанам':
      return showOrdersByRestaurant(ctx);
    case '🛒 Закупка':
      return showConsolidatedProducts(ctx);
    case '📊 Комплектация корзин':
      return startPacking(ctx);
    case '✅ Завершенные заказы':
      return showCompletedOrders(ctx);
    case '📈 Статистика':
      return showStatistics(ctx);
    default:
      return false;
  }
};

// Обработка ввода количества при комплектации
const handlePackQuantityInput = async (ctx) => {
  const text = ctx.message.text;
  const quantity = parseFloat(text);

  if (isNaN(quantity) || quantity < 0) {
    await ctx.reply('❌ Введите корректное количество (неотрицательное число)');
    return true;
  }

  const order = ctx.session.packingOrders[ctx.session.currentOrderIndex];
  const item = order.items.find(i => i.id === ctx.session.currentItemId);
  
  if (!item) {
    await ctx.reply('❌ Ошибка: позиция не найдена');
    return true;
  }

  // Отмечаем как укомплектованный
  item.packed_quantity = quantity;
  
  delete ctx.session.awaitingPackQuantity;

  await ctx.reply(
    `✅ Укомплектовано: ${item.product_name} - ${quantity} ${item.unit}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➡️ Следующая позиция', callback_data: 'buyer_next_pack_item' }]
        ]
      }
    }
  );

  return true;
};

// Следующая позиция для комплектации
const nextPackItem = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await showPackingOrder(ctx);
  } catch (error) {
    logger.error('Error in nextPackItem:', error);
    ctx.reply('❌ Произошла ошибка');
  }
};

module.exports = {
  showConsolidatedProducts,
  showOrdersByRestaurant,
  startPurchase,
  startPacking,
  handleTextCommands,
  nextProduct,
  nextPackItem,
  handleCallbacks: async (ctx) => {
    const action = ctx.callbackQuery.data;
    
    switch (action) {
      case 'buyer_start_purchase':
        return startPurchase(ctx);
      case 'buyer_next_product':
        return nextProduct(ctx);
      case 'buyer_show_list':
        return showConsolidatedProducts(ctx);
      case 'buyer_start_packing':
        return startPacking(ctx);
      case 'buyer_next_pack_item':
        return nextPackItem(ctx);
      default:
        if (action.startsWith('buyer_purchase_exact:')) {
          const quantity = parseFloat(action.split(':')[1]);
          ctx.message = { text: quantity.toString() };
          return handlePurchaseQuantityInput(ctx);
        }
        if (action.startsWith('buyer_pack_exact:')) {
          const quantity = parseFloat(action.split(':')[1]);
          ctx.message = { text: quantity.toString() };
          return handlePackQuantityInput(ctx);
        }
        if (action === 'buyer_pack_zero') {
          ctx.message = { text: '0' };
          return handlePackQuantityInput(ctx);
        }
    }
  }
};