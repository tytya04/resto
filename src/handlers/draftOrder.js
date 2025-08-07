const logger = require('../utils/logger');
const { DraftOrder, DraftOrderItem, NomenclatureCache, RestaurantBranch } = require('../database/models');
const draftOrderService = require('../services/DraftOrderService');
const productMatcher = require('../services/ProductMatcher');
const { Markup } = require('telegraf');
const moment = require('moment');
const { formatInTimezone } = require('../utils/timezone');
const { hasMultipleBranches, showBranchSelection } = require('./restaurantBranch');

/**
 * Безопасный ответ на callback query
 */
const safeAnswerCbQuery = async (ctx, text = null) => {
  try {
    await ctx.answerCbQuery(text);
  } catch (error) {
    // Игнорируем ошибку устаревшего callback query
    logger.debug('Callback query expired, continuing with operation');
  }
};

/**
 * Начало добавления продуктов в заказ
 */
const startAddingProducts = async (ctx) => {
  try {
    // Отвечаем на callback если это кнопка
    if (ctx.callbackQuery) {
      await safeAnswerCbQuery(ctx);
    }

    const user = ctx.user || ctx.session?.user;
    if (!user) {
      return ctx.reply('❌ Ошибка аутентификации');
    }

    // Логируем для отладки
    logger.info('startAddingProducts called', {
      callbackData: ctx.callbackQuery?.data,
      messageText: ctx.message?.text,
      selectedBranchId: ctx.session?.selectedBranchId
    });

    // Извлекаем ID черновика из callback data если есть
    let draftId = null;
    if (ctx.callbackQuery?.data?.includes(':')) {
      // Проверяем что это не выбор филиала
      if (!ctx.callbackQuery.data.startsWith('select_branch_for_order:') && 
          !ctx.callbackQuery.data.startsWith('draft_add_more:')) {
        draftId = ctx.callbackQuery.data.split(':')[1];
      } else if (ctx.callbackQuery.data.startsWith('draft_add_more:')) {
        // Для draft_add_more извлекаем ID черновика
        draftId = ctx.callbackQuery.data.split(':')[1];
      }
    }
    
    let draft;
    if (draftId) {
      // Если есть ID - используем конкретный черновик
      draft = await draftOrderService.getDraftById(draftId);
      if (!draft) {
        return ctx.reply('❌ Черновик не найден');
      }
    } else {
      // При создании нового заказа ВСЕГДА показываем выбор филиала
      const restaurantId = user.restaurant_id;
      const branches = await RestaurantBranch.findAll({
        where: { 
          restaurantId: restaurantId,
          isActive: true
        },
        order: [['isMain', 'DESC'], ['address', 'ASC']]
      });
      
      if (branches.length === 0) {
        return ctx.reply('❌ У вашего ресторана нет активных филиалов');
      }
      
      // Если только один филиал - сразу создаем для него заказ
      if (branches.length === 1) {
        draft = await draftOrderService.getOrCreateDraftOrder(restaurantId, user.id, branches[0].id);
      } else {
        // Показываем список филиалов с информацией о черновиках
        const keyboard = {
          inline_keyboard: []
        };
        
        for (const branch of branches) {
          // Проверяем есть ли черновик для этого филиала
          const existingDraft = await DraftOrder.findOne({
            where: {
              restaurant_id: restaurantId,
              branch_id: branch.id,
              status: 'draft'
            },
            include: [{
              model: DraftOrderItem,
              as: 'draftOrderItems'
            }]
          });
          
          let buttonText = `📍 ${branch.name || branch.address}`;
          if (branch.isMain) buttonText += ' (Главный)';
          if (existingDraft && existingDraft.draftOrderItems.length > 0) {
            buttonText += ` 📦 ${existingDraft.draftOrderItems.length}`;
          }
          
          keyboard.inline_keyboard.push([{
            text: buttonText,
            callback_data: `create_order_branch:${branch.id}`
          }]);
        }
        
        keyboard.inline_keyboard.push([{
          text: '❌ Отмена',
          callback_data: 'cancel_branch_selection'
        }]);
        
        await ctx.reply(
          '🏢 <b>Выберите филиал для заказа:</b>\n\n' +
          '📦 - количество товаров в черновике',
          { 
            reply_markup: keyboard,
            parse_mode: 'HTML'
          }
        );
        return;
      }
    }
    
    const scheduledTime = formatInTimezone(draft.scheduled_for);
    
    ctx.session = ctx.session || {};
    ctx.session.addingProducts = true;
    ctx.session.draftOrderId = draft.id;

    let message = '🛒 <b>Добавление продуктов в заказ</b>\n\n';
    message += `📅 Заказ будет отправлен: ${scheduledTime}\n\n`;
    
    if (draft.draftOrderItems && draft.draftOrderItems.length > 0) {
      message += `📦 В заказе уже есть ${draft.draftOrderItems.length} позиций\n\n`;
    }
    
    message += '📝 Отправьте список продуктов в любом формате:\n\n';
    message += '<b>Примеры:</b>\n';
    message += '<code>Картофель 50 кг</code>\n';
    message += '<code>Морковь - 30 - кг</code>\n';
    message += '<code>Лук 20 кг\nПомидоры 15 кг</code>\n\n';
    message += '💡 <i>Можете отправлять по одному продукту или списком</i>\n';
    message += '💡 <i>Все продукты будут добавлены в один заказ</i>\n\n';
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Посмотреть текущий заказ', callback_data: 'draft_view' }],
          [{ text: '🔍 Поиск продукта', callback_data: 'draft_search' }],
          [{ text: '❌ Отмена', callback_data: 'draft_cancel' }]
        ]
      }
    };
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error starting product addition:', error);
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
  }
};

/**
 * Обработка текста с продуктами
 */
