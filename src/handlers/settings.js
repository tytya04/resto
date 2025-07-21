const { Settings, Restaurant } = require('../database/models');
const orderSchedulerService = require('../services/OrderSchedulerService');
const logger = require('../utils/logger');
const moment = require('moment');
const { formatInTimezone } = require('../utils/timezone');

// Команда для установки времени отправки
const setAutoSendTime = async (ctx) => {
  try {
    // Проверяем, что у пользователя есть ресторан
    if (!ctx.user.restaurant_id) {
      return ctx.reply('⚠️ Вы не привязаны к ресторану');
    }

    // Проверяем роль - только менеджеры и сотрудники ресторана
    if (!['manager', 'restaurant'].includes(ctx.user.role)) {
      return ctx.reply('⚠️ У вас нет прав для изменения этой настройки');
    }

    // Для сотрудников ресторана - только свой ресторан
    const restaurantId = ctx.user.role === 'restaurant' ? ctx.user.restaurant_id : null;

    if (ctx.user.role === 'manager') {
      // Менеджер может выбрать ресторан
      const restaurants = await Restaurant.findAll({ where: { is_active: true } });
      
      const keyboard = {
        inline_keyboard: restaurants.map(r => [{
          text: r.name,
          callback_data: `set_time_restaurant:${r.id}`
        }])
      };
      
      keyboard.inline_keyboard.push([{
        text: '❌ Отмена',
        callback_data: 'cancel_settings'
      }]);
      
      return ctx.reply('🏢 Выберите ресторан для настройки времени отправки:', {
        reply_markup: keyboard
      });
    }

    // Для сотрудника ресторана сразу показываем выбор времени
    await showTimeSelection(ctx, restaurantId);
    
  } catch (error) {
    logger.error('Error in setAutoSendTime:', error);
    ctx.reply('❌ Произошла ошибка при настройке времени отправки');
  }
};

// Показ выбора времени
const showTimeSelection = async (ctx, restaurantId) => {
  const currentTime = await Settings.getAutoSendTime(restaurantId);
  const restaurant = await Restaurant.findByPk(restaurantId);
  
  // Предустановленные варианты времени
  const times = [
    '00:00', '01:00', '02:00', '06:00', 
    '08:00', '10:00', '12:00', '14:00',
    '16:00', '18:00', '20:00', '22:00'
  ];
  
  const keyboard = {
    inline_keyboard: []
  };
  
  // Создаем кнопки по 3 в ряд
  for (let i = 0; i < times.length; i += 3) {
    const row = [];
    for (let j = i; j < i + 3 && j < times.length; j++) {
      const time = times[j];
      row.push({
        text: time === currentTime ? `✅ ${time}` : time,
        callback_data: `set_time:${restaurantId}:${time}`
      });
    }
    keyboard.inline_keyboard.push(row);
  }
  
  // Кнопка для ввода произвольного времени
  keyboard.inline_keyboard.push([{
    text: '⌨️ Ввести другое время',
    callback_data: `set_time_custom:${restaurantId}`
  }]);
  
  // Кнопка отключения автоотправки
  const isEnabled = await Settings.isAutoSendEnabled(restaurantId);
  keyboard.inline_keyboard.push([{
    text: isEnabled ? '🔴 Отключить автоотправку' : '🟢 Включить автоотправку',
    callback_data: `toggle_auto_send:${restaurantId}`
  }]);
  
  keyboard.inline_keyboard.push([{
    text: '❌ Отмена',
    callback_data: 'cancel_settings'
  }]);
  
  const message = `⏰ <b>Настройка автоматической отправки</b>\n\n` +
    `🏢 Ресторан: ${restaurant.name}\n` +
    `📅 Текущее время отправки: ${currentTime}\n` +
    `${isEnabled ? '✅ Автоотправка включена' : '🔴 Автоотправка отключена'}\n\n` +
    `Выберите время автоматической отправки заказов:`;
  
  if (ctx.callbackQuery) {
    await ctx.editMessageText(message, {
      reply_markup: keyboard,
      parse_mode: 'HTML'
    });
  } else {
    await ctx.reply(message, {
      reply_markup: keyboard,
      parse_mode: 'HTML'
    });
  }
};

// Обработчик выбора ресторана для настройки
const handleRestaurantSelection = async (ctx) => {
  const restaurantId = parseInt(ctx.match[1]);
  await ctx.answerCbQuery();
  await showTimeSelection(ctx, restaurantId);
};

