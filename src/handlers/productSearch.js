const productMatcher = require('../services/ProductMatcher');
const KeyboardHelper = require('../utils/keyboardHelper');
const logger = require('../utils/logger');

// Обработчик начала поиска продукта
const startProductSearch = async (ctx) => {
  ctx.session = ctx.session || {};
  ctx.session.searchMode = 'product';
  
  const categories = await productMatcher.getCategories();
  
  if (categories.length > 0) {
    const keyboard = KeyboardHelper.createCategoryKeyboard(categories);
    await ctx.reply(
      '🔍 Выберите способ поиска продукта:\n\n' +
      '• Выберите категорию из списка ниже\n' +
      '• Или нажмите "Поиск по названию" для ввода текста',
      keyboard
    );
  } else {
    ctx.session.searchMode = 'text';
    await ctx.reply(
      '🔍 Введите название продукта для поиска:\n\n' +
      '💡 Подсказка: можно вводить неточные названия, например "картошка" вместо "картофель"'
    );
  }
};

// Обработчик текстового поиска
const handleTextSearch = async (ctx) => {
  const query = ctx.message.text;
  
  if (!query || query.length < 2) {
    return ctx.reply('⚠️ Введите минимум 2 символа для поиска');
  }

  // Показываем индикатор загрузки
  const loadingMsg = await ctx.reply('🔄 Ищу продукты...');

  try {
    // Поиск с автокомплитом
    const suggestions = await productMatcher.searchWithAutoComplete(query, 8);
    
    if (suggestions.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      return ctx.reply(
        `❌ По запросу "${query}" ничего не найдено.\n\n` +
        'Попробуйте:\n' +
        '• Проверить правописание\n' +
        '• Использовать другие слова\n' +
        '• Выбрать продукт из категорий',
        KeyboardHelper.createCategoryKeyboard(await productMatcher.getCategories())
      );
    }

    // Форматируем текст с результатами
    const messageText = KeyboardHelper.formatProductSuggestions(suggestions, query);
    const keyboard = KeyboardHelper.createProductSelectionKeyboard(suggestions);

    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply(messageText, keyboard);

  } catch (error) {
    logger.error('Error in text search:', error);
    await ctx.deleteMessage(loadingMsg.message_id);
    await ctx.reply('❌ Произошла ошибка при поиске. Попробуйте позже.');
  }
};

// Обработчик выбора категории
const handleCategorySelection = async (ctx) => {
  const { params } = KeyboardHelper.parseCallbackData(ctx.callbackQuery.data);
  const category = params[0];

  await ctx.answerCbQuery();
  
  try {
    const products = await productMatcher.getProductsByCategory(category);
    
    if (products.length === 0) {
      return ctx.editMessageText(
        `❌ В категории "${category}" пока нет продуктов`,
        KeyboardHelper.createCategoryKeyboard(await productMatcher.getCategories())
      );
    }

    // Ограничиваем количество продуктов для отображения
    const displayProducts = products.slice(0, 10);
    const messageText = `📂 Продукты в категории "${category}":\n\n` +
      displayProducts.map((p, i) => 
        `${i + 1}. ${p.product_name} - ${p.last_purchase_price || 'н/д'}₽/${p.unit}`
      ).join('\n') +
      (products.length > 10 ? `\n\n... и еще ${products.length - 10} продуктов` : '');

    const keyboard = KeyboardHelper.createProductSelectionKeyboard(displayProducts);
    
    await ctx.editMessageText(messageText, keyboard);
  } catch (error) {
    logger.error('Error in category selection:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке продуктов');
  }
};