const handleProductText = async (ctx) => {
  // Проверяем, вводим ли количество для продукта из каталога
  if (ctx.session?.pendingProduct) {
    const text = ctx.message.text;
    const quantity = parseFloat(text.replace(',', '.'));
    
    if (isNaN(quantity) || quantity <= 0) {
      await ctx.reply(
        '⚠️ Неверное количество. Введите число больше 0.\n' +
        'Например: 5 или 10.5'
      );
      return true;
    }
    
    try {
      const { DraftOrderItem, NomenclatureCache } = require('../database/models');
      const product = ctx.session.pendingProduct;
      
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
                text: `✅ Да, добавить ${quantity} ${product.unit}`,
                callback_data: `duplicate_add:${existingItem.id}:${quantity}`
              }],
              [{
                text: `✏️ Заменить на ${quantity} ${product.unit}`,
                callback_data: `duplicate_replace:${existingItem.id}:${quantity}`
              }],
              [{
                text: '❌ Отмена',
                callback_data: `duplicate_cancel:${existingItem.id}`
              }]
            ]
          }
        };
        
        delete ctx.session.pendingProduct;
        
        await ctx.reply(
          `⚠️ <b>Продукт уже есть в заказе!</b>\n\n` +
          `<b>${product.name}</b>\n` +
          `Текущее количество: ${existingItem.quantity} ${existingItem.unit}\n` +
          `Вы хотите добавить: ${quantity} ${product.unit}\n\n` +
          `Что сделать?`,
          { parse_mode: 'HTML', ...keyboard }
        );
      } else {
        // Добавляем продукт как подтвержденный
        const item = await DraftOrderItem.create({
          draft_order_id: ctx.session.draftOrderId,
          product_name: product.name,
          original_name: product.name,
          quantity: quantity,
          unit: product.unit,
          status: 'confirmed',
          matched_product_id: product.id,
          added_by: ctx.user.id
        });
        
        delete ctx.session.pendingProduct;
        
        await ctx.reply(
          `✅ Добавлено: ${product.name} - ${quantity} ${product.unit}`
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
      logger.error('Error adding product from catalog:', error);
      await ctx.reply('❌ Ошибка при добавлении продукта');
    }
    
    return true;
  }
  
  // Проверяем, редактируем ли количество
  if (ctx.session?.editingItemQuantity && ctx.session?.editingItemId) {
    const text = ctx.message.text;
    
    if (text === '/cancel') {
      delete ctx.session.editingItemQuantity;
      delete ctx.session.editingItemId;
      await ctx.reply('❌ Редактирование отменено');
      return true; // Важно: возвращаем true
    }
    
    const quantity = parseFloat(text.replace(',', '.'));
    
    if (isNaN(quantity) || quantity <= 0) {
      await ctx.reply(
        '⚠️ Неверное количество. Введите число больше 0.\n' +
        'Например: 5 или 10.5'
      );
      return true; // Важно: возвращаем true
    }
    
    try {
      await draftOrderService.updateItemQuantity(
        ctx.session.editingItemId,
        quantity,
        ctx.user.id
      );
      
      delete ctx.session.editingItemQuantity;
      delete ctx.session.editingItemId;
      
      await ctx.reply('✅ Количество успешно изменено!');
      
      // Получаем обновленный черновик и показываем его
      try {
        const draft = await draftOrderService.getCurrentDraft(
          ctx.user.id,
          ctx.session.draftOrderId
        );
        
        if (!draft.draftOrderItems || draft.draftOrderItems.length === 0) {
          await ctx.reply('📋 Заказ пуст');
        } else {
          let message = '📋 <b>Текущий заказ:</b>\n';
          message += `📅 Отправка: ${formatInTimezone(draft.scheduled_for)}\n\n`;
          
          const confirmed = draft.draftOrderItems.filter(i => i.status === 'matched' || i.status === 'confirmed');
          const unmatched = draft.draftOrderItems.filter(i => i.status === 'unmatched');
          
          if (confirmed.length > 0) {
            message += '✅ <b>Подтвержденные позиции:</b>\n';
            confirmed.forEach((item, index) => {
              message += `${index + 1}. ${item.product_name} - ${item.quantity} ${item.unit}\n`;
            });
            message += '\n';
          }
          
          if (unmatched.length > 0) {
            message += '❓ <b>Требуют уточнения:</b>\n';
            unmatched.forEach((item, index) => {
              message += `${index + 1}. ${item.original_name} - ${item.quantity} ${item.unit}\n`;
            });
          }
          
          message += `\n📦 Всего позиций: ${draft.draftOrderItems.length}`;
          
          const keyboard = {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✏️ Редактировать', callback_data: 'draft_edit' }],
                [{ text: '➕ Добавить продукты', callback_data: 'draft_add_more' }],
                [{ text: '🔙 Назад', callback_data: 'menu_main' }]
              ]
            }
          };
          
          await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
        }
      } catch (viewError) {
        logger.error('Error showing updated draft:', viewError);
        // Не показываем ошибку пользователю, так как изменение уже сохранено
      }
      
      return true; // Важно: возвращаем true
    } catch (error) {
      logger.error('Error updating item quantity:', error);
      await ctx.reply('❌ Ошибка при изменении количества');
      return true; // Важно: возвращаем true
    }
  }
  
  if (!ctx.session?.addingProducts || !ctx.session?.draftOrderId) {
    return false;
  }

  try {
    const text = ctx.message.text;
    
    // Парсим и добавляем продукты
    logger.info('Calling parseAndAddProducts with text:', { text, draftOrderId: ctx.session.draftOrderId });
    
    const results = await draftOrderService.parseAndAddProducts(
      ctx.session.draftOrderId,
      text,
      ctx.user.id
    );
    
    logger.info('parseAndAddProducts results:', {
      matched: results.matched.length,
      unmatched: results.unmatched.length,
      duplicates: results.duplicates ? results.duplicates.length : 0,
      needsUnitClarification: results.needsUnitClarification ? results.needsUnitClarification.length : 0,
      duplicatesDetails: results.duplicates
    });

    let message = '';
    let hasAnyResults = false;
    
    // Показываем результаты распознавания
    if (results.matched.length > 0) {
      message += '✅ <b>Распознано и добавлено:</b>\n';
      results.matched.forEach(({ item, matchedProduct }) => {
        message += `• ${matchedProduct.product_name} - ${item.quantity} ${item.unit}\n`;
      });
      message += '\n';
      hasAnyResults = true;
    }
    
    // Обрабатываем дубликаты
    if (results.duplicates && results.duplicates.length > 0) {
      for (const dup of results.duplicates) {
        // Если нужно выбрать единицу измерения
        if (dup.needsUnit && dup.possibleUnits) {
          const keyboard = {
            reply_markup: {
              inline_keyboard: dup.possibleUnits.map(unit => [{
                text: `${unit}`,
                callback_data: `unit_duplicate:${dup.existing.id}:${dup.newQuantity}:${unit}`
              }])
            }
          };
          
          keyboard.reply_markup.inline_keyboard.push([{
            text: '❌ Отмена',
            callback_data: `duplicate_cancel:${dup.existing.id}`
          }]);
          
          await ctx.reply(
            `⚠️ <b>Продукт уже есть в заказе!</b>\n\n` +
            `<b>${dup.product.product_name}</b>\n` +
            `Текущее количество: ${dup.existing.quantity} ${dup.existing.unit}\n` +
            `Вы хотите добавить: ${dup.newQuantity} ?\n\n` +
            `Выберите единицу измерения:`,
            { parse_mode: 'HTML', ...keyboard }
          );
        } else {
          const keyboard = {
            reply_markup: {
              inline_keyboard: [
                [{
                  text: `✅ Да, добавить ${dup.newQuantity} ${dup.existing.unit}`,
                  callback_data: `duplicate_add:${dup.existing.id}:${dup.newQuantity}`
                }],
                [{
                  text: `✏️ Заменить на ${dup.newQuantity} ${dup.existing.unit}`,
                  callback_data: `duplicate_replace:${dup.existing.id}:${dup.newQuantity}`
                }],
                [{
                  text: '❌ Отмена',
                  callback_data: `duplicate_cancel:${dup.existing.id}`
                }]
              ]
            }
          };
          
          await ctx.reply(
            `⚠️ <b>Продукт уже есть в заказе!</b>\n\n` +
            `<b>${dup.product.product_name}</b>\n` +
            `Текущее количество: ${dup.existing.quantity} ${dup.existing.unit}\n` +
            `Вы хотите добавить: ${dup.newQuantity} ${dup.existing.unit}\n\n` +
            `Что сделать?`,
            { parse_mode: 'HTML', ...keyboard }
          );
        }
      }
    }
    
    // Обрабатываем продукты, требующие уточнения единицы измерения
    if (results.needsUnitClarification.length > 0) {
      for (const { line, parsed } of results.needsUnitClarification) {
        // Создаем короткий идентификатор и сохраняем данные в сессии
        const tempId = Date.now().toString(36);
        ctx.session.unitClarification = ctx.session.unitClarification || {};
        ctx.session.unitClarification[tempId] = {
          name: parsed.name,
          matchedProductId: parsed.matchedProductId,
          quantity: parsed.quantity
        };
        
        const keyboard = {
          reply_markup: {
            inline_keyboard: parsed.possibleUnits.map(unit => [{
              text: `${unit}`,
              callback_data: `unit_clarify:${tempId}:${unit}`
            }])
          }
        };
        
        await ctx.reply(
          `❓ Уточните единицу измерения для:\n\n` +
          `<b>${parsed.name}</b> - ${parsed.quantity} ?\n\n` +
          `Выберите единицу измерения:`,
          { parse_mode: 'HTML', ...keyboard }
        );
      }
    }

    // Показываем нераспознанные с предложениями
    if (results.unmatched.length > 0) {
      message += '❓ <b>Требуется уточнение:</b>\n';
      message += '<i>Эти продукты не найдены в каталоге. Выберите существующий продукт из списка или удалите позицию.</i>\n';
      
      for (const { item, suggestions, line, parsed } of results.unmatched) {
        // Если item не создан (например, при unit clarification с вариантами)
        if (!item) {
          message += `\n"${parsed?.name || line}" - ${parsed?.quantity || ''} ${parsed?.unit || ''}\n`;
        } else {
          message += `\n"${item.original_name}" - ${item.quantity} ${item.unit}\n`;
        }
        
        if (suggestions.length > 0) {
          // Если item не создан, используем временный подход через сессию
          if (!item) {
            // Создаем временный ID для сессии
            const tempId = Date.now().toString(36) + Math.random().toString(36);
            ctx.session.tempProducts = ctx.session.tempProducts || {};
            ctx.session.tempProducts[tempId] = {
              name: parsed.name,
              quantity: parsed.quantity,
              unit: parsed.unit || '',
              draftOrderId: ctx.session.draftOrderId
            };
            
            // Логируем suggestions для отладки
            logger.info('Creating keyboard for suggestions:', {
              suggestionsCount: suggestions.length,
              allSuggestions: suggestions.map(s => ({ id: s.id, name: s.product_name, unit: s.unit })),
              tempId
            });
            
            const keyboard = {
              reply_markup: {
                inline_keyboard: suggestions.slice(0, 10).map(suggestion => {
                  // Проверяем данные
                  if (!suggestion || !suggestion.product_name) {
                    logger.error('Invalid suggestion:', suggestion);
                    return null;
                  }
                  // Особая обработка для дубликатов
                  const text = suggestion.isDuplicate 
                    ? `➕ Добавить к ${suggestion.product_name} (${suggestion.unit})`
                    : `✓ ${suggestion.product_name} (${suggestion.unit})`;
                  
                  return [{
                    text: text,
                    callback_data: `temp_match:${tempId}:${suggestion.id}`
                  }];
                }).filter(Boolean)
              }
            };
            
            logger.info('Created keyboard buttons:', {
              buttonsCount: keyboard.reply_markup.inline_keyboard.length,
              buttons: keyboard.reply_markup.inline_keyboard.map(row => row[0].text)
            });
            
            await ctx.reply(
              `❓ <b>Продукт "${parsed.name}" не найден в каталоге</b>\n\n` +
              `⚠️ <i>Новые продукты может добавлять только менеджер.</i>\n\n` +
              `Выберите подходящий вариант из существующих:`,
              { 
                parse_mode: 'HTML',
                ...keyboard 
              }
            );
          } else {
            // Обычная обработка когда item создан
            const keyboard = {
              reply_markup: {
                inline_keyboard: suggestions.slice(0, 10).map(suggestion => [
                  {
                    text: `✓ ${suggestion.product_name} (${suggestion.unit})`,
                    callback_data: `draft_match:${item.id}:${suggestion.id}`
                  }
                ])
              }
            };
            
            keyboard.reply_markup.inline_keyboard.push([
              { text: '🔍 Искать другой продукт', callback_data: `draft_search_for:${item.id}` },
              { text: '❌ Удалить позицию', callback_data: `draft_remove:${item.id}` }
            ]);
            
            await ctx.reply(
              `❓ <b>Продукт "${item.original_name}" не найден в каталоге</b>\n\n` +
              `⚠️ <i>Новые продукты может добавлять только менеджер.</i>\n\n` +
              `Выберите подходящий вариант из существующих:`,
              { 
                parse_mode: 'HTML',
                ...keyboard 
              }
            );
          }
        } else {
          const keyboard = {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔍 Поиск в каталоге', callback_data: `draft_search_for:${item.id}` }],
                [{ text: '❌ Удалить позицию', callback_data: `draft_remove:${item.id}` }]
              ]
            }
          };
          
          await ctx.reply(
            `❌ <b>Продукт "${item.original_name}" не найден</b>\n\n` +
            `⚠️ <i>В каталоге нет похожих продуктов. Новые продукты может добавлять только менеджер.</i>\n\n` +
            `Вы можете поискать другой продукт или удалить эту позицию:`,
            { 
              parse_mode: 'HTML',
              ...keyboard 
            }
          );
        }
      }
    }

    if (results.errors.length > 0) {
      message += '\n❌ <b>Не удалось распознать:</b>\n';
      results.errors.forEach(({ line, error }) => {
        message += `• "${line}" - ${error}\n`;
      });
    }

    // Всегда показываем кнопки продолжения если хоть что-то было обработано
    const hasAnyProcessedItems = results.matched.length > 0 || 
                                results.unmatched.length > 0 ||
                                results.duplicates.length > 0;
    
    const needsClarification = results.needsUnitClarification.length > 0;
    
    // Показываем кнопки если что-то было обработано
    if (hasAnyProcessedItems || hasAnyResults) {
      const continueKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ Добавить еще продукты', callback_data: 'draft_add_more' }],
            [{ text: '🔍 Поиск в каталоге', callback_data: 'draft_search' }],
            [{ text: '📋 Посмотреть текущий заказ', callback_data: 'draft_view' }],
            [{ text: '❌ Отмена', callback_data: 'draft_cancel' }]
          ]
        }
      };

      if (message || hasAnyResults) {
        await ctx.reply(message || '✅ Продукты добавлены в заказ', { 
          parse_mode: 'HTML',
          ...continueKeyboard 
        });
      }
    }

    return true;
  } catch (error) {
    logger.error('Error handling product text:', {
      error: error.message,
      stack: error.stack,
      text: ctx.message.text,
      userId: ctx.user?.id,
      draftOrderId: ctx.session?.draftOrderId
    });
    
    // Проверяем тип ошибки и даем более информативное сообщение
    let errorMessage = '❌ Произошла ошибка при обработке продуктов';
    
    if (error.message.includes('database')) {
      errorMessage = '⚠️ База данных временно недоступна. Попробуйте еще раз через несколько секунд.';
    } else if (error.message.includes('parseAndAddProducts')) {
      errorMessage = '❌ Ошибка при распознавании продуктов. Проверьте формат ввода.';
    }
    
    await ctx.reply(errorMessage);
    return true;
  }
};

