const { Restaurant, RestaurantBranch, DraftOrder } = require('../database/models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { Markup } = require('telegraf');

/**
 * Проверяет, есть ли у ресторана несколько филиалов
 */
async function hasMultipleBranches(restaurantId) {
  const count = await RestaurantBranch.count({
    where: {
      restaurantId,
      isActive: true
    }
  });
  return count > 1;
}

/**
 * Получает список активных филиалов ресторана
 */
async function getActiveBranches(restaurantId) {
  return RestaurantBranch.findAll({
    where: {
      restaurantId,
      isActive: true
    },
    order: [
      ['isMain', 'DESC'],
      ['address', 'ASC']
    ]
  });
}

/**
 * Показывает меню выбора филиала
 */
async function showBranchSelection(ctx, restaurantId, action = 'select_branch') {
  try {
    const branches = await getActiveBranches(restaurantId);
    
    if (branches.length === 0) {
      await ctx.reply('❌ Не найдено активных филиалов для этого ресторана');
      return null;
    }
    
    if (branches.length === 1) {
      // Если только один филиал, возвращаем его без выбора
      return branches[0];
    }
    
    const keyboard = {
      inline_keyboard: branches.map(branch => [{
        text: `📍 ${branch.address}${branch.isMain ? ' (Главный)' : ''}`,
        callback_data: `${action}:${branch.id}`
      }])
    };
    
    keyboard.inline_keyboard.push([{
      text: '❌ Отмена',
      callback_data: 'cancel_branch_selection'
    }]);
    
    await ctx.reply(
      '🏢 Выберите филиал:',
      { reply_markup: keyboard }
    );
    
    return null; // Филиал будет выбран через callback
  } catch (error) {
    logger.error('Error showing branch selection:', error);
    await ctx.reply('❌ Ошибка при загрузке филиалов');
    return null;
  }
}

/**
 * Создает филиал для ресторана
 */
async function createBranch(restaurantId, address, isMain = false) {
  try {
    // Если это главный филиал, убираем флаг у остальных
    if (isMain) {
      await RestaurantBranch.update(
        { isMain: false },
        { where: { restaurantId } }
      );
    }
    
    const branch = await RestaurantBranch.create({
      restaurantId,
      address,
      isMain,
      isActive: true
    });
    
    return branch;
  } catch (error) {
    logger.error('Error creating branch:', error);
    throw error;
  }
}

/**
 * Обработчик для добавления нового филиала
 */
async function handleAddBranch(ctx) {
  try {
    const user = ctx.session.user;
    const restaurantId = user.restaurant_id;
    
    if (!restaurantId) {
      await ctx.reply('❌ Вы не привязаны к ресторану');
      return;
    }
    
    // Сохраняем состояние в сессии
    ctx.session.awaitingBranchAddress = true;
    ctx.session.restaurantIdForBranch = restaurantId;
    
    await ctx.reply(
      '📍 Введите адрес нового филиала:',
      Markup.keyboard([['❌ Отмена']]).resize()
    );
  } catch (error) {
    logger.error('Error in handleAddBranch:', error);
    await ctx.reply('❌ Произошла ошибка');
  }
}

/**
 * Обработчик текста с адресом филиала
 */
async function handleBranchAddressText(ctx) {
  try {
    if (!ctx.session.awaitingBranchAddress) {
      return false;
    }
    
    const address = ctx.message.text.trim();
    
    if (address === '❌ Отмена') {
      delete ctx.session.awaitingBranchAddress;
      delete ctx.session.restaurantIdForBranch;
      delete ctx.session.isManagerAddingBranch;
      await ctx.reply('❌ Добавление филиала отменено', getDefaultKeyboard(ctx));
      return true;
    }
    
    const restaurantId = ctx.session.restaurantIdForBranch;
    
    // Создаем филиал
    const branch = await createBranch(restaurantId, address, false);
    
    // Очищаем состояние сессии
    delete ctx.session.awaitingBranchAddress;
    delete ctx.session.restaurantIdForBranch;
    const wasManagerAdding = ctx.session.isManagerAddingBranch;
    delete ctx.session.isManagerAddingBranch;
    
    // Если это был менеджер, не показываем клавиатуру
    if (wasManagerAdding) {
      // Показываем только сообщение об успешном добавлении
      await ctx.reply(`✅ Филиал успешно добавлен:\n📍 ${address}`);
      
      // Небольшая задержка для лучшего UX
      await new Promise(resolve => setTimeout(resolve, 500));
      return manageBranches(ctx, restaurantId);
    }
    
    // Для других ролей показываем с клавиатурой
    await ctx.reply(
      `✅ Филиал успешно добавлен:\n📍 ${address}`,
      getDefaultKeyboard(ctx)
    );
    
    return true;
  } catch (error) {
    logger.error('Error handling branch address:', error);
    await ctx.reply('❌ Ошибка при добавлении филиала');
    return true;
  }
}

/**
 * Возвращает стандартную клавиатуру для роли пользователя
 */
function getDefaultKeyboard(ctx) {
  const role = ctx.session.user?.role;
  
  if (role === 'restaurant') {
    return Markup.keyboard([
      ['🛒 Создать заказ', '📋 Мои заказы'],
      ['🔍 Поиск продуктов', '🏢 Мои филиалы'],
      ['👤 Профиль']
    ]).resize();
  }
  
  return Markup.removeKeyboard();
}

/**
 * Управление филиалами для менеджера
 */
async function manageBranches(ctx, restaurantId) {
  try {
    if (!restaurantId) {
      await ctx.reply('❌ Не указан ресторан');
      return;
    }
    
    const restaurant = await Restaurant.findByPk(restaurantId);
    if (!restaurant) {
      await ctx.reply('❌ Ресторан не найден');
      return;
    }
    
    const branches = await RestaurantBranch.findAll({
      where: { restaurantId },
      order: [
        ['isMain', 'DESC'],
        ['address', 'ASC']
      ]
    });
    
    let message = `🏢 <b>${restaurant.name}</b>\n\n`;
    message += '📍 <b>Филиалы:</b>\n\n';
    
    if (branches.length === 0) {
      message += '<i>Нет добавленных филиалов</i>\n';
    } else {
      branches.forEach((branch, index) => {
        message += `${index + 1}. ${branch.address}`;
        if (branch.isMain) message += ' <b>(Главный)</b>';
        if (!branch.isActive) message += ' <i>(Неактивен)</i>';
        message += '\n';
      });
    }
    
    // Определяем роль пользователя
    const userRole = ctx.user?.role || ctx.session?.user?.role;
    const isAdmin = userRole === 'admin';
    const prefix = isAdmin ? 'admin' : 'manager';
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Добавить филиал', callback_data: `${prefix}_add_branch:${restaurantId}` }]
        ]
      }
    };
    
    if (branches.length > 0) {
      keyboard.reply_markup.inline_keyboard.push([
        { text: '✏️ Редактировать филиалы', callback_data: `${prefix}_edit_branches:${restaurantId}` }
      ]);
    }
    
    // Кнопка назад зависит от роли
    const backCallback = isAdmin ? 
      `restaurant_${restaurantId}` : 
      `manager_restaurant:${restaurantId}`;
    
    keyboard.reply_markup.inline_keyboard.push([
      { text: '⬅️ Назад', callback_data: backCallback }
    ]);
    
    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        ...keyboard
      });
    } else {
      await ctx.reply(message, {
        parse_mode: 'HTML',
        ...keyboard
      });
    }
  } catch (error) {
    logger.error('Error in manageBranches:', error);
    await ctx.reply('❌ Ошибка при загрузке филиалов');
  }
}

