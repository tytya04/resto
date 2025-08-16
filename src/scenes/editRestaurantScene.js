const { Scenes } = require('telegraf');
const { Restaurant } = require('../database/models');
const logger = require('../utils/logger');

const editRestaurantScene = new Scenes.BaseScene('edit_restaurant');

// Вход в сцену
editRestaurantScene.enter(async (ctx) => {
  const restaurantId = ctx.scene.state.restaurantId || ctx.scene.session?.restaurantId || ctx.session?.editingRestaurantId;
  
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
  ctx.scene.state.editData = ctx.scene.state.editData || {};
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Название', callback_data: 'edit_rest_name' }],
        [{ text: '📍 Адрес', callback_data: 'edit_rest_address' }],
        [{ text: '📞 Телефон', callback_data: 'edit_rest_phone' }],
        [{ text: '📧 Email', callback_data: 'edit_rest_email' }],
        [{ text: '🏢 Юридическое название', callback_data: 'edit_rest_legal_name' }],
        [{ text: '🆔 ИНН', callback_data: 'edit_rest_inn' }],
        [{ text: '🔢 КПП', callback_data: 'edit_rest_kpp' }],
        [{ text: '🏦 Банковские реквизиты', callback_data: 'edit_rest_bank' }],
        [{ text: '👨‍💼 Директор', callback_data: 'edit_rest_director' }],
        [{ text: '👩‍💼 Главный бухгалтер', callback_data: 'edit_rest_accountant' }],
        [{ text: '✅ Сохранить изменения', callback_data: 'edit_rest_save' }],
        [{ text: '❌ Отмена', callback_data: 'edit_rest_cancel' }]
      ]
    }
  };
  
  // Объединяем данные из базы с временными изменениями
  const editData = ctx.scene.state.editData || {};
  const currentData = {
    name: editData.name || restaurant.name,
    legal_name: editData.legal_name || restaurant.legal_name,
    address: editData.address || restaurant.address,
    contact_phone: editData.contact_phone || restaurant.contact_phone,
    contact_email: editData.contact_email || restaurant.contact_email,
    inn: editData.inn || restaurant.inn,
    kpp: editData.kpp || restaurant.kpp,
    bank_name: editData.bank_name || restaurant.bank_name,
    bank_account: editData.bank_account || restaurant.bank_account,
    director_name: editData.director_name || restaurant.director_name,
    accountant_name: editData.accountant_name || restaurant.accountant_name
  };
  
  logger.info('Displaying restaurant data:', {
    restaurantId: restaurant.id,
    editData,
    currentData: { inn: currentData.inn, kpp: currentData.kpp }
  });

  await ctx.reply(
    `🏢 <b>Редактирование ресторана</b>\n\n` +
    `<b>Основные данные:</b>\n` +
    `📝 Название: ${currentData.name || 'не указано'}\n` +
    `🏢 Юр. название: ${currentData.legal_name || 'не указано'}\n` +
    `📍 Адрес: ${currentData.address || 'не указан'}\n` +
    `📞 Телефон: ${currentData.contact_phone || 'не указан'}\n` +
    `📧 Email: ${currentData.contact_email || 'не указан'}\n\n` +
    `<b>Реквизиты:</b>\n` +
    `🆔 ИНН: ${currentData.inn || 'не указан'}\n` +
    `🔢 КПП: ${currentData.kpp || 'не указан'}\n` +
    `🏦 Банк: ${currentData.bank_name || 'не указан'}\n` +
    `💳 Р/с: ${currentData.bank_account || 'не указан'}\n` +
    `👨‍💼 Директор: ${currentData.director_name || 'не указан'}\n` +
    `👩‍💼 Гл. бухгалтер: ${currentData.accountant_name || 'не указан'}\n\n` +
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
      ctx.scene.state.editField = 'contact_phone';
      await ctx.reply('Введите новый телефон ресторана:');
      break;
      
    case 'edit_rest_email':
      ctx.scene.state.editField = 'contact_email';
      await ctx.reply('Введите новый email ресторана:');
      break;
      
    case 'edit_rest_legal_name':
      ctx.scene.state.editField = 'legal_name';
      await ctx.reply('Введите полное юридическое название ресторана:');
      break;
      
    case 'edit_rest_inn':
      ctx.scene.state.editField = 'inn';
      await ctx.reply('Введите ИНН (10 или 12 цифр):');
      break;
      
    case 'edit_rest_kpp':
      ctx.scene.state.editField = 'kpp';
      await ctx.reply('Введите КПП (9 цифр):');
      break;
      
    case 'edit_rest_bank':
      ctx.scene.state.editField = 'bank_info';
      await ctx.reply(
        'Введите банковские реквизиты в формате:\n\n' +
        'Название банка\n' +
        'БИК: 123456789\n' +
        'Р/с: 12345678901234567890\n' +
        'К/с: 12345678901234567890'
      );
      break;
      
    case 'edit_rest_director':
      ctx.scene.state.editField = 'director_name';
      await ctx.reply('Введите ФИО директора:');
      break;
      
    case 'edit_rest_accountant':
      ctx.scene.state.editField = 'accountant_name';
      await ctx.reply('Введите ФИО главного бухгалтера:');
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
  
  logger.info('Text input in scene:', { 
    field, 
    value, 
    hasEditData: !!ctx.scene.state.editData,
    editDataKeys: ctx.scene.state.editData ? Object.keys(ctx.scene.state.editData) : []
  });
  
  if (!field) {
    return ctx.reply('Выберите поле для редактирования из меню выше');
  }
  
  // Валидация email
  if (field === 'contact_email' && value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return ctx.reply('⚠️ Введите корректный email адрес');
    }
  }
  
  // Валидация телефона
  if (field === 'contact_phone' && value) {
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    if (!phoneRegex.test(value)) {
      return ctx.reply('⚠️ Введите корректный номер телефона');
    }
  }
  
  // Валидация ИНН
  if (field === 'inn' && value) {
    const innRegex = /^\d{10}|\d{12}$/;
    if (!innRegex.test(value)) {
      return ctx.reply('⚠️ ИНН должен содержать 10 или 12 цифр');
    }
  }
  
  // Валидация КПП
  if (field === 'kpp' && value) {
    const kppRegex = /^\d{9}$/;
    if (!kppRegex.test(value)) {
      return ctx.reply('⚠️ КПП должен содержать 9 цифр');
    }
  }
  
  // Обработка банковских реквизитов
  if (field === 'bank_info' && value) {
    const lines = value.split('\n').map(line => line.trim());
    const bankData = {};
    
    // Парсим банковскую информацию
    for (const line of lines) {
      if (line.toLowerCase().includes('бик:')) {
        bankData.bank_bik = line.replace(/.*бик:\s*/i, '');
      } else if (line.toLowerCase().includes('р/с:')) {
        bankData.bank_account = line.replace(/.*р\/с:\s*/i, '');
      } else if (line.toLowerCase().includes('к/с:')) {
        bankData.bank_corr_account = line.replace(/.*к\/с:\s*/i, '');
      } else if (!bankData.bank_name && line && !line.includes(':')) {
        bankData.bank_name = line;
      }
    }
    
    // Сохраняем все банковские поля
    Object.assign(ctx.scene.state.editData, bankData);
    ctx.scene.state.editField = null;
    
    await ctx.reply(
      `✅ Банковские реквизиты обновлены:\n` +
      `Банк: ${bankData.bank_name || 'не указан'}\n` +
      `БИК: ${bankData.bank_bik || 'не указан'}\n` +
      `Р/с: ${bankData.bank_account || 'не указан'}\n` +
      `К/с: ${bankData.bank_corr_account || 'не указан'}\n\n` +
      'Выберите следующее поле для редактирования или нажмите "Сохранить изменения"'
    );
    return;
  }
  
  ctx.scene.state.editData[field] = value;
  ctx.scene.state.editField = null;
  
  logger.info('Field value updated in editData:', { 
    field, 
    value, 
    editDataAfter: ctx.scene.state.editData 
  });
  
  await ctx.reply(
    `✅ Значение поля "${getFieldName(field)}" изменено на: ${value}\n\n` +
    'Выберите следующее поле для редактирования или нажмите "Сохранить изменения"'
  );
  
  // Обновляем меню без reenter, чтобы сохранить editData
  const restaurant = ctx.scene.state.restaurant;
  const editData = ctx.scene.state.editData || {};
  const currentData = {
    name: editData.name || restaurant.name,
    legal_name: editData.legal_name || restaurant.legal_name,
    address: editData.address || restaurant.address,
    contact_phone: editData.contact_phone || restaurant.contact_phone,
    contact_email: editData.contact_email || restaurant.contact_email,
    inn: editData.inn || restaurant.inn,
    kpp: editData.kpp || restaurant.kpp,
    bank_name: editData.bank_name || restaurant.bank_name,
    bank_account: editData.bank_account || restaurant.bank_account,
    director_name: editData.director_name || restaurant.director_name,
    accountant_name: editData.accountant_name || restaurant.accountant_name
  };
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Название', callback_data: 'edit_rest_name' }],
        [{ text: '📍 Адрес', callback_data: 'edit_rest_address' }],
        [{ text: '📞 Телефон', callback_data: 'edit_rest_phone' }],
        [{ text: '📧 Email', callback_data: 'edit_rest_email' }],
        [{ text: '🏢 Юридическое название', callback_data: 'edit_rest_legal_name' }],
        [{ text: '🆔 ИНН', callback_data: 'edit_rest_inn' }],
        [{ text: '🔢 КПП', callback_data: 'edit_rest_kpp' }],
        [{ text: '🏦 Банковские реквизиты', callback_data: 'edit_rest_bank' }],
        [{ text: '👨‍💼 Директор', callback_data: 'edit_rest_director' }],
        [{ text: '👩‍💼 Главный бухгалтер', callback_data: 'edit_rest_accountant' }],
        [{ text: '✅ Сохранить изменения', callback_data: 'edit_rest_save' }],
        [{ text: '❌ Отмена', callback_data: 'edit_rest_cancel' }]
      ]
    }
  };
  
  logger.info('Showing updated restaurant data:', {
    restaurantId: restaurant.id,
    editData,
    currentData: { inn: currentData.inn, kpp: currentData.kpp }
  });

  return ctx.reply(
    `🏢 <b>Редактирование ресторана</b>\n\n` +
    `<b>Основные данные:</b>\n` +
    `📝 Название: ${currentData.name || 'не указано'}\n` +
    `🏢 Юр. название: ${currentData.legal_name || 'не указано'}\n` +
    `📍 Адрес: ${currentData.address || 'не указан'}\n` +
    `📞 Телефон: ${currentData.contact_phone || 'не указан'}\n` +
    `📧 Email: ${currentData.contact_email || 'не указан'}\n\n` +
    `<b>Реквизиты:</b>\n` +
    `🆔 ИНН: ${currentData.inn || 'не указан'}\n` +
    `🔢 КПП: ${currentData.kpp || 'не указан'}\n` +
    `🏦 Банк: ${currentData.bank_name || 'не указан'}\n` +
    `💳 Р/с: ${currentData.bank_account || 'не указан'}\n` +
    `👨‍💼 Директор: ${currentData.director_name || 'не указан'}\n` +
    `👩‍💼 Гл. бухгалтер: ${currentData.accountant_name || 'не указан'}\n\n` +
    `Выберите, что хотите изменить:`,
    { parse_mode: 'HTML', ...keyboard }
  );
});