// Обработчик выбора времени
const handleTimeSelection = async (ctx) => {
  try {
    const [restaurantId, time] = ctx.match[1].split(':');
    
    await Settings.setAutoSendTime(parseInt(restaurantId), time);
    
    // Обновляем расписание в планировщике
    await orderSchedulerService.updateRestaurantSchedule(parseInt(restaurantId));
    
    await ctx.answerCbQuery('✅ Время отправки обновлено');
    
    const restaurant = await Restaurant.findByPk(restaurantId);
    await ctx.editMessageText(
      `✅ <b>Настройки сохранены</b>\n\n` +
      `🏢 Ресторан: ${restaurant.name}\n` +
      `⏰ Время автоматической отправки: ${time}\n\n` +
      `Все черновики заказов будут автоматически отправляться каждый день в указанное время.`,
      { parse_mode: 'HTML' }
    );
    
  } catch (error) {
    logger.error('Error in handleTimeSelection:', error);
    await ctx.answerCbQuery('❌ Ошибка при сохранении настроек');
  }
};

// Обработчик ввода произвольного времени
const handleCustomTimeRequest = async (ctx) => {
  const restaurantId = ctx.match[1];
  
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '⌨️ <b>Введите время в формате ЧЧ:ММ</b>\n\n' +
    'Например: 09:30, 23:45, 00:00\n\n' +
    'Отправьте сообщение с временем или /cancel для отмены',
    { parse_mode: 'HTML' }
  );
  
  // Сохраняем состояние ожидания ввода времени
  ctx.session = ctx.session || {};
  ctx.session.awaitingTimeInput = {
    restaurantId: parseInt(restaurantId),
    action: 'set_auto_send_time'
  };
};

// Обработчик переключения автоотправки
const handleToggleAutoSend = async (ctx) => {
  try {
    const restaurantId = parseInt(ctx.match[1]);
    const currentState = await Settings.isAutoSendEnabled(restaurantId);
    const newState = !currentState;
    
    await Settings.setAutoSendEnabled(restaurantId, newState);
    
    // Обновляем расписание
    await orderSchedulerService.updateRestaurantSchedule(restaurantId);
    
    await ctx.answerCbQuery(
      newState ? '✅ Автоотправка включена' : '🔴 Автоотправка отключена'
    );
    
    // Обновляем меню
    await showTimeSelection(ctx, restaurantId);
    
  } catch (error) {
    logger.error('Error in handleToggleAutoSend:', error);
    await ctx.answerCbQuery('❌ Ошибка при изменении настроек');
  }
};

// Команда немедленной отправки
const sendOrdersNow = async (ctx) => {
  try {
    // Проверяем права
    if (!['manager', 'restaurant'].includes(ctx.user.role)) {
      return ctx.reply('⚠️ У вас нет прав для выполнения этой команды');
    }

    let restaurantId;
    
    if (ctx.user.role === 'restaurant') {
      if (!ctx.user.restaurant_id) {
        return ctx.reply('⚠️ Вы не привязаны к ресторану');
      }
      restaurantId = ctx.user.restaurant_id;
    } else {
      // Для менеджера нужно выбрать ресторан
      const restaurants = await Restaurant.findAll({ where: { is_active: true } });
      
      const keyboard = {
        inline_keyboard: restaurants.map(r => [{
          text: r.name,
          callback_data: `send_now:${r.id}`
        }])
      };
      
      keyboard.inline_keyboard.push([{
        text: '❌ Отмена',
        callback_data: 'cancel_settings'
      }]);
      
      return ctx.reply('🏢 Выберите ресторан для немедленной отправки заказов:', {
        reply_markup: keyboard
      });
    }

    // Выполняем немедленную отправку
    await executeImmediateSend(ctx, restaurantId);
    
  } catch (error) {
    logger.error('Error in sendOrdersNow:', error);
    ctx.reply('❌ Произошла ошибка при отправке заказов');
  }
};

// Выполнение немедленной отправки
const executeImmediateSend = async (ctx, restaurantId) => {
  const restaurant = await Restaurant.findByPk(restaurantId);
  
  await ctx.reply(
    `🚀 Начинаю отправку заказов для ресторана "${restaurant.name}"...`,
    { parse_mode: 'HTML' }
  );
  
  try {
    await orderSchedulerService.sendOrdersNow(restaurantId);
    
    await ctx.reply(
      `✅ <b>Заказы успешно отправлены!</b>\n\n` +
      `🏢 Ресторан: ${restaurant.name}\n` +
      `📅 Время отправки: ${formatInTimezone(new Date())}\n\n` +
      `Все черновики были отправлены на обработку.`,
      { parse_mode: 'HTML' }
    );
    
  } catch (error) {
    logger.error('Error in executeImmediateSend:', error);
    await ctx.reply(
      `❌ <b>Ошибка при отправке заказов</b>\n\n` +
      `${error.message}`,
      { parse_mode: 'HTML' }
    );
  }
};