// Обработчик выбора продукта
const handleProductSelection = async (ctx) => {
  const { params } = KeyboardHelper.parseCallbackData(ctx.callbackQuery.data);
  const productIdOrName = params[0];

  await ctx.answerCbQuery();

  try {
    // Получаем полную информацию о продукте
    // Сначала пробуем найти по ID (если это число), затем по имени
    let product;
    if (!isNaN(productIdOrName)) {
      product = await productMatcher.findById(parseInt(productIdOrName));
    } else {
      product = await productMatcher.findExactMatch(productIdOrName);
    }
    
    if (!product) {
      logger.error('Product not found:', { productIdOrName });
      return ctx.reply('❌ Продукт не найден');
    }

    // Обучаем систему на основе выбора пользователя
    if (ctx.session && ctx.session.lastSearchQuery) {
      await productMatcher.learnFromUserChoice(ctx.session.lastSearchQuery, product.product_name);
    }

    // Сохраняем выбранный продукт в сессии
    ctx.session = ctx.session || {};
    ctx.session.selectedProduct = product;

    // Показываем клавиатуру для выбора количества
    const keyboard = KeyboardHelper.createQuantityKeyboard(product.product_name, product.unit);
    
    await ctx.editMessageText(
      `✅ Выбран продукт: ${product.product_name}\n` +
      `📂 Категория: ${product.category || 'Не указана'}\n` +
      `💰 Цена: ${product.last_purchase_price || 'н/д'}₽/${product.unit}\n\n` +
      `Выберите количество:`,
      keyboard
    );
  } catch (error) {
    logger.error('Error in product selection:', error);
    await ctx.reply('❌ Произошла ошибка при выборе продукта');
  }
};

// Обработчик быстрого выбора количества
const handleQuickQuantity = async (ctx) => {
  const { params } = KeyboardHelper.parseCallbackData(ctx.callbackQuery.data);
  const [productName, quantity, unit] = params;

  await ctx.answerCbQuery();

  const product = ctx.session?.selectedProduct;
  if (!product) {
    return ctx.reply('❌ Сессия истекла. Начните поиск заново.');
  }

  // Если работаем в режиме добавления в черновик
  if (ctx.session?.addingProducts && ctx.session?.draftOrderId) {
    try {
      const { DraftOrderItem } = require('../database/models');
      
      // Проверяем, есть ли уже такой продукт
      const existingItem = await DraftOrderItem.findOne({
        where: {
          draft_order_id: ctx.session.draftOrderId,
          matched_product_id: product.id,
          status: ['matched', 'confirmed']
        }
      });
      
      if (existingItem) {
        // Продукт уже есть - спрашиваем что делать
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{
                text: `✅ Да, добавить ${quantity} ${unit}`,
                callback_data: `duplicate_add:${existingItem.id}:${quantity}`
              }],
              [{
                text: `✏️ Заменить на ${quantity} ${unit}`,
                callback_data: `duplicate_replace:${existingItem.id}:${quantity}`
              }],
              [{
                text: '❌ Отмена',
                callback_data: `duplicate_cancel:${existingItem.id}`
              }]
            ]
          }
        };
        
        await ctx.editMessageText(
          `⚠️ <b>Продукт уже есть в заказе!</b>\n\n` +
          `<b>${product.product_name}</b>\n` +
          `Текущее количество: ${existingItem.quantity} ${existingItem.unit}\n` +
          `Вы хотите добавить: ${quantity} ${unit}\n\n` +
          `Что сделать?`,
          { parse_mode: 'HTML', ...keyboard }
        );
      } else {
        // Добавляем продукт как подтвержденный
        const item = await DraftOrderItem.create({
          draft_order_id: ctx.session.draftOrderId,
          product_name: product.product_name,
          original_name: product.product_name,
          quantity: parseFloat(quantity),
          unit: product.unit,
          status: 'confirmed',
          matched_product_id: product.id,
          added_by: ctx.user.id
        });
        
        await ctx.editMessageText(
          `✅ Добавлено: ${product.product_name} - ${quantity} ${unit}`
        );
        
        // Предлагаем продолжить
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '➕ Добавить еще продукты', callback_data: 'draft_add_more' }],
              [{ text: '📋 Посмотреть весь заказ', callback_data: 'draft_view' }],
              [{ text: '✅ Готово', callback_data: 'draft_done' }]
            ]
          }
        };
        
        await ctx.reply('Что делаем дальше?', keyboard);
      }
    } catch (error) {
      logger.error('Error adding product from quick quantity:', error);
      await ctx.reply('❌ Ошибка при добавлении продукта');
    }
  } else {
    const keyboard = KeyboardHelper.createConfirmationKeyboard(productName, quantity, unit);
    
    await ctx.editMessageText(
      `📦 Товар для добавления:\n\n` +
      `• ${productName}\n` +
      `• Количество: ${quantity} ${unit}\n\n` +
      `Подтвердите добавление в заказ:`,
      keyboard
    );
  }
};