// Функция сохранения изменений
async function saveRestaurantChanges(ctx) {
  const { restaurant, editData } = ctx.scene.state;
  
  if (Object.keys(editData).length === 0) {
    await ctx.reply('⚠️ Нет изменений для сохранения');
    return;
  }
  
  try {
    // Получаем информацию о пользователе для определения роли
    const { User } = require('../database/models');
    const user = await User.findOne({ where: { telegram_id: ctx.from.id } });
    
    logger.info('Saving restaurant changes:', { 
      restaurantId: restaurant.id, 
      editData, 
      userId: ctx.from.id,
      userRole: user?.role 
    });
    
    // Обновляем данные ресторана
    await restaurant.update(editData);
    
    let message = '✅ <b>Изменения сохранены успешно!</b>\n\n';
    message += '<b>Обновленные поля:</b>\n';
    
    for (const [field, value] of Object.entries(editData)) {
      message += `${getFieldName(field)}: ${value}\n`;
    }
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
    // Возвращаемся к управлению рестораном в зависимости от роли
    if (user?.role === 'admin') {
      const adminHandlers = require('../handlers/adminHandlers');
      await adminHandlers.restaurantManagement(ctx, restaurant.id);
    } else {
      // Для менеджеров возвращаемся к меню менеджера ресторана
      const managerHandlers = require('../handlers/manager');
      await managerHandlers.manageRestaurant(ctx, restaurant.id);
    }
    
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
    email: 'Email',
    contact_phone: 'Телефон',
    contact_email: 'Email',
    legal_name: 'Юридическое название',
    inn: 'ИНН',
    kpp: 'КПП',
    bank_name: 'Название банка',
    bank_bik: 'БИК',
    bank_account: 'Расчетный счет',
    bank_corr_account: 'Корреспондентский счет',
    director_name: 'ФИО директора',
    accountant_name: 'ФИО главного бухгалтера'
  };
  return fieldNames[field] || field;
}

module.exports = editRestaurantScene;