/**
 * Обработчик добавления филиала для менеджера
 */
async function handleManagerAddBranch(ctx, restaurantId) {
  try {
    ctx.session = ctx.session || {};
    ctx.session.awaitingBranchAddress = true;
    ctx.session.restaurantIdForBranch = restaurantId;
    ctx.session.isManagerAddingBranch = true;
    
    await ctx.editMessageText(
      '📍 <b>Добавление нового филиала</b>\n\n' +
      'Введите адрес филиала:',
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error('Error in handleManagerAddBranch:', error);
    await ctx.reply('❌ Произошла ошибка');
  }
}

/**
 * Обработчик callback'ов для филиалов от менеджера
 */
async function handleBranchCallbacks(ctx) {
  try {
    const action = ctx.callbackQuery.data;
    const userRole = ctx.user?.role || ctx.session?.user?.role;
    const isAdmin = userRole === 'admin';
    
    // Добавление филиала (менеджер или админ)
    if (action.match(/^(manager|admin)_add_branch:(\d+)$/)) {
      const match = action.match(/^(manager|admin)_add_branch:(\d+)$/);
      const restaurantId = parseInt(match[2]);
      await ctx.answerCbQuery();
      return handleManagerAddBranch(ctx, restaurantId);
    }
    
    // Редактирование филиалов (менеджер или админ)
    if (action.match(/^(manager|admin)_edit_branches:(\d+)$/)) {
      const match = action.match(/^(manager|admin)_edit_branches:(\d+)$/);
      const prefix = match[1];
      const restaurantId = parseInt(match[2]);
      await ctx.answerCbQuery();
      
      const branches = await RestaurantBranch.findAll({
        where: { restaurantId, isActive: true },
        order: [['isMain', 'DESC'], ['address', 'ASC']]
      });
      
      if (branches.length === 0) {
        await ctx.reply('❌ Нет филиалов для редактирования');
        return;
      }
      
      const branchButtons = branches.map(branch => [{
        text: `${branch.address}${branch.isMain ? ' (Главный)' : ''}`,
        callback_data: `edit_branch:${branch.id}`
      }]);
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            ...branchButtons,
            [{ text: '⬅️ Назад', callback_data: `${prefix}_branches:${restaurantId}` }]
          ]
        }
      };
      
      await ctx.editMessageText(
        '✏️ <b>Выберите филиал для редактирования:</b>',
        { parse_mode: 'HTML', ...keyboard }
      );
      return;
    }
    
    // Редактирование конкретного филиала
    if (action.match(/^edit_branch:(\d+)$/)) {
      const branchId = parseInt(action.match(/^edit_branch:(\d+)$/)[1]);
      await ctx.answerCbQuery();
      
      const branch = await RestaurantBranch.findByPk(branchId, {
        include: [{ model: Restaurant, as: 'restaurant' }]
      });
      
      if (!branch) {
        await ctx.reply('❌ Филиал не найден');
        return;
      }
      
      // Проверяем доступ
      if (!isAdmin && ctx.user.restaurant_id !== branch.restaurantId) {
        await ctx.reply('❌ У вас нет доступа к этому филиалу');
        return;
      }
      
      const message = `📍 <b>Филиал:</b> ${branch.address}\n` +
        `🏢 <b>Ресторан:</b> ${branch.restaurant.name}\n` +
        `📊 <b>Статус:</b> ${branch.isActive ? 'Активен' : 'Неактивен'}\n` +
        `🔑 <b>Главный:</b> ${branch.isMain ? 'Да' : 'Нет'}`;
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ 
              text: branch.isActive ? '❌ Деактивировать' : '✅ Активировать', 
              callback_data: `toggle_branch:${branch.id}` 
            }],
            [{ 
              text: branch.isMain ? '🔓 Убрать главный' : '🔑 Сделать главным', 
              callback_data: `set_main_branch:${branch.id}` 
            }],
            [{ text: '⬅️ Назад', callback_data: `${isAdmin ? 'admin' : 'manager'}_edit_branches:${branch.restaurantId}` }]
          ]
        }
      };
      
      await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
      return;
    }
    
    // Переключение статуса филиала
    if (action.match(/^toggle_branch:(\d+)$/)) {
      const branchId = parseInt(action.match(/^toggle_branch:(\d+)$/)[1]);
      await ctx.answerCbQuery();
      
      const branch = await RestaurantBranch.findByPk(branchId);
      if (!branch) {
        await ctx.reply('❌ Филиал не найден');
        return;
      }
      
      // Проверяем доступ
      if (!isAdmin && ctx.user.restaurant_id !== branch.restaurantId) {
        await ctx.reply('❌ У вас нет доступа к этому филиалу');
        return;
      }
      
      // Нельзя деактивировать главный филиал
      if (branch.isMain && branch.isActive) {
        await ctx.answerCbQuery('Нельзя деактивировать главный филиал', { show_alert: true });
        return;
      }
      
      await branch.update({ isActive: !branch.isActive });
      
      await ctx.answerCbQuery(branch.isActive ? '✅ Филиал активирован' : '❌ Филиал деактивирован');
      
      // Обновляем сообщение
      return handleBranchCallbacks(ctx);
    }
    
    // Установка главного филиала
    if (action.match(/^set_main_branch:(\d+)$/)) {
      const branchId = parseInt(action.match(/^set_main_branch:(\d+)$/)[1]);
      await ctx.answerCbQuery();
      
      const branch = await RestaurantBranch.findByPk(branchId);
      if (!branch) {
        await ctx.reply('❌ Филиал не найден');
        return;
      }
      
      // Проверяем доступ
      if (!isAdmin && ctx.user.restaurant_id !== branch.restaurantId) {
        await ctx.reply('❌ У вас нет доступа к этому филиалу');
        return;
      }
      
      if (branch.isMain) {
        // Убираем статус главного
        await branch.update({ isMain: false });
        await ctx.answerCbQuery('🔓 Статус главного филиала снят');
      } else {
        // Сначала убираем статус главного у других филиалов
        await RestaurantBranch.update(
          { isMain: false },
          { where: { restaurantId: branch.restaurantId } }
        );
        
        // Устанавливаем новый главный филиал
        await branch.update({ isMain: true });
        await ctx.answerCbQuery('🔑 Филиал установлен как главный');
      }
      
      // Обновляем сообщение
      ctx.callbackQuery.data = `edit_branch:${branchId}`;
      return handleBranchCallbacks(ctx);
    }
    
  } catch (error) {
    logger.error('Error in handleBranchCallbacks:', error);
    ctx.answerCbQuery('Произошла ошибка');
  }
}

module.exports = {
  hasMultipleBranches,
  getActiveBranches,
  showBranchSelection,
  createBranch,
  handleAddBranch,
  handleBranchAddressText,
  manageBranches,
  handleManagerAddBranch,
  handleBranchCallbacks
};