/**
 * Подтверждение соответствия продукта
 */
const confirmProductMatch = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx);
    
    const [, itemId, productId] = ctx.callbackQuery.data.split(':');
    
    logger.info('confirmProductMatch handler:', { 
      callbackData: ctx.callbackQuery.data,
      itemId, 
      productId 
    });
    
    const item = await draftOrderService.confirmProductMatch(itemId, productId);
    
    await ctx.editMessageText(
      `✅ Подтверждено: ${item.product_name} - ${item.quantity} ${item.unit}`
    );
  } catch (error) {
    logger.error('Error confirming product match:', error);
    ctx.reply('❌ Произошла ошибка');
  }
};

/**
 * Просмотр текущего черновика
 */
const viewDraft = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx);
    
    // Получаем черновик с учетом ID из сессии и филиала
    const draft = await draftOrderService.getCurrentDraft(
      ctx.user.id, 
      ctx.session?.draftOrderId,
      ctx.session?.selectedBranchId
    );
    
    // Сохраняем ID в сессии для последующих операций
    ctx.session = ctx.session || {};
    ctx.session.draftOrderId = draft.id;
    ctx.session.addingProducts = true; // Включаем режим добавления продуктов
    
    if (!draft.draftOrderItems || draft.draftOrderItems.length === 0) {
      return ctx.reply('📋 Заказ пуст');
    }

    let message = '📋 <b>Текущий заказ:</b>\n';
    
    // Добавляем информацию о филиале
    if (draft.branch) {
      message += `🏢 Филиал: ${draft.branch.name || draft.branch.address}`;
      if (draft.branch.isMain) message += ' (Главный)';
      message += '\n';
    }
    
    message += `📅 Отправка: ${formatInTimezone(draft.scheduled_for)}\n`;
    message += '💡 <i>Вы можете добавлять продукты текстом!</i>\n\n';
    
    // Группируем по статусу
    const confirmed = draft.draftOrderItems.filter(i => i.status === 'matched' || i.status === 'confirmed');
    const unmatched = draft.draftOrderItems.filter(i => i.status === 'unmatched');
    
    if (confirmed.length > 0) {
      message += '✅ <b>Подтвержденные позиции:</b>\n';
      confirmed.forEach((item, index) => {
        message += `${index + 1}. ${item.product_name} - ${item.quantity} ${item.unit}\n`;
      });
      message += '\n';
    }
    
    if (unmatched.length > 0) {
      message += '❓ <b>Требуют уточнения:</b>\n';
      message += '<i>Эти продукты не найдены в каталоге и НЕ будут отправлены в заказе</i>\n';
      unmatched.forEach((item, index) => {
        message += `${index + 1}. ${item.original_name} - ${item.quantity} ${item.unit}\n`;
      });
    }
    
    message += `\n📦 Всего позиций: ${draft.draftOrderItems.length}`;
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ Редактировать', callback_data: 'draft_edit' }],
          [{ text: '➕ Добавить продукты', callback_data: 'draft_add_more' }]
        ]
      }
    };
    
    // Добавляем кнопку отправки только если есть подтвержденные позиции
    if (confirmed.length > 0 && unmatched.length === 0) {
      keyboard.reply_markup.inline_keyboard.push([
        { text: '📤 Отправить заказ', callback_data: 'draft_send' }
      ]);
    } else if (confirmed.length > 0 && unmatched.length > 0) {
      keyboard.reply_markup.inline_keyboard.push([
        { text: '⚠️ Отправить только подтвержденные', callback_data: 'draft_send' }
      ]);
    }
    
    // Проверяем есть ли у ресторана несколько филиалов
    const hasMultiple = await hasMultipleBranches(ctx.user.restaurant_id);
    if (hasMultiple) {
      keyboard.reply_markup.inline_keyboard.push([
        { text: '🏢 Сменить филиал', callback_data: 'menu_create_order' }
      ]);
    }
    
    keyboard.reply_markup.inline_keyboard.push([
      { text: '🔙 Назад к списку', callback_data: 'my_orders' }
    ]);
    
    keyboard.reply_markup.inline_keyboard.push([
      { text: '🏠 Главное меню', callback_data: 'menu_main' }
    ]);
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error viewing draft:', error);
    ctx.reply('❌ Произошла ошибка');
  }
};

