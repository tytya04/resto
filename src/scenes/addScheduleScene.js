const { Scenes } = require('telegraf');
const { Restaurant, ScheduledOrder } = require('../database/models');
const logger = require('../utils/logger');

const addScheduleScene = new Scenes.WizardScene(
  'add_schedule',
  // Шаг 1: Выбор ресторана
  async (ctx) => {
    try {
      // Проверяем, передан ли restaurantId из контекста менеджера
      const passedRestaurantId = ctx.scene.state?.restaurantId;
      
      if (passedRestaurantId) {
        // Если ID передан, сразу используем этот ресторан
        const restaurant = await Restaurant.findByPk(passedRestaurantId);
        
        if (!restaurant || !restaurant.is_active) {
          await ctx.reply('❌ Ресторан не найден или неактивен.');
          return ctx.scene.leave();
        }
        
        ctx.wizard.state.selectedRestaurantId = restaurant.id;
        ctx.wizard.state.selectedRestaurantName = restaurant.name;
        
        // Сразу переходим к выбору времени
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Отмена', callback_data: 'cancel' }]
            ]
          }
        };
        
        await ctx.reply(
          `📅 <b>Настройка расписания для ресторана "${restaurant.name}"</b>\n\n` +
          `Введите время отправки заказа в формате ЧЧ:ММ\n` +
          `Например: 09:00\n\n` +
          `<i>Для отмены введите /cancel</i>`,
          { parse_mode: 'HTML', ...keyboard }
        );
        
        return ctx.wizard.next();
      }
      
      // Если ID не передан, показываем список ресторанов (для админа)
      const restaurants = await Restaurant.findAll({
        where: { is_active: true },
        order: [['name', 'ASC']]
      });
      
      if (restaurants.length === 0) {
        await ctx.reply('❌ Нет активных ресторанов для создания расписания.');
        return ctx.scene.leave();
      }
      
      ctx.wizard.state.restaurants = restaurants;
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: restaurants.map(r => [
            { text: r.name, callback_data: `schedule_restaurant_${r.id}` }
          ]).concat([[{ text: '❌ Отмена', callback_data: 'cancel' }]])
        }
      };
      
      await ctx.reply(
        '🏢 <b>Выберите ресторан для расписания:</b>',
        { parse_mode: 'HTML', ...keyboard }
      );
      
      return ctx.wizard.next();
    } catch (error) {
      logger.error('Error in addScheduleScene step 1:', error);
      await ctx.reply('Произошла ошибка. Попробуйте позже.');
      return ctx.scene.leave();
    }
  },
  
  // Шаг 2: Обработка времени (для случая когда ресторан уже выбран) или выбор ресторана
  async (ctx) => {
    // Обработка отмены
    if (ctx.callbackQuery?.data === 'cancel' || ctx.message?.text === '/cancel') {
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery('Отменено');
        await ctx.deleteMessage();
      } else {
        await ctx.reply('❌ Отменено');
      }
      return ctx.scene.leave();
    }
    
    // Если это callback с выбором ресторана
    if (ctx.callbackQuery?.data?.startsWith('schedule_restaurant_')) {
      const restaurantId = parseInt(ctx.callbackQuery.data.split('_')[2]);
      ctx.wizard.state.selectedRestaurantId = restaurantId;
      
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        '⏰ <b>Введите время отправки заказа</b>\n\n' +
        'Формат: ЧЧ:ММ (например, 09:00 или 18:30)',
        { parse_mode: 'HTML' }
      );
      
      return ctx.wizard.next();
    }
    
    // Если это текст с временем (когда ресторан уже был выбран на шаге 1)
    if (ctx.message?.text) {
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
      const match = ctx.message.text.match(timeRegex);
      
      if (!match) {
        await ctx.reply('❌ Неверный формат времени. Используйте формат ЧЧ:ММ (например, 09:00)');
        return;
      }
      
      ctx.wizard.state.scheduleTime = ctx.message.text;
      
      // Переходим к выбору дней недели
      const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      ctx.wizard.state.selectedDays = [];
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            days.slice(0, 4).map((day, i) => ({
              text: day,
              callback_data: `day_${i + 1}`
            })),
            days.slice(4, 7).map((day, i) => ({
              text: day,
              callback_data: `day_${i + 5}`
            })),
            [{ text: '✅ Подтвердить', callback_data: 'confirm_days' }],
            [{ text: '❌ Отмена', callback_data: 'cancel' }]
          ]
        }
      };
      
      await ctx.reply(
        '📅 <b>Выберите дни недели для автоматической отправки:</b>\n\n' +
        'Нажмите на дни, чтобы выбрать их',
        { parse_mode: 'HTML', ...keyboard }
      );
      
      return ctx.wizard.next();
    }
  },
  
  // Шаг 3: Обработка выбора дней недели
  async (ctx) => {
    // Обработка отмены
    if (ctx.callbackQuery?.data === 'cancel') {
      await ctx.answerCbQuery('Отменено');
      await ctx.deleteMessage();
      return ctx.scene.leave();
    }
    
    // Обработка выбора дня
    if (ctx.callbackQuery?.data?.startsWith('day_')) {
      const dayNum = parseInt(ctx.callbackQuery.data.split('_')[1]);
      const selectedDays = ctx.wizard.state.selectedDays || [];
      
      const index = selectedDays.indexOf(dayNum);
      if (index > -1) {
        selectedDays.splice(index, 1);
      } else {
        selectedDays.push(dayNum);
      }
      
      ctx.wizard.state.selectedDays = selectedDays;
      
      const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            days.slice(0, 4).map((day, i) => ({
              text: selectedDays.includes(i + 1) ? `✅ ${day}` : day,
              callback_data: `day_${i + 1}`
            })),
            days.slice(4, 7).map((day, i) => ({
              text: selectedDays.includes(i + 5) ? `✅ ${day}` : day,
              callback_data: `day_${i + 5}`
            })),
            [{ text: '✅ Подтвердить', callback_data: 'confirm_days' }],
            [{ text: '❌ Отмена', callback_data: 'cancel' }]
          ]
        }
      };
      
      await ctx.answerCbQuery();
      await ctx.editMessageReplyMarkup(keyboard.reply_markup);
      return;
    }
    
    // Подтверждение выбора дней
    if (ctx.callbackQuery?.data === 'confirm_days') {
      const selectedDays = ctx.wizard.state.selectedDays || [];
      
      if (selectedDays.length === 0) {
        await ctx.answerCbQuery('Выберите хотя бы один день недели!', { show_alert: true });
        return;
      }
      
      await ctx.answerCbQuery();
      return ctx.wizard.next();
    }
  },
  
  // Шаг 4: Сохранение расписания
  async (ctx) => {
    try {
      const selectedDays = ctx.wizard.state.selectedDays || [];
      const restaurantId = ctx.wizard.state.selectedRestaurantId || ctx.wizard.state.restaurantId;
      
      // Получаем пользователя по telegram_id
      const { User } = require('../database/models');
      const user = await User.findOne({
        where: { telegram_id: ctx.from.id.toString() }
      });
      
      // Создаем запись расписания
      await ScheduledOrder.create({
        restaurant_id: restaurantId,
        schedule_time: ctx.wizard.state.scheduleTime,
        schedule_days: JSON.stringify(selectedDays),
        is_active: true,
        created_by: user ? user.id : null
      });
      
      // Обновляем планировщик
      const orderSchedulerService = require('../services/OrderSchedulerService');
      await orderSchedulerService.updateRestaurantSchedule(restaurantId);
      
      // Получаем информацию о ресторане
      const restaurant = await Restaurant.findByPk(restaurantId);
      
      const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      const selectedDaysStr = selectedDays
        .sort((a, b) => a - b)
        .map(d => days[d - 1])
        .join(', ');
      
      await ctx.deleteMessage();
      await ctx.reply(
          `✅ <b>Расписание успешно создано!</b>\n\n` +
          `🏢 Ресторан: ${restaurant.name}\n` +
          `⏰ Время: ${ctx.wizard.state.scheduleTime}\n` +
          `📅 Дни: ${selectedDaysStr}`,
          { parse_mode: 'HTML' }
        );
        
        // Расписание будет загружено при следующем запуске бота
        
        return ctx.scene.leave();
      } catch (error) {
        logger.error('Error saving schedule:', error);
        await ctx.reply('❌ Ошибка при сохранении расписания');
        return ctx.scene.leave();
      }
  }
);

module.exports = addScheduleScene;