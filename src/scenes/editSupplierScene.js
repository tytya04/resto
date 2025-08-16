const { Scenes } = require('telegraf');
const { Supplier } = require('../database/models');
const logger = require('../utils/logger');

const editSupplierScene = new Scenes.BaseScene('edit_supplier');

// Поля для редактирования и их названия
const getFieldName = (field) => {
  const fieldNames = {
    name: 'Название компании',
    inn: 'ИНН',
    kpp: 'КПП',
    ogrn: 'ОГРН',
    legal_address: 'Юридический адрес',
    postal_address: 'Почтовый адрес',
    contact_phone: 'Контактный телефон',
    fax: 'Факс',
    contact_email: 'Email',
    bank_name: 'Название банка',
    bank_bik: 'БИК банка',
    bank_account: 'Расчетный счет',
    bank_corr_account: 'Корреспондентский счет',
    director_name: 'ФИО директора',
    director_position: 'Должность директора',
    accountant_name: 'ФИО главного бухгалтера',
    accountant_position: 'Должность главного бухгалтера',
    warehouse_responsible: 'ФИО ответственного за склад',
    warehouse_position: 'Должность ответственного за склад',
    okpo: 'ОКПО',
    okved: 'ОКВЭД'
  };
  return fieldNames[field] || field;
};

// Вход в сцену
editSupplierScene.enter(async (ctx) => {
  try {
    logger.info('Entering edit_supplier scene', { userId: ctx.from.id });
    
    // Получаем или создаем запись поставщика
    let supplier = await Supplier.findOne();
    if (!supplier) {
      supplier = await Supplier.create({
        name: 'ООО "ПОСТАВЩИК"'
      });
    }
    
    // Сохраняем в состояние сцены
    ctx.scene.state.supplierId = supplier.id;
    ctx.scene.state.editData = {};
    
    await showEditMenu(ctx, supplier);
  } catch (error) {
    logger.error('Error entering edit_supplier scene:', error);
    await ctx.reply('❌ Ошибка при входе в режим редактирования');
    ctx.scene.leave();
  }
});