/**
 * Редактирование черновика
 */
const editDraft = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx);
    
    // Получаем черновик с учетом ID из сессии
    const draft = await draftOrderService.getCurrentDraft(
      ctx.user.id,
      ctx.session?.draftOrderId
    );
    
    // Сохраняем ID в сессии
    ctx.session = ctx.session || {};
    ctx.session.draftOrderId = draft.id;
    
    if (!draft.draftOrderItems || draft.draftOrderItems.length === 0) {
      return ctx.reply('📋 Заказ пуст');
    }

    let message = '✏️ <b>Редактирование заказа</b>\n\n';
    message += 'Выберите позицию для редактирования:\n\n';
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: draft.draftOrderItems.map((item, index) => [{
          text: `${index + 1}. ${item.product_name} - ${item.quantity} ${item.unit}`,
          callback_data: `draft_edit_item:${item.id}`
        }])
      }
    };
    
    keyboard.reply_markup.inline_keyboard.push([
      { text: '🔙 Назад', callback_data: 'draft_view' }
    ]);
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error editing draft:', error);
    ctx.reply('❌ Произошла ошибка');
  }
};

/**
 * Редактирование позиции
 */
const editDraftItem = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx);
    
    const itemId = ctx.callbackQuery.data.split(':')[1];
    
    // Получаем информацию о позиции
    const { DraftOrderItem } = require('../database/models');
    const item = await DraftOrderItem.findByPk(itemId);
    
    if (!item) {
      return ctx.reply('❌ Позиция не найдена');
    }
    
    let message = `📦 <b>${item.product_name}</b>\n`;
    message += `Текущее количество: ${item.quantity} ${item.unit}\n\n`;
    message += 'Выберите действие:';
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ Изменить количество', callback_data: `draft_change_qty:${item.id}` }],
          [{ text: '❌ Удалить позицию', callback_data: `draft_remove:${item.id}` }],
          [{ text: '🔙 Назад к списку', callback_data: 'draft_edit' }]
        ]
      }
    };
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error editing draft item:', error);
    ctx.reply('❌ Произошла ошибка');
  }
};

