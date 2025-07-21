const { Scenes } = require('telegraf');
const { Restaurant } = require('../database/models');
const logger = require('../utils/logger');

const addRestaurantScene = new Scenes.BaseScene('add_restaurant');

// Вход в сцену
addRestaurantScene.enter(async (ctx) => {
  ctx.scene.state.restaurantData = {};
  ctx.scene.state.step = 'name';
  
  await ctx.reply(
    '🏢 <b>Добавление нового ресторана</b>\n\n' +
    'Шаг 1 из 4: Введите название ресторана\n\n' +
    'Для отмены введите /cancel',
    { parse_mode: 'HTML' }
  );
});

// Обработка текстового ввода
addRestaurantScene.on('text', async (ctx) => {
  const text = ctx.message.text;
  
  if (text === '/cancel') {
    await ctx.reply('❌ Добавление ресторана отменено');
    return ctx.scene.leave();
  }
  
  const { step, restaurantData } = ctx.scene.state;
  
  switch (step) {
    case 'name':
      if (text.length < 2) {
        return ctx.reply('⚠️ Название должно содержать минимум 2 символа');
      }
      
      // Проверяем уникальность названия
      const existing = await Restaurant.findOne({ where: { name: text } });
      if (existing) {
        return ctx.reply('⚠️ Ресторан с таким названием уже существует');
      }
      
      restaurantData.name = text;
      ctx.scene.state.step = 'address';
      
      await ctx.reply(
        'Шаг 2 из 4: Введите адрес ресторана\n\n' +
        'Или введите "пропустить" чтобы оставить поле пустым'
      );
      break;
      
    case 'address':
      if (text.toLowerCase() !== 'пропустить') {
        restaurantData.address = text;
      }
      ctx.scene.state.step = 'phone';
      
      await ctx.reply(
        'Шаг 3 из 4: Введите телефон ресторана\n\n' +
        'Или введите "пропустить" чтобы оставить поле пустым'
      );
      break;
      
    case 'phone':
      if (text.toLowerCase() !== 'пропустить') {
        const phoneRegex = /^[\d\s\-\+\(\)]+$/;
        if (!phoneRegex.test(text)) {
          return ctx.reply('⚠️ Введите корректный номер телефона');
        }
        restaurantData.phone = text;
      }
      ctx.scene.state.step = 'email';
      
      await ctx.reply(
        'Шаг 4 из 4: Введите email ресторана\n\n' +
        'Или введите "пропустить" чтобы оставить поле пустым'
      );
      break;
      
    case 'email':
      if (text.toLowerCase() !== 'пропустить') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(text)) {
          return ctx.reply('⚠️ Введите корректный email адрес');
        }
        restaurantData.email = text;
      }
      
      // Подтверждение данных
      await showConfirmation(ctx);
      break;
      
    case 'confirm':
      if (text.toLowerCase() === 'да') {
        await createRestaurant(ctx);
      } else if (text.toLowerCase() === 'нет') {
        await ctx.reply('❌ Добавление ресторана отменено');
        return ctx.scene.leave();
      } else {
        await ctx.reply('Введите "да" для подтверждения или "нет" для отмены');
      }
      break;
  }
});

// Показ подтверждения
async function showConfirmation(ctx) {
  const { restaurantData } = ctx.scene.state;
  
  let message = '📋 <b>Проверьте введенные данные:</b>\n\n';
  message += `<b>Название:</b> ${restaurantData.name}\n`;
  message += `<b>Адрес:</b> ${restaurantData.address || 'не указан'}\n`;
  message += `<b>Телефон:</b> ${restaurantData.phone || 'не указан'}\n`;
  message += `<b>Email:</b> ${restaurantData.email || 'не указан'}\n\n`;
  message += 'Все верно? Введите "да" или "нет"';
  
  ctx.scene.state.step = 'confirm';
  await ctx.reply(message, { parse_mode: 'HTML' });
}

// Создание ресторана
async function createRestaurant(ctx) {
  const { restaurantData } = ctx.scene.state;
  
  try {
    const restaurant = await Restaurant.create({
      ...restaurantData,
      is_active: true
    });
    
    await ctx.reply(
      '✅ <b>Ресторан успешно добавлен!</b>\n\n' +
      `ID: ${restaurant.id}\n` +
      `Название: ${restaurant.name}\n` +
      `Адрес: ${restaurant.address || 'не указан'}\n` +
      `Телефон: ${restaurant.phone || 'не указан'}\n` +
      `Email: ${restaurant.email || 'не указан'}\n\n` +
      `Команда для управления: /restaurant_${restaurant.id}`,
      { parse_mode: 'HTML' }
    );
    
    // Возвращаемся к списку ресторанов
    const adminHandlers = require('../handlers/adminHandlers');
    await adminHandlers.restaurantsList(ctx);
    
    return ctx.scene.leave();
  } catch (error) {
    logger.error('Error creating restaurant:', error);
    await ctx.reply('❌ Произошла ошибка при создании ресторана');
    return ctx.scene.leave();
  }
}

module.exports = addRestaurantScene;