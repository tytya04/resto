const logger = require('../utils/logger');
const { Order, DraftOrder, DraftOrderItem } = require('../database/models');
const { ROLES } = require('../constants/roles');
const draftOrderService = require('../services/DraftOrderService');
const { Markup } = require('telegraf');
const moment = require('moment');
const { formatInTimezone } = require('../utils/timezone');

const menu = async (ctx) => {
  if (ctx.user.role !== ROLES.RESTAURANT) {
    return ctx.reply('Эта команда доступна только для ресторанов');
  }

  const menuKeyboard = {
    reply_markup: {
      keyboard: [
        [{ text: 'Создать заявку' }, { text: 'Мои заявки' }],
        [{ text: 'Шаблоны заявок' }, { text: 'История' }],
        [{ text: 'Назад' }]
      ],
      resize_keyboard: true
    }
  };

  await ctx.reply('Меню ресторана:', menuKeyboard);
};

const createOrder = async (ctx) => {
  // Handle callback query if this is from a button
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
  
  if (ctx.user.role !== ROLES.RESTAURANT) {
    return ctx.reply('Эта команда доступна только для ресторанов');
  }

  ctx.session = ctx.session || {};
  ctx.session.creatingOrder = true;
  
  const message = '🛒 <b>Создание нового заказа</b>\n\n' +
    '📝 Отправьте список продуктов в формате:\n' +
    '<code>Название продукта - количество - единица измерения</code>\n\n' +
    '<b>Примеры:</b>\n' +
    '<code>Картофель - 50 - кг</code>\n' +
    '<code>Морковь - 30 - кг</code>\n' +
    '<code>Лук репчатый - 20 - кг</code>\n' +
    '<code>Томаты - 15 - кг</code>\n\n' +
    '<i>💡 Совет: Вы можете отправить весь список сразу, каждый продукт с новой строки</i>\n\n' +
    '<i>Для отмены отправьте /cancel</i>';
  
  await ctx.reply(message, { parse_mode: 'HTML' });
};

const myOrders = async (ctx) => {
  // Handle callback query if this is from a button
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  }
  
  if (ctx.user.role !== ROLES.RESTAURANT) {
    return ctx.reply('Эта команда доступна только для ресторанов');
  }

  try {
    const { DraftOrder, DraftOrderItem, RestaurantBranch } = require('../database/models');
    
    // Получаем все черновики пользователя
    const drafts = await DraftOrder.findAll({
      where: {
        user_id: ctx.user.id,
        status: 'draft'
      },
      include: [
        {
          model: DraftOrderItem,
          as: 'draftOrderItems'
        },
        {
          model: RestaurantBranch,
          as: 'branch'
        }
      ],
      order: [['updated_at', 'DESC']]
    });
    
    if (!drafts || drafts.length === 0) {
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛒 Создать первый заказ', callback_data: 'menu_create_order' }],
            [{ text: '🏠 Главное меню', callback_data: 'menu_main' }]
          ]
        }
      };
      
      return ctx.reply(
        '📋 У вас пока нет заказов.\n\n' +
        'Нажмите кнопку ниже, чтобы создать первый заказ.',
        keyboard
      );
    }

    // Если есть только один черновик - сразу показываем его
    if (drafts.length === 1) {
      const draft = drafts[0];
      
      // Пропускаем черновики без продуктов
      if (!draft.draftOrderItems || draft.draftOrderItems.length === 0) {
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🛒 Создать заказ', callback_data: 'menu_create_order' }],
              [{ text: '🏠 Главное меню', callback_data: 'menu_main' }]
            ]
          }
        };
        
        return ctx.reply(
          '📋 У вас есть пустой черновик заказа.\n\n' +
          'Нажмите кнопку ниже, чтобы добавить продукты.',
          keyboard
        );
      }
      
      let message = '📋 <b>Текущий заказ:</b>\n';
      if (draft.branch) {
        message += `📍 Филиал: ${draft.branch.address}\n`;
      }
      message += `📅 Отправка: ${formatInTimezone(draft.scheduled_for)}\n\n`;
      
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
            [{ text: '🏠 Главное меню', callback_data: 'menu_main' }]
          ]
        }
      };

      await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    } else {
      // Если несколько черновиков - показываем список
      let message = '📋 <b>Ваши черновики заказов:</b>\n\n';
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: []
        }
      };
      
      drafts.forEach((draft, index) => {
        const itemCount = draft.draftOrderItems ? draft.draftOrderItems.length : 0;
        const branchName = draft.branch ? draft.branch.address : 'Без филиала';
        const scheduledTime = formatInTimezone(draft.scheduled_for, 'DD.MM HH:mm');
        
        message += `${index + 1}. 📍 ${branchName}\n`;
        message += `   📅 ${scheduledTime} | 📦 ${itemCount} позиций\n\n`;
        
        keyboard.reply_markup.inline_keyboard.push([{
          text: `${index + 1}. ${branchName} (${itemCount} поз.)`,
          callback_data: `select_draft:${draft.id}`
        }]);
      });
      
      keyboard.reply_markup.inline_keyboard.push(
        [{ text: '🛒 Создать новый заказ', callback_data: 'menu_create_order' }],
        [{ text: '🏠 Главное меню', callback_data: 'menu_main' }]
      );
      
      await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (error) {
    logger.error('My orders error:', error);
    ctx.reply('❌ Произошла ошибка при получении заказов');
  }
};

// Поиск продуктов
const searchProducts = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    await ctx.reply(
      '🔍 <b>Поиск продуктов</b>\n\n' +
      'Используйте команду /search для поиска продуктов.\n\n' +
      'Вы можете искать по:\n' +
      '• Названию продукта\n' +
      '• Категории\n' +
      '• Артикулу',
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error('Error in searchProducts:', error);
    ctx.reply('Произошла ошибка');
  }
};

module.exports = {
  menu,
  createOrder,
  myOrders,
  searchProducts
};