// Функция отображения меню редактирования
async function showEditMenu(ctx, supplier = null) {
  try {
    if (!supplier) {
      supplier = await Supplier.findByPk(ctx.scene.state.supplierId);
    }
    
    if (!supplier) {
      await ctx.reply('❌ Данные поставщика не найдены');
      return ctx.scene.leave();
    }
    
    // Объединяем данные из базы с временными изменениями
    const editData = ctx.scene.state.editData || {};
    const currentData = {
      name: editData.name || supplier.name,
      inn: editData.inn || supplier.inn,
      kpp: editData.kpp || supplier.kpp,
      ogrn: editData.ogrn || supplier.ogrn,
      legal_address: editData.legal_address || supplier.legal_address,
      postal_address: editData.postal_address || supplier.postal_address,
      contact_phone: editData.contact_phone || supplier.contact_phone,
      fax: editData.fax || supplier.fax,
      contact_email: editData.contact_email || supplier.contact_email,
      bank_name: editData.bank_name || supplier.bank_name,
      bank_bik: editData.bank_bik || supplier.bank_bik,
      bank_account: editData.bank_account || supplier.bank_account,
      bank_corr_account: editData.bank_corr_account || supplier.bank_corr_account,
      director_name: editData.director_name || supplier.director_name,
      director_position: editData.director_position || supplier.director_position,
      accountant_name: editData.accountant_name || supplier.accountant_name,
      accountant_position: editData.accountant_position || supplier.accountant_position,
      warehouse_responsible: editData.warehouse_responsible || supplier.warehouse_responsible,
      warehouse_position: editData.warehouse_position || supplier.warehouse_position,
      okpo: editData.okpo || supplier.okpo,
      okved: editData.okved || supplier.okved
    };
    
    let message = '🏢 <b>Редактирование данных компании-поставщика</b>\n\n';
    message += '<b>Основная информация:</b>\n';
    message += `📋 Название: ${currentData.name || 'не указано'}\n`;
    message += `🔢 ИНН: ${currentData.inn || 'не указан'}\n`;
    message += `📊 КПП: ${currentData.kpp || 'не указан'}\n`;
    message += `📝 ОГРН: ${currentData.ogrn || 'не указан'}\n`;
    message += `📊 ОКПО: ${currentData.okpo || 'не указан'}\n`;
    message += `📋 ОКВЭД: ${currentData.okved || 'не указан'}\n\n`;
    
    message += '<b>Адреса:</b>\n';
    message += `🏛 Юридический: ${currentData.legal_address || 'не указан'}\n`;
    message += `📬 Почтовый: ${currentData.postal_address || 'не указан'}\n\n`;
    
    message += '<b>Контакты:</b>\n';
    message += `📞 Телефон: ${currentData.contact_phone || 'не указан'}\n`;
    message += `📠 Факс: ${currentData.fax || 'не указан'}\n`;
    message += `📧 Email: ${currentData.contact_email || 'не указан'}\n\n`;
    
    message += '<b>Банковские реквизиты:</b>\n';
    message += `🏦 Банк: ${currentData.bank_name || 'не указан'}\n`;
    message += `🔢 БИК: ${currentData.bank_bik || 'не указан'}\n`;
    message += `💳 Р/с: ${currentData.bank_account || 'не указан'}\n`;
    message += `🏦 К/с: ${currentData.bank_corr_account || 'не указан'}\n\n`;
    
    message += '<b>Ответственные лица:</b>\n';
    message += `👤 Директор: ${currentData.director_name || 'не указан'} (${currentData.director_position || 'должность не указана'})\n`;
    message += `👤 Главбух: ${currentData.accountant_name || 'не указан'} (${currentData.accountant_position || 'должность не указана'})\n`;
    message += `👤 Склад: ${currentData.warehouse_responsible || 'не указан'} (${currentData.warehouse_position || 'должность не указана'})\n\n`;
    
    // Показываем, есть ли несохраненные изменения
    if (Object.keys(editData).length > 0) {
      message += '⚠️ <i>Есть несохраненные изменения</i>\n\n';
    }
    
    message += '📝 <i>Выберите поле для редактирования или сохраните изменения</i>';
    
    const keyboard = [
      // Основная информация
      [
        { text: '📋 Название', callback_data: 'edit_supplier_name' },
        { text: '🔢 ИНН', callback_data: 'edit_supplier_inn' }
      ],
      [
        { text: '📊 КПП', callback_data: 'edit_supplier_kpp' },
        { text: '📝 ОГРН', callback_data: 'edit_supplier_ogrn' }
      ],
      [
        { text: '📊 ОКПО', callback_data: 'edit_supplier_okpo' },
        { text: '📋 ОКВЭД', callback_data: 'edit_supplier_okved' }
      ],
      // Адреса
      [
        { text: '🏛 Юр. адрес', callback_data: 'edit_supplier_legal_address' },
        { text: '📬 Почт. адрес', callback_data: 'edit_supplier_postal_address' }
      ],
      // Контакты
      [
        { text: '📞 Телефон', callback_data: 'edit_supplier_contact_phone' },
        { text: '📠 Факс', callback_data: 'edit_supplier_fax' }
      ],
      [
        { text: '📧 Email', callback_data: 'edit_supplier_contact_email' }
      ],
      // Банковские реквизиты
      [
        { text: '🏦 Банк', callback_data: 'edit_supplier_bank_name' },
        { text: '🔢 БИК', callback_data: 'edit_supplier_bank_bik' }
      ],
      [
        { text: '💳 Р/счет', callback_data: 'edit_supplier_bank_account' },
        { text: '🏦 К/счет', callback_data: 'edit_supplier_bank_corr_account' }
      ],
      // Ответственные лица
      [
        { text: '👤 Директор', callback_data: 'edit_supplier_director_name' },
        { text: '📋 Должность дир.', callback_data: 'edit_supplier_director_position' }
      ],
      [
        { text: '👤 Главбух', callback_data: 'edit_supplier_accountant_name' },
        { text: '📋 Должность бух.', callback_data: 'edit_supplier_accountant_position' }
      ],
      [
        { text: '👤 Зав. складом', callback_data: 'edit_supplier_warehouse_responsible' },
        { text: '📋 Должность скл.', callback_data: 'edit_supplier_warehouse_position' }
      ],
      // Управление
      []
    ];
    
    // Добавляем кнопки управления в зависимости от наличия изменений
    if (Object.keys(editData).length > 0) {
      keyboard[keyboard.length - 1] = [
        { text: '💾 Сохранить изменения', callback_data: 'save_supplier_changes' },
        { text: '❌ Отменить изменения', callback_data: 'cancel_supplier_changes' }
      ];
    } else {
      keyboard[keyboard.length - 1] = [
        { text: '🔙 Назад в меню', callback_data: 'exit_supplier_edit' }
      ];
    }
    
    // Если у нас есть message_id, редактируем сообщение, иначе отправляем новое
    if (ctx.scene.state.messageId) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          ctx.scene.state.messageId,
          null,
          message,
          {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
          }
        );
      } catch (error) {
        // Если не удалось отредактировать, отправляем новое
        const sentMessage = await ctx.reply(message, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard }
        });
        ctx.scene.state.messageId = sentMessage.message_id;
      }
    } else {
      const sentMessage = await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
      });
      ctx.scene.state.messageId = sentMessage.message_id;
    }
  } catch (error) {
    logger.error('Error showing supplier edit menu:', error);
    await ctx.reply('❌ Ошибка при отображении меню редактирования');
  }
}