/**
 * Изменение количества позиции
 */
const changeDraftItemQuantity = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx);
    
    const itemId = ctx.callbackQuery.data.split(':')[1];
    
    // Получаем информацию о позиции
    const { DraftOrderItem } = require('../database/models');
    const item = await DraftOrderItem.findByPk(itemId);
    
    if (!item) {
      return ctx.reply('❌ Позиция не найдена');
    }
    
    // Сохраняем ID позиции в сессии для обработки ввода количества
    ctx.session = ctx.session || {};
    ctx.session.editingItemId = itemId;
    ctx.session.editingItemQuantity = true;
    
    await ctx.reply(
      `📝 Введите новое количество для "${item.product_name}":\n\n` +
      `Текущее: ${item.quantity} ${item.unit}\n` +
      `Единица измерения: ${item.unit}\n\n` +
      'Примеры: 5, 10.5, 0.750\n\n' +
      '<i>Отправьте /cancel для отмены</i>',
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error('Error changing draft item quantity:', error);
    ctx.reply('❌ Произошла ошибка');
  }
};

/**
 * Удаление позиции
 */
const removeItem = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx, 'Позиция удалена');
    
    const itemId = ctx.callbackQuery.data.split(':')[1];
    await draftOrderService.removeItem(itemId, ctx.user.id);
    
    await ctx.editMessageText('✅ Позиция удалена из заказа');
  } catch (error) {
    logger.error('Error removing item:', error);
    ctx.reply('❌ Произошла ошибка при удалении');
  }
};

/**
 * Завершение добавления продуктов
 */
const finishAdding = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx);
    
    delete ctx.session.addingProducts;
    delete ctx.session.draftOrderId;
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Мой заказ', callback_data: 'draft_view' }],
          [{ text: '➕ Добавить еще', callback_data: 'menu_create_order' }],
          [{ text: '🏠 Главное меню', callback_data: 'menu_main' }]
        ]
      }
    };
    
    await ctx.reply(
      '✅ Продукты добавлены в заказ!\n\n' +
      'Заказ будет автоматически отправлен в назначенное время.',
      keyboard
    );
  } catch (error) {
    logger.error('Error finishing addition:', error);
    ctx.reply('❌ Произошла ошибка');
  }
};

/**
 * Отправка черновика
 */
