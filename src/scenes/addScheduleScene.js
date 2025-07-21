const { Scenes } = require('telegraf');
const { Restaurant, ScheduledOrder } = require('../database/models');
const logger = require('../utils/logger');

const addScheduleScene = new Scenes.WizardScene(
  'add_schedule',
  // Шаг 1: Выбор ресторана
  async (ctx) => {
    try {
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
  
  // Шаг 2: Выбор времени
  async (ctx) => {
    if (ctx.callbackQuery?.data === 'cancel') {
      await ctx.answerCbQuery('Отменено');
      await ctx.deleteMessage();
      return ctx.scene.leave();
    }
    
    if (ctx.callbackQuery?.data?.startsWith('schedule_restaurant_')) {
      const restaurantId = parseInt(ctx.callbackQuery.data.split('_')[2]);
      ctx.wizard.state.restaurantId = restaurantId;
      
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        '⏰ <b>Введите время отправки заказа</b>\n\n' +
        'Формат: ЧЧ:ММ (например, 09:00 или 18:30)',
        { parse_mode: 'HTML' }
      );
      
      return ctx.wizard.next();
    }
  },
  
  // Шаг 3: Выбор дней недели
  async (ctx) => {
    if (!ctx.message?.text) return;
    
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    const match = ctx.message.text.match(timeRegex);
    
    if (!match) {
      await ctx.reply('❌ Неверный формат времени. Используйте формат ЧЧ:ММ');
      return;
    }
    
    ctx.wizard.state.scheduleTime = ctx.message.text;
    
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
  },
  
  // Шаг 4: Подтверждение и сохранение
  async (ctx) => {
    if (ctx.callbackQuery?.data === 'cancel') {
      await ctx.answerCbQuery('Отменено');
      await ctx.deleteMessage();
      return ctx.scene.leave();
    }
    
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
    
    if (ctx.callbackQuery?.data === 'confirm_days') {
      const selectedDays = ctx.wizard.state.selectedDays || [];
      
      if (selectedDays.length === 0) {
        await ctx.answerCbQuery('Выберите хотя бы один день недели!', { show_alert: true });
        return;
      }
      
      try {
        const restaurant = ctx.wizard.state.restaurants.find(
          r => r.id === ctx.wizard.state.restaurantId
        );
        
        // Получаем пользователя по telegram_id
        const { User } = require('../database/models');
        const user = await User.findOne({
          where: { telegram_id: ctx.from.id.toString() }
        });
        
        // Создаем запись расписания
        await ScheduledOrder.create({
          restaurant_id: ctx.wizard.state.restaurantId,
          schedule_time: ctx.wizard.state.scheduleTime,
          schedule_days: JSON.stringify(selectedDays),
          is_active: true,
          created_by: user ? user.id : null
        });
        
        const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
        const selectedDaysStr = selectedDays
          .sort((a, b) => a - b)
          .map(d => days[d])
          .join(', ');
        
        await ctx.answerCbQuery('✅ Расписание создано');
        await ctx.editMessageText(
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
  }
);

module.exports = addScheduleScene;