// Обработчик callback-кнопок
editSupplierScene.on('callback_query', async (ctx) => {
  const action = ctx.callbackQuery.data;
  
  try {
    await ctx.answerCbQuery();
    
    // Обработка редактирования полей
    if (action.startsWith('edit_supplier_')) {
      const field = action.replace('edit_supplier_', '');
      ctx.scene.state.editingField = field;
      
      const fieldName = getFieldName(field);
      const currentValue = ctx.scene.state.editData[field] || 
                          (await Supplier.findByPk(ctx.scene.state.supplierId))[field];
      
      let promptMessage = `📝 <b>Редактирование: ${fieldName}</b>\n\n`;
      if (currentValue) {
        promptMessage += `Текущее значение: <code>${currentValue}</code>\n\n`;
      }
      promptMessage += 'Введите новое значение или нажмите /cancel для отмены:';
      
      await ctx.reply(promptMessage, { parse_mode: 'HTML' });
      return;
    }
    
    // Сохранение изменений
    if (action === 'save_supplier_changes') {
      const supplier = await Supplier.findByPk(ctx.scene.state.supplierId);
      if (!supplier) {
        await ctx.reply('❌ Данные поставщика не найдены');
        return ctx.scene.leave();
      }
      
      // Применяем все изменения
      const editData = ctx.scene.state.editData;
      for (const [field, value] of Object.entries(editData)) {
        supplier[field] = value;
      }
      
      await supplier.save();
      
      // Очищаем временные данные
      ctx.scene.state.editData = {};
      
      await ctx.reply('✅ Изменения успешно сохранены!');
      
      // Обновляем меню
      await showEditMenu(ctx, supplier);
      return;
    }
    
    // Отмена изменений
    if (action === 'cancel_supplier_changes') {
      ctx.scene.state.editData = {};
      await ctx.reply('❌ Изменения отменены');
      const supplier = await Supplier.findByPk(ctx.scene.state.supplierId);
      await showEditMenu(ctx, supplier);
      return;
    }
    
    // Выход из редактирования
    if (action === 'exit_supplier_edit') {
      await ctx.reply('👍 Редактирование завершено');
      ctx.scene.leave();
      return;
    }
    
  } catch (error) {
    logger.error('Error handling callback in edit_supplier scene:', error);
    await ctx.reply('❌ Произошла ошибка');
  }
});

// Обработчик текстовых сообщений (ввод новых значений)
editSupplierScene.on('text', async (ctx) => {
  const text = ctx.message.text;
  
  // Обработка команды отмены
  if (text === '/cancel') {
    ctx.scene.state.editingField = null;
    const supplier = await Supplier.findByPk(ctx.scene.state.supplierId);
    await showEditMenu(ctx, supplier);
    return;
  }
  
  // Если редактируем поле
  if (ctx.scene.state.editingField) {
    const field = ctx.scene.state.editingField;
    const fieldName = getFieldName(field);
    
    // Валидация некоторых полей
    if (field === 'inn' && !/^\d{10,12}$/.test(text)) {
      await ctx.reply('❌ ИНН должен содержать 10 или 12 цифр');
      return;
    }
    
    if (field === 'kpp' && !/^\d{9}$/.test(text)) {
      await ctx.reply('❌ КПП должен содержать 9 цифр');
      return;
    }
    
    if (field === 'ogrn' && !/^\d{13,15}$/.test(text)) {
      await ctx.reply('❌ ОГРН должен содержать 13 или 15 цифр');
      return;
    }
    
    if (field === 'bank_bik' && !/^\d{9}$/.test(text)) {
      await ctx.reply('❌ БИК должен содержать 9 цифр');
      return;
    }
    
    if (field === 'bank_account' && !/^\d{20}$/.test(text)) {
      await ctx.reply('❌ Расчетный счет должен содержать 20 цифр');
      return;
    }
    
    if (field === 'bank_corr_account' && !/^\d{20}$/.test(text)) {
      await ctx.reply('❌ Корреспондентский счет должен содержать 20 цифр');
      return;
    }
    
    if (field === 'contact_email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      await ctx.reply('❌ Некорректный формат email');
      return;
    }
    
    // Сохраняем значение во временное хранилище
    ctx.scene.state.editData[field] = text;
    ctx.scene.state.editingField = null;
    
    await ctx.reply(`✅ ${fieldName} изменен(о) на: ${text}`);
    
    // Обновляем меню
    const supplier = await Supplier.findByPk(ctx.scene.state.supplierId);
    await showEditMenu(ctx, supplier);
  }
});

// Обработчик команды /start для выхода из сцены
editSupplierScene.command('start', async (ctx) => {
  await ctx.scene.leave();
  return ctx.reply('Вы вышли из режима редактирования поставщика');
});

module.exports = editSupplierScene;