const { Scenes, Markup } = require('telegraf');
const productMatcher = require('../services/ProductMatcher');
const KeyboardHelper = require('../utils/keyboardHelper');
const logger = require('../utils/logger');

// Сцена добавления продукта в заказ
const addProductScene = new Scenes.BaseScene('add_product');

// Вход в сцену
addProductScene.enter(async (ctx) => {
  ctx.scene.session.productSearch = {};
  
  await ctx.reply(
    '🔍 Введите название продукта для поиска:\n\n' +
    '💡 Примеры:\n' +
    '• картофель\n' +
    '• молоко\n' +
    '• говядина\n\n' +
    'Для отмены используйте /cancel',
    Markup.keyboard([
      ['❌ Отменить']
    ]).resize()
  );
});

// Обработка текста - поиск продукта
addProductScene.on('text', async (ctx) => {
  const text = ctx.message.text;

  // Обработка отмены
  if (text === '❌ Отменить' || text === '/cancel') {
    await ctx.reply('❌ Добавление продукта отменено', Markup.removeKeyboard());
    return ctx.scene.leave();
  }

  // Если уже выбран продукт, ожидаем количество
  if (ctx.scene.session.selectedProduct) {
    return handleQuantityInput(ctx, text);
  }

  // Поиск продукта
  await searchProduct(ctx, text);
});

// Обработка callback - выбор продукта
addProductScene.on('callback_query', async (ctx) => {
  const { data } = ctx.callbackQuery;
  await ctx.answerCbQuery();

  if (data === 'cancel_selection') {
    await ctx.editMessageText('❌ Добавление продукта отменено');
    return ctx.scene.leave();
  }

  if (data.startsWith('select_product:')) {
    const productName = data.split(':')[1];
    await selectProduct(ctx, productName);
  }

  if (data.startsWith('quick_qty:')) {
    const [, productName, quantity, unit] = data.split(':');
    await confirmProduct(ctx, productName, quantity, unit);
  }

  if (data === 'manual_quantity') {
    await ctx.editMessageText(
      `📝 Введите количество для "${ctx.scene.session.selectedProduct.product_name}":\n\n` +
      `Единица измерения: ${ctx.scene.session.selectedProduct.unit}\n\n` +
      'Примеры: 5, 10.5, 0.750'
    );
  }

  if (data.startsWith('confirm_add:')) {
    await addProductToOrder(ctx);
  }
});

// Функция поиска продукта
async function searchProduct(ctx, query) {
  const loadingMsg = await ctx.reply('🔄 Ищу продукты...');

  try {
    // Используем умный поиск
    const suggestions = await productMatcher.searchWithAutoComplete(query, 8);

    await ctx.deleteMessage(loadingMsg.message_id);

    if (suggestions.length === 0) {
      await ctx.reply(
        `❌ По запросу "${query}" ничего не найдено.\n\n` +
        'Попробуйте:\n' +
        '• Проверить правописание\n' +
        '• Использовать другие слова\n' +
        '• Ввести более точное название'
      );
      return;
    }

    // Сохраняем результаты поиска
    ctx.scene.session.searchResults = suggestions;
    ctx.scene.session.lastQuery = query;

    // Показываем результаты
    const messageText = KeyboardHelper.formatProductSuggestions(suggestions, query);
    const keyboard = KeyboardHelper.createProductSelectionKeyboard(suggestions);

    await ctx.reply(messageText, keyboard);

    // Обучаем систему
    await productMatcher.learnFromUserChoice(query, suggestions[0].text);

  } catch (error) {
    logger.error('Error in product search:', error);
    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply('❌ Произошла ошибка при поиске. Попробуйте еще раз.');
  }
}

// Выбор продукта
async function selectProduct(ctx, productName) {
  try {
    // Получаем полную информацию о продукте
    const product = await productMatcher.findExactMatch(productName);
    
    if (!product) {
      await ctx.editMessageText('❌ Продукт не найден');
      return;
    }

    // Сохраняем выбранный продукт
    ctx.scene.session.selectedProduct = product;

    // Показываем клавиатуру для выбора количества
    const keyboard = KeyboardHelper.createQuantityKeyboard(
      product.product_name, 
      product.unit
    );
    
    await ctx.editMessageText(
      `✅ Выбран продукт:\n\n` +
      `📦 ${product.product_name}\n` +
      `📂 Категория: ${product.category || 'Не указана'}\n` +
      `📏 Единица: ${product.unit}\n` +
      `💰 Цена: ${product.last_purchase_price || 'н/д'} ₽/${product.unit}\n\n` +
      `Выберите или введите количество:`,
      keyboard
    );

  } catch (error) {
    logger.error('Error selecting product:', error);
    await ctx.reply('❌ Ошибка при выборе продукта');
  }
}