// Обработчик ручного ввода количества
const handleManualQuantity = async (ctx) => {
  const { params } = KeyboardHelper.parseCallbackData(ctx.callbackQuery.data);
  const productName = params[0];

  await ctx.answerCbQuery();
  
  // Если работаем в режиме добавления в черновик
  if (ctx.session?.addingProducts && ctx.session?.selectedProduct) {
    const product = ctx.session.selectedProduct;
    ctx.session.pendingProduct = {
      id: product.id,
      name: product.product_name,
      unit: product.unit
    };
    
    await ctx.editMessageText(
      `📝 Введите количество для "${product.product_name}":\n\n` +
      `Единица измерения: ${product.unit}\n\n` +
      `Примеры:\n` +
      `• 5\n` +
      `• 10.5\n` +
      `• 0.750`
    );
  } else {
    ctx.session = ctx.session || {};
    ctx.session.awaitingQuantity = productName;
    
    await ctx.editMessageText(
      `📝 Введите количество для "${productName}":\n\n` +
      `Примеры:\n` +
      `• 5\n` +
      `• 10.5\n` +
      `• 0.750`
    );
  }
};

// Обработчик подтверждения добавления
const handleConfirmation = async (ctx) => {
  const { params } = KeyboardHelper.parseCallbackData(ctx.callbackQuery.data);
  const [productName, quantity, unit] = params;

  await ctx.answerCbQuery('✅ Продукт добавлен в заказ');

  // Если работаем с черновиком заказа
  if (ctx.session?.addingProducts && ctx.session?.draftOrderId) {
    try {
      const draftOrderService = require('../services/DraftOrderService');
      const results = await draftOrderService.parseAndAddProducts(
        ctx.session.draftOrderId,
        `${productName} ${quantity} ${unit}`,
        ctx.user.id
      );
      
      await ctx.editMessageText(
        `✅ Добавлено в заказ:\n${productName} - ${quantity} ${unit}`
      );
      
      // Предлагаем продолжить с черновиком
      setTimeout(() => {
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '➕ Добавить еще продукты', callback_data: 'draft_add_more' }],
              [{ text: '📋 Посмотреть весь заказ', callback_data: 'draft_view' }],
              [{ text: '✅ Готово', callback_data: 'draft_done' }]
            ]
          }
        };
        ctx.reply('Что делаем дальше?', keyboard);
      }, 1000);
    } catch (error) {
      logger.error('Error adding to draft order:', error);
      await ctx.reply('❌ Ошибка при добавлении в заказ');
    }
  } else {
    // Обычный режим (не черновик)
    ctx.session = ctx.session || {};
    ctx.session.currentOrder = ctx.session.currentOrder || [];
    ctx.session.currentOrder.push({
      product_name: productName,
      quantity: parseFloat(quantity),
      unit: unit,
      added_at: new Date()
    });

    await ctx.editMessageText(
      `✅ Добавлено в заказ:\n${productName} - ${quantity} ${unit}\n\n` +
      `Всего позиций в заказе: ${ctx.session.currentOrder.length}`
    );

    // Предлагаем продолжить
    setTimeout(() => {
      ctx.reply(
        'Что делаем дальше?',
        KeyboardHelper.createProductActionsKeyboard(productName)
      );
    }, 1000);
  }
};

// Обработчик поиска по названию (из меню категорий)
const handleSearchByName = async (ctx) => {
  await ctx.answerCbQuery();
  
  ctx.session = ctx.session || {};
  ctx.session.searchMode = 'text';
  
  await ctx.editMessageText(
    '🔍 Введите название продукта для поиска:\n\n' +
    '💡 Примеры:\n' +
    '• картошка\n' +
    '• говяд\n' +
    '• молоко 3.2'
  );
};

// Обработчик отмены
const handleCancel = async (ctx) => {
  await ctx.answerCbQuery();
  
  ctx.session = ctx.session || {};
  ctx.session.searchMode = null;
  ctx.session.selectedProduct = null;
  ctx.session.awaitingQuantity = null;
  
  await ctx.editMessageText('❌ Операция отменена');
};