// Обработчик немедленной отправки для выбранного ресторана
const handleSendNow = async (ctx) => {
  const restaurantId = parseInt(ctx.match[1]);
  await ctx.answerCbQuery();
  await executeImmediateSend(ctx, restaurantId);
};

// Обработчик текстового ввода времени
const handleTimeTextInput = async (ctx) => {
  if (!ctx.session?.awaitingTimeInput) {
    return false;
  }

  const text = ctx.message.text;
  
  // Проверка формата времени
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
  if (!timeRegex.test(text)) {
    await ctx.reply(
      '⚠️ Неверный формат времени. Используйте формат ЧЧ:ММ\n' +
      'Например: 09:30, 23:45, 00:00'
    );
    return true;
  }

  const { restaurantId } = ctx.session.awaitingTimeInput;
  
  try {
    await Settings.setAutoSendTime(restaurantId, text);
    await orderSchedulerService.updateRestaurantSchedule(restaurantId);
    
    const restaurant = await Restaurant.findByPk(restaurantId);
    await ctx.reply(
      `✅ <b>Время отправки установлено</b>\n\n` +
      `🏢 Ресторан: ${restaurant.name}\n` +
      `⏰ Время: ${text}\n\n` +
      `Заказы будут автоматически отправляться каждый день в указанное время.`,
      { parse_mode: 'HTML' }
    );
    
    delete ctx.session.awaitingTimeInput;
    
  } catch (error) {
    logger.error('Error setting custom time:', error);
    await ctx.reply('❌ Ошибка при сохранении времени');
  }
  
  return true;
};

// Отмена настроек
const handleCancelSettings = async (ctx) => {
  await ctx.answerCbQuery('Настройка отменена');
  await ctx.deleteMessage();
};

// Команда просмотра текущих настроек
const viewSettings = async (ctx) => {
  try {
    let restaurantId;
    
    if (ctx.user.role === 'restaurant') {
      if (!ctx.user.restaurant_id) {
        return ctx.reply('⚠️ Вы не привязаны к ресторану');
      }
      restaurantId = ctx.user.restaurant_id;
    } else if (ctx.user.role === 'manager') {
      // Показываем настройки всех ресторанов
      const restaurants = await Restaurant.findAll({ 
        where: { is_active: true },
        order: [['name', 'ASC']]
      });
      
      let message = '⚙️ <b>Настройки автоматической отправки</b>\n\n';
      
      for (const restaurant of restaurants) {
        const isEnabled = await Settings.isAutoSendEnabled(restaurant.id);
        const sendTime = await Settings.getAutoSendTime(restaurant.id);
        const scheduleInfo = orderSchedulerService.getScheduleInfo(restaurant.id);
        
        message += `🏢 <b>${restaurant.name}</b>\n`;
        message += `${isEnabled ? '✅' : '🔴'} Автоотправка: ${isEnabled ? 'включена' : 'отключена'}\n`;
        message += `⏰ Время: ${sendTime}\n`;
        message += `📅 Запланировано: ${scheduleInfo.scheduled ? 'да' : 'нет'}\n\n`;
      }
      
      return ctx.reply(message, { parse_mode: 'HTML' });
    } else {
      return ctx.reply('⚠️ У вас нет доступа к настройкам');
    }

    // Для сотрудника ресторана
    const restaurant = await Restaurant.findByPk(restaurantId);
    const isEnabled = await Settings.isAutoSendEnabled(restaurantId);
    const sendTime = await Settings.getAutoSendTime(restaurantId);
    const scheduleInfo = orderSchedulerService.getScheduleInfo(restaurantId);
    
    const message = `⚙️ <b>Настройки автоматической отправки</b>\n\n` +
      `🏢 Ресторан: ${restaurant.name}\n` +
      `${isEnabled ? '✅' : '🔴'} Статус: ${isEnabled ? 'включена' : 'отключена'}\n` +
      `⏰ Время отправки: ${sendTime}\n` +
      `📅 Запланировано: ${scheduleInfo.scheduled ? 'да' : 'нет'}\n\n` +
      `Используйте:\n` +
      `/set_send_time - изменить время отправки\n` +
      `/send_now - отправить заказы прямо сейчас`;
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    logger.error('Error in viewSettings:', error);
    ctx.reply('❌ Ошибка при получении настроек');
  }
};

module.exports = {
  setAutoSendTime,
  sendOrdersNow,
  viewSettings,
  handleRestaurantSelection,
  handleTimeSelection,
  handleCustomTimeRequest,
  handleToggleAutoSend,
  handleSendNow,
  handleCancelSettings,
  handleTimeTextInput
};