// Обработка ввода количества
async function handleQuantityInput(ctx, text) {
  const quantity = parseFloat(text.replace(',', '.'));
  
  if (isNaN(quantity) || quantity <= 0) {
    await ctx.reply(
      '⚠️ Неверное количество. Введите число больше 0.\n' +
      'Например: 5 или 10.5'
    );
    return;
  }

  const product = ctx.scene.session.selectedProduct;
  await confirmProduct(ctx, product.product_name, quantity, product.unit);
}

// Подтверждение добавления
async function confirmProduct(ctx, productName, quantity, unit) {
  const product = ctx.scene.session.selectedProduct || 
    await productMatcher.findExactMatch(productName);

  if (!product) {
    await ctx.reply('❌ Ошибка: продукт не найден');
    return ctx.scene.leave();
  }

  const totalPrice = product.last_purchase_price ? 
    (parseFloat(quantity) * product.last_purchase_price).toFixed(2) : 'н/д';

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Добавить в заказ', `confirm_add:${quantity}`)],
    [Markup.button.callback('✏️ Изменить количество', 'manual_quantity')],
    [Markup.button.callback('❌ Отмена', 'cancel_selection')]
  ]);

  const message = ctx.callbackQuery ? ctx.editMessageText : ctx.reply;
  await message.call(ctx,
    `📦 Подтверждение добавления:\n\n` +
    `Продукт: ${productName}\n` +
    `Количество: ${quantity} ${unit}\n` +
    `Цена за ед.: ${product.last_purchase_price || 'н/д'} ₽\n` +
    `Сумма: ${totalPrice} ₽\n\n` +
    `Добавить в заказ?`,
    keyboard
  );

  ctx.scene.session.pendingItem = {
    product_name: productName,
    quantity: parseFloat(quantity),
    unit: unit,
    price: product.last_purchase_price,
    total: totalPrice === 'н/д' ? null : parseFloat(totalPrice),
    category: product.category
  };
}

// Добавление продукта в заказ
async function addProductToOrder(ctx) {
  const item = ctx.scene.session.pendingItem;
  
  if (!item) {
    await ctx.reply('❌ Ошибка: данные продукта потеряны');
    return ctx.scene.leave();
  }

  // Инициализируем корзину если её нет
  ctx.session.currentOrder = ctx.session.currentOrder || {
    items: [],
    restaurant_id: ctx.user.restaurant_id,
    created_at: new Date(),
    status: 'draft'
  };

  // Проверяем, есть ли уже такой продукт
  const existingIndex = ctx.session.currentOrder.items.findIndex(
    i => i.product_name === item.product_name
  );

  if (existingIndex >= 0) {
    // Увеличиваем количество
    ctx.session.currentOrder.items[existingIndex].quantity += item.quantity;
    ctx.session.currentOrder.items[existingIndex].total = 
      ctx.session.currentOrder.items[existingIndex].quantity * 
      (item.price || 0);
  } else {
    // Добавляем новый продукт
    ctx.session.currentOrder.items.push(item);
  }

  // Подсчитываем общую сумму
  const totalAmount = ctx.session.currentOrder.items.reduce(
    (sum, i) => sum + (i.total || 0), 0
  );

  await ctx.editMessageText(
    `✅ Продукт добавлен в заказ!\n\n` +
    `${item.product_name} - ${item.quantity} ${item.unit}\n` +
    `Сумма: ${item.total || 'н/д'} ₽\n\n` +
    `📋 В заказе ${ctx.session.currentOrder.items.length} позиций\n` +
    `💰 Общая сумма: ${totalAmount.toFixed(2)} ₽`
  );

  // Показываем меню действий
  setTimeout(async () => {
    const keyboard = Markup.keyboard([
      ['➕ Добавить еще продукт'],
      ['📋 Посмотреть заказ'],
      ['✅ Отправить заказ'],
      ['🏠 Главное меню']
    ]).resize();

    await ctx.reply(
      'Что делаем дальше?',
      keyboard
    );
  }, 1000);

  return ctx.scene.leave();
}

// Выход из сцены
addProductScene.leave((ctx) => {
  // Очищаем данные сцены
  ctx.scene.session = {};
});

module.exports = addProductScene;