// Обработчик добавления в заказ
const handleAddToOrder = async (ctx) => {
  const { params } = KeyboardHelper.parseCallbackData(ctx.callbackQuery.data);
  const productId = params[0];
  
  await ctx.answerCbQuery();
  
  // Если добавляем в черновик заказа
  if (ctx.session?.addingProducts && ctx.session?.draftOrderId) {
    try {
      // Находим продукт по ID
      const product = await productMatcher.findById(productId);
      if (!product) {
        return ctx.reply('❌ Продукт не найден');
      }
      
      // Запрашиваем количество
      ctx.session.pendingProduct = {
        id: product.id,
        name: product.product_name,
        unit: product.unit
      };
      
      await ctx.reply(
        `📦 <b>${product.product_name}</b>\n\n` +
        `Введите количество (${product.unit}):\n\n` +
        '<i>Например: 10 или 5.5</i>',
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      logger.error('Error adding to draft order:', error);
      await ctx.reply('❌ Ошибка при добавлении в заказ');
    }
  } else {
    // Переходим в сцену добавления продукта для ввода количества
    ctx.scene.enter('add_product');
  }
};

// Обработчик информации о продукте
const handleProductInfo = async (ctx) => {
  const { params } = KeyboardHelper.parseCallbackData(ctx.callbackQuery.data);
  const productName = params[0];
  
  await ctx.answerCbQuery();
  
  try {
    const product = await productMatcher.findExactMatch(productName);
    
    if (!product) {
      return ctx.reply('❌ Продукт не найден');
    }
    
    let info = `📦 <b>${product.product_name}</b>\n\n`;
    info += `📂 Категория: ${product.category || 'Не указана'}\n`;
    info += `📏 Единица: ${product.unit}\n`;
    info += `💰 Последняя цена: ${product.last_purchase_price ? product.last_purchase_price + ' ₽' : 'нет данных'}\n`;
    
    // Получаем синонимы
    const synonyms = await productMatcher.getSynonymsForProduct(product.product_name);
    if (synonyms && synonyms.length > 0) {
      info += `\n🏷 Также известен как:\n`;
      synonyms.forEach(syn => {
        info += `• ${syn.synonym}\n`;
      });
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Добавить в заказ', callback_data: `add_to_order:${productName}` }],
          [{ text: '❌ Закрыть', callback_data: 'close_info' }]
        ]
      }
    };
    
    await ctx.reply(info, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error showing product info:', error);
    await ctx.reply('❌ Ошибка при загрузке информации');
  }
};

// Обработчик поиска похожих
const handleFindSimilar = async (ctx) => {
  const { params } = KeyboardHelper.parseCallbackData(ctx.callbackQuery.data);
  const productName = params[0];
  
  await ctx.answerCbQuery();
  
  try {
    const product = await productMatcher.findExactMatch(productName);
    
    if (!product) {
      return ctx.reply('❌ Продукт не найден');
    }
    
    // Ищем продукты из той же категории
    const similarProducts = await productMatcher.getProductsByCategory(product.category);
    const filtered = similarProducts
      .filter(p => p.product_name !== product.product_name)
      .slice(0, 8);
    
    if (filtered.length === 0) {
      return ctx.reply(`❌ Похожие продукты не найдены в категории "${product.category}"`);
    }
    
    const messageText = `🔄 Похожие продукты в категории "${product.category}":\n\n` +
      filtered.map((p, i) => 
        `${i + 1}. ${p.product_name} - ${p.last_purchase_price || 'н/д'}₽/${p.unit}`
      ).join('\n');
    
    const keyboard = KeyboardHelper.createProductSelectionKeyboard(filtered);
    
    await ctx.reply(messageText, keyboard);
  } catch (error) {
    logger.error('Error finding similar products:', error);
    await ctx.reply('❌ Ошибка при поиске похожих продуктов');
  }
};

// Обработчик закрытия
const handleCloseActions = async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
};

module.exports = {
  startProductSearch,
  handleTextSearch,
  handleCategorySelection,
  handleProductSelection,
  handleQuickQuantity,
  handleManualQuantity,
  handleConfirmation,
  handleSearchByName,
  handleCancel,
  handleAddToOrder,
  handleProductInfo,
  handleFindSimilar,
  handleCloseActions
};