const { Scenes } = require('telegraf');
const { Restaurant } = require('../database/models');
const logger = require('../utils/logger');

const editRestaurantScene = new Scenes.BaseScene('edit_restaurant');

// Вход в сцену
editRestaurantScene.enter(async (ctx) => {
  const restaurantId = ctx.scene.state.restaurantId;
  
  if (!restaurantId) {
    await ctx.reply('❌ Ошибка: не указан ID ресторана');
    return ctx.scene.leave();
  }
  
  const restaurant = await Restaurant.findByPk(restaurantId);
  if (!restaurant) {
    await ctx.reply('❌ Ресторан не найден');
    return ctx.scene.leave();
  }
  
  ctx.scene.state.restaurant = restaurant;
  ctx.scene.state.editData = {};
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Название', callback_data: 'edit_rest_name' }],
        [{ text: '📍 Адрес', callback_data: 'edit_rest_address' }],
        [{ text: '📞 Телефон', callback_data: 'edit_rest_phone' }],
        [{ text: '📧 Email', callback_data: 'edit_rest_email' }],
        [{ text: '✅ Сохранить изменения', callback_data: 'edit_rest_save' }],
        [{ text: '❌ Отмена', callback_data: 'edit_rest_cancel' }]
      ]
    }
  };
  
  await ctx.reply(
    `🏢 <b>Редактирование ресторана</b>\n\n` +
    `<b>Текущие данные:</b>\n` +
    `Название: ${restaurant.name}\n` +
    `Адрес: ${restaurant.address || 'не указан'}\n` +
    `Телефон: ${restaurant.phone || 'не указан'}\n` +
    `Email: ${restaurant.email || 'не указан'}\n\n` +
    `Выберите, что хотите изменить:`,
    { parse_mode: 'HTML', ...keyboard }
  );
});

// Обработка callback-запросов
editRestaurantScene.on('callback_query', async (ctx) => {
  const action = ctx.callbackQuery.data;
  
  await ctx.answerCbQuery();
  
  switch (action) {
    case 'edit_rest_name':
      ctx.scene.state.editField = 'name';
      await ctx.reply('Введите новое название ресторана:');
      break;
      
    case 'edit_rest_address':
      ctx.scene.state.editField = 'address';
      await ctx.reply('Введите новый адрес ресторана:');
      break;
      
    case 'edit_rest_phone':
      ctx.scene.state.editField = 'phone';
      await ctx.reply('Введите новый телефон ресторана:');
      break;
      
    case 'edit_rest_email':
      ctx.scene.state.editField = 'email';
      await ctx.reply('Введите новый email ресторана:');
      break;
      
    case 'edit_rest_save':
      await saveRestaurantChanges(ctx);
      break;
      
    case 'edit_rest_cancel':
      await ctx.reply('❌ Редактирование отменено');
      return ctx.scene.leave();
  }
});

// Обработка текстового ввода
editRestaurantScene.on('text', async (ctx) => {
  const field = ctx.scene.state.editField;
  const value = ctx.message.text;
  
  if (!field) {
    return ctx.reply('Выберите поле для редактирования из меню выше');
  }
  
  // Валидация email
  if (field === 'email' && value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return ctx.reply('⚠️ Введите корректный email адрес');
    }
  }
  
  // Валидация телефона
  if (field === 'phone' && value) {
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    if (!phoneRegex.test(value)) {
      return ctx.reply('⚠️ Введите корректный номер телефона');
    }
  }
  
  ctx.scene.state.editData[field] = value;
  ctx.scene.state.editField = null;
  
  await ctx.reply(
    `✅ Значение поля "${getFieldName(field)}" изменено на: ${value}\n\n` +
    'Выберите следующее поле для редактирования или нажмите "Сохранить изменения"'
  );
  
  // Показываем обновленное меню
  return ctx.scene.reenter();
});

// Функция сохранения изменений
async function saveRestaurantChanges(ctx) {
  const { restaurant, editData } = ctx.scene.state;
  
  if (Object.keys(editData).length === 0) {
    await ctx.reply('⚠️ Нет изменений для сохранения');
    return;
  }
  
  try {
    // Обновляем данные ресторана
    await restaurant.update(editData);
    
    let message = '✅ <b>Изменения сохранены успешно!</b>\n\n';
    message += '<b>Обновленные поля:</b>\n';
    
    for (const [field, value] of Object.entries(editData)) {
      message += `${getFieldName(field)}: ${value}\n`;
    }
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
    // Возвращаемся к управлению рестораном
    const adminHandlers = require('../handlers/adminHandlers');
    await adminHandlers.restaurantManagement(ctx, restaurant.id);
    
    return ctx.scene.leave();
  } catch (error) {
    logger.error('Error saving restaurant changes:', error);
    await ctx.reply('❌ Произошла ошибка при сохранении изменений');
  }
}

// Вспомогательная функция для получения названия поля
function getFieldName(field) {
  const fieldNames = {
    name: 'Название',
    address: 'Адрес',
    phone: 'Телефон',
    email: 'Email'
  };
  return fieldNames[field] || field;
}

module.exports = editRestaurantScene;