const sendDraft = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx);
    
    const draft = await draftOrderService.getCurrentDraft(
      ctx.user.id,
      ctx.session?.draftOrderId,
      ctx.session?.selectedBranchId
    );
    
    if (!draft || !draft.draftOrderItems || draft.draftOrderItems.length === 0) {
      return ctx.reply('❌ Заказ пуст. Добавьте продукты перед отправкой.');
    }
    
    // Проверяем, есть ли неподтвержденные позиции
    const unmatchedItems = draft.draftOrderItems.filter(i => i.status === 'unmatched');
    if (unmatchedItems.length > 0) {
      let message = '❌ В заказе есть неподтвержденные позиции.\n\n';
      message += '❓ <b>Требуют уточнения:</b>\n';
      unmatchedItems.forEach((item, index) => {
        message += `${index + 1}. ${item.original_name} - ${item.quantity} ${item.unit}\n`;
      });
      message += '\nПожалуйста, уточните все позиции перед отправкой.';
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✏️ Редактировать неподтвержденные', callback_data: 'draft_edit_unmatched' }],
            [{ text: '📋 Посмотреть весь заказ', callback_data: 'draft_view' }],
            [{ text: '🔙 Назад', callback_data: 'my_orders' }]
          ]
        }
      };
      
      return ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    }
    
    // Преобразуем черновик в заказ
    const order = await draftOrderService.convertToOrder(draft.id);
    
    // Очищаем сессию после успешной отправки
    delete ctx.session.addingProducts;
    delete ctx.session.draftOrderId;
    delete ctx.session.selectedBranchId;
    
    await ctx.reply(
      '✅ Заказ успешно отправлен!\n\n' +
      `📋 Номер заказа: #${order.id}\n` +
      '📊 Статус: Ожидает обработки\n\n' +
      'Вы получите уведомление, когда заказ будет обработан.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Главное меню', callback_data: 'menu_main' }]
          ]
        }
      }
    );
  } catch (error) {
    logger.error('Error sending draft:', {
      error: error.message,
      stack: error.stack,
      draftId: ctx.session?.draftOrderId
    });
    
    // Специальная обработка для SQLITE_BUSY
    if (error.message.includes('SQLITE_BUSY')) {
      return ctx.reply(
        '⚠️ База данных временно занята. Пожалуйста, попробуйте еще раз через несколько секунд.\n\n' +
        'Если ошибка повторяется, обратитесь к администратору.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Попробовать снова', callback_data: `draft_send:${ctx.session?.draftOrderId}` }],
              [{ text: '📋 Посмотреть заказ', callback_data: 'draft_view' }],
              [{ text: '🏠 Главное меню', callback_data: 'menu_main' }]
            ]
          }
        }
      );
    }
    
    ctx.reply(`❌ Произошла ошибка при отправке заказа: ${error.message}`);
  }
};

/**
 * Обработка выбора единицы измерения
 */
const handleUnitClarification = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx);
    
    const parts = ctx.callbackQuery.data.split(':');
    let tempId, unit, quantity, productName, matchedProduct;
    
    if (parts.length === 3) {
      // Новый формат: unit_clarify:tempId:unit
      [, tempId, unit] = parts;
      
      const clarificationData = ctx.session?.unitClarification?.[tempId];
      if (!clarificationData) {
        return ctx.reply('❌ Ошибка: данные не найдены. Попробуйте еще раз.');
      }
      
      productName = clarificationData.name;
      quantity = clarificationData.quantity;
      
      if (clarificationData.matchedProductId) {
        matchedProduct = await NomenclatureCache.findByPk(clarificationData.matchedProductId);
      }
      
      // Очищаем временные данные
      delete ctx.session.unitClarification[tempId];
    } else {
      // Старый формат для совместимости: unit_clarify:identifier:quantity:unit
      const [, identifier, quantityStr, unitStr] = parts;
      quantity = quantityStr;
      unit = unitStr;
      
      // Если identifier - это число, значит это ID продукта
      if (!isNaN(identifier)) {
        matchedProduct = await NomenclatureCache.findByPk(identifier);
        productName = matchedProduct?.product_name;
      } else {
        // Иначе это закодированное имя продукта
        productName = decodeURIComponent(identifier);
      }
    }
    
    const draftOrderId = ctx.session?.draftOrderId;
    
    if (!draftOrderId) {
      return ctx.reply('❌ Ошибка: черновик не найден');
    }
    
    // Если продукт не найден в каталоге, пытаемся найти
    if (!matchedProduct) {
      matchedProduct = await productMatcher.findExactMatch(productName);
    }
    
    if (!matchedProduct) {
      return ctx.editMessageText('❌ Продукт не найден в каталоге');
    }
    
    // Создаем позицию с выбранной единицей измерения
    const item = await DraftOrderItem.create({
      draft_order_id: draftOrderId,
      product_name: matchedProduct.product_name,
      original_name: productName,
      quantity: parseFloat(quantity),
      unit: unit,
      status: 'matched',
      matched_product_id: matchedProduct.id,
      added_by: ctx.user.id
    });
    
    await ctx.editMessageText(
      `✅ Добавлено: ${matchedProduct.product_name} - ${quantity} ${unit}`
    );
  } catch (error) {
    logger.error('Error handling unit clarification:', error);
    await ctx.reply('❌ Произошла ошибка при добавлении продукта');
  }
};

/**
 * Обработка добавления к существующему количеству
 */
const handleDuplicateAdd = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx);
    
    const [, itemId, newQuantity, unit] = ctx.callbackQuery.data.split(':');
    
    const item = await DraftOrderItem.findByPk(itemId);
    if (!item) {
      return ctx.reply('❌ Позиция не найдена');
    }
    
    // Если передана единица измерения, обновляем её
    if (unit) {
      item.unit = unit;
    }
    
    // Добавляем новое количество к существующему
    const totalQuantity = parseFloat(item.quantity) + parseFloat(newQuantity);
    item.quantity = totalQuantity;
    await item.save();
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Добавить еще продукты', callback_data: 'draft_add_more' }],
          [{ text: '📋 Посмотреть весь заказ', callback_data: 'draft_view' }],
          [{ text: '✅ Готово', callback_data: 'draft_done' }]
        ]
      }
    };
    
    await ctx.editMessageText(
      `✅ Количество обновлено!\n\n` +
      `${item.product_name}: ${totalQuantity} ${item.unit}`,
      keyboard
    );
  } catch (error) {
    logger.error('Error handling duplicate add:', error);
    ctx.reply('❌ Произошла ошибка при обновлении количества');
  }
};

/**
 * Обработка замены количества
 */
const handleDuplicateReplace = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx);
    
    const [, itemId, newQuantity, unit] = ctx.callbackQuery.data.split(':');
    
    const item = await DraftOrderItem.findByPk(itemId);
    if (!item) {
      return ctx.reply('❌ Позиция не найдена');
    }
    
    // Если передана единица измерения, обновляем её
    if (unit) {
      item.unit = unit;
    }
    
    // Заменяем количество
    item.quantity = parseFloat(newQuantity);
    await item.save();
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Добавить еще продукты', callback_data: 'draft_add_more' }],
          [{ text: '📋 Посмотреть весь заказ', callback_data: 'draft_view' }],
          [{ text: '✅ Готово', callback_data: 'draft_done' }]
        ]
      }
    };
    
    await ctx.editMessageText(
      `✅ Количество изменено!\n\n` +
      `${item.product_name}: ${newQuantity} ${item.unit}`,
      keyboard
    );
  } catch (error) {
    logger.error('Error handling duplicate replace:', error);
    ctx.reply('❌ Произошла ошибка при изменении количества');
  }
};

/**
 * Обработка отмены добавления дубликата
 */
const handleDuplicateCancel = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx, 'Отменено');
    await ctx.editMessageText('❌ Добавление отменено');
  } catch (error) {
    logger.error('Error handling duplicate cancel:', error);
  }
};

/**
 * Обработка выбора единицы измерения для дубликата
 */
const handleUnitDuplicate = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx);
    
    const [, itemId, newQuantity, unit] = ctx.callbackQuery.data.split(':');
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{
            text: `✅ Да, добавить ${newQuantity} ${unit}`,
            callback_data: `duplicate_add:${itemId}:${newQuantity}:${unit}`
          }],
          [{
            text: `✏️ Заменить на ${newQuantity} ${unit}`,
            callback_data: `duplicate_replace:${itemId}:${newQuantity}:${unit}`
          }],
          [{
            text: '❌ Отмена',
            callback_data: `duplicate_cancel:${itemId}`
          }]
        ]
      }
    };
    
    const item = await DraftOrderItem.findByPk(itemId);
    if (!item) {
      return ctx.reply('❌ Позиция не найдена');
    }
    
    await ctx.editMessageText(
      `⚠️ <b>Продукт уже есть в заказе!</b>\n\n` +
      `<b>${item.product_name}</b>\n` +
      `Текущее количество: ${item.quantity} ${item.unit}\n` +
      `Вы хотите добавить: ${newQuantity} ${unit}\n\n` +
      `Что сделать?`,
      { parse_mode: 'HTML', ...keyboard }
    );
  } catch (error) {
    logger.error('Error handling unit duplicate:', error);
    ctx.reply('❌ Произошла ошибка');
  }
};

/**
 * Обработчик выбора черновика из списка
 */
const selectDraft = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx);
    
    const draftId = ctx.callbackQuery.data.split(':')[1];
    const draft = await draftOrderService.getDraftById(draftId);
    
    if (!draft) {
      return ctx.reply('❌ Черновик не найден');
    }
    
    // Сохраняем выбранный черновик в сессии
    ctx.session = ctx.session || {};
    ctx.session.draftOrderId = draft.id;
    ctx.session.addingProducts = true; // Включаем режим добавления продуктов
    
    let message = '📋 <b>Выбранный заказ:</b>\n';
    if (draft.branch) {
      message += `📍 Филиал: ${draft.branch.name || draft.branch.address}\n`;
    }
    message += `📅 Отправка: ${formatInTimezone(draft.scheduled_for)}\n\n`;
    message += '💡 <i>Теперь вы можете отправлять продукты текстом!</i>\n\n';
    
    if (!draft.draftOrderItems || draft.draftOrderItems.length === 0) {
      message += '📦 Заказ пока пуст.\n\n';
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ Добавить продукты', callback_data: `draft_add_more:${draft.id}` }],
            [{ text: '🏠 Главное меню', callback_data: 'menu_main' }]
          ]
        }
      };
      
      await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
      return;
    }
    
    // Группируем по статусу
    const confirmed = draft.draftOrderItems.filter(i => i.status === 'matched' || i.status === 'confirmed');
    const unmatched = draft.draftOrderItems.filter(i => i.status === 'unmatched');
    
    if (confirmed.length > 0) {
      message += '✅ <b>Подтвержденные позиции:</b>\n';
      confirmed.forEach((item, index) => {
        message += `${index + 1}. ${item.product_name} - ${item.quantity} ${item.unit}\n`;
      });
      message += '\n';
    }
    
    if (unmatched.length > 0) {
      message += '❓ <b>Требуют уточнения:</b>\n';
      unmatched.forEach((item, index) => {
        message += `${index + 1}. ${item.original_name} - ${item.quantity} ${item.unit}\n`;
      });
    }
    
    message += `\n📦 Всего позиций: ${draft.draftOrderItems.length}`;
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ Редактировать', callback_data: `draft_edit:${draft.id}` }],
          [{ text: '➕ Добавить продукты', callback_data: `draft_add_more:${draft.id}` }],
          [{ text: '✅ Отправить заказ', callback_data: `draft_send:${draft.id}` }],
          [{ text: '🔙 Назад к списку', callback_data: 'my_orders' }],
          [{ text: '🏠 Главное меню', callback_data: 'menu_main' }]
        ]
      }
    };

    await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error selecting draft:', error);
    ctx.reply('❌ Произошла ошибка при выборе черновика');
  }
};

/**
 * Редактирование неподтвержденных позиций
 */
const editUnmatchedItems = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx);
    
    // Получаем черновик с учетом ID из сессии
    const draft = await draftOrderService.getCurrentDraft(
      ctx.user.id,
      ctx.session?.draftOrderId
    );
    
    // Сохраняем ID в сессии
    ctx.session = ctx.session || {};
    ctx.session.draftOrderId = draft.id;
    
    // Фильтруем только неподтвержденные позиции
    const unmatchedItems = draft.draftOrderItems.filter(i => i.status === 'unmatched');
    
    if (unmatchedItems.length === 0) {
      return ctx.reply('✅ Все позиции подтверждены!');
    }

    let message = '❓ <b>Неподтвержденные позиции:</b>\n\n';
    message += 'Выберите позицию для редактирования или поиска в каталоге:\n\n';
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: unmatchedItems.map((item, index) => [{
          text: `${index + 1}. ${item.original_name} - ${item.quantity} ${item.unit}`,
          callback_data: `draft_confirm_item:${item.id}`
        }])
      }
    };
    
    keyboard.reply_markup.inline_keyboard.push([
      { text: '❌ Удалить все неподтвержденные', callback_data: 'draft_remove_unmatched' }
    ]);
    
    keyboard.reply_markup.inline_keyboard.push([
      { text: '🔙 Назад', callback_data: 'draft_view' }
    ]);
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error editing unmatched items:', error);
    ctx.reply('❌ Произошла ошибка');
  }
};

/**
 * Подтверждение отдельной позиции
 */
const confirmDraftItem = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx);
    
    const itemId = ctx.callbackQuery.data.split(':')[1];
    
    // Получаем информацию о позиции
    const { DraftOrderItem } = require('../database/models');
    const item = await DraftOrderItem.findByPk(itemId);
    
    if (!item) {
      return ctx.reply('❌ Позиция не найдена');
    }
    
    // Ищем похожие продукты в каталоге
    const productMatcher = require('../services/ProductMatcher');
    const searchResults = await productMatcher.searchWithAutoComplete(item.original_name, 10);
    
    if (searchResults.length === 0) {
      let message = `❌ <b>Продукт не найден в каталоге</b>\n\n`;
      message += `Искали: "${item.original_name}"\n`;
      message += `Количество: ${item.quantity} ${item.unit}\n\n`;
      message += 'Что делать с этой позицией?';
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✏️ Изменить название', callback_data: `draft_rename_item:${item.id}` }],
            [{ text: '❌ Удалить позицию', callback_data: `draft_remove:${item.id}` }],
            [{ text: '🔙 Назад к списку', callback_data: 'draft_edit_unmatched' }]
          ]
        }
      };
      
      return ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    }
    
    // Показываем найденные варианты
    let message = `🔍 <b>Поиск: "${item.original_name}"</b>\n`;
    message += `Количество: ${item.quantity} ${item.unit}\n\n`;
    message += 'Выберите подходящий продукт из каталога:\n\n';
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: searchResults.slice(0, 10).map((result, index) => [{
          text: `${index + 1}. ${result.product_name}`,
          callback_data: `draft_match_item:${item.id}:${result.id}`
        }])
      }
    };
    
    keyboard.reply_markup.inline_keyboard.push([
      { text: '❌ Нет подходящего варианта', callback_data: `draft_no_match:${item.id}` }
    ]);
    
    keyboard.reply_markup.inline_keyboard.push([
      { text: '🔙 Назад к списку', callback_data: 'draft_edit_unmatched' }
    ]);
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error confirming draft item:', error);
    ctx.reply('❌ Произошла ошибка');
  }
};

/**
 * Сопоставление позиции с продуктом из каталога
 */
const matchDraftItem = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx, 'Позиция подтверждена');
    
    const [, itemId, productId] = ctx.callbackQuery.data.split(':');
    
    // Получаем информацию о позиции и продукте
    const { DraftOrderItem, NomenclatureCache } = require('../database/models');
    const item = await DraftOrderItem.findByPk(itemId);
    const product = await NomenclatureCache.findByPk(productId);
    
    if (!item || !product) {
      return ctx.reply('❌ Ошибка: позиция или продукт не найдены');
    }
    
    // Обновляем позицию
    item.product_name = product.product_name;
    item.matched_product_id = product.id;
    item.status = 'matched';
    await item.save();
    
    await ctx.editMessageText(
      `✅ Позиция подтверждена!\n\n` +
      `${product.product_name} - ${item.quantity} ${item.unit}`
    );
    
    // Через секунду возвращаемся к списку
    setTimeout(() => {
      editUnmatchedItems(ctx);
    }, 1000);
  } catch (error) {
    logger.error('Error matching draft item:', error);
    ctx.reply('❌ Произошла ошибка при подтверждении позиции');
  }
};

/**
 * Удаление всех неподтвержденных позиций
 */
const removeUnmatchedItems = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx);
    
    const draft = await draftOrderService.getCurrentDraft(
      ctx.user.id,
      ctx.session?.draftOrderId
    );
    
    // Находим все неподтвержденные позиции
    const unmatchedItems = draft.draftOrderItems.filter(i => i.status === 'unmatched');
    const unmatchedCount = unmatchedItems.length;
    
    if (unmatchedCount === 0) {
      return ctx.reply('✅ Нет неподтвержденных позиций');
    }
    
    let message = `⚠️ <b>Подтверждение удаления</b>\n\n`;
    message += `Вы действительно хотите удалить ${unmatchedCount} неподтвержденных позиций?\n\n`;
    message += 'Будут удалены:\n';
    unmatchedItems.forEach((item, index) => {
      message += `• ${item.original_name} - ${item.quantity} ${item.unit}\n`;
    });
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Да, удалить', callback_data: 'draft_confirm_remove_unmatched' },
            { text: '❌ Отмена', callback_data: 'draft_edit_unmatched' }
          ]
        ]
      }
    };
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error removing unmatched items:', error);
    ctx.reply('❌ Произошла ошибка');
  }
};

/**
 * Подтверждение удаления неподтвержденных позиций
 */
const confirmRemoveUnmatched = async (ctx) => {
  try {
    await safeAnswerCbQuery(ctx, 'Удаляем неподтвержденные позиции...');
    
    const draft = await draftOrderService.getCurrentDraft(
      ctx.user.id,
      ctx.session?.draftOrderId
    );
    
    // Удаляем все неподтвержденные позиции
    const { DraftOrderItem } = require('../database/models');
    const deleteCount = await DraftOrderItem.destroy({
      where: {
        draft_order_id: draft.id,
        status: 'unmatched'
      }
    });
    
    await ctx.editMessageText(
      `✅ Удалено ${deleteCount} неподтвержденных позиций`
    );
    
    // Через секунду показываем обновленный черновик
    setTimeout(() => {
      viewDraft(ctx);
    }, 1000);
  } catch (error) {
    logger.error('Error confirming remove unmatched:', error);
    ctx.reply('❌ Произошла ошибка при удалении позиций');
  }
};

module.exports = {
  startAddingProducts,
  handleProductText,
  confirmProductMatch,
  viewDraft,
  editDraft,
  editDraftItem,
  changeDraftItemQuantity,
  removeItem,
  finishAdding,
  sendDraft,
  selectDraft,
  handleUnitClarification,
  handleUnitDuplicate,
  handleDuplicateAdd,
  handleDuplicateReplace,
  handleDuplicateCancel,
  editUnmatchedItems,
  confirmDraftItem,
  matchDraftItem,
  removeUnmatchedItems,
  confirmRemoveUnmatched
};