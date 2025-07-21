const { Markup } = require('telegraf');
const emailService = require('../services/EmailService');
const { Settings } = require('../database/models');
const logger = require('../utils/logger');

// Меню настроек email
const emailSettingsMenu = async (ctx) => {
  const keyboard = Markup.keyboard([
    ['📧 SMTP настройки', '📮 Email адреса'],
    ['🧪 Тест соединения', '📨 Тест письма'],
    ['🔙 Назад']
  ]).resize();
  
  await ctx.reply(
    '📧 <b>Настройки Email</b>\n\n' +
    'Выберите раздел для настройки:',
    {
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
};

// Просмотр SMTP настроек
const viewSmtpSettings = async (ctx) => {
  try {
    const settings = await emailService.getSmtpSettings();
    
    let message = '⚙️ <b>SMTP настройки:</b>\n\n';
    message += `📌 Хост: ${settings.host || 'не указан'}\n`;
    message += `🔢 Порт: ${settings.port || 'не указан'}\n`;
    message += `🔒 Безопасное соединение: ${settings.secure ? 'Да' : 'Нет'}\n`;
    message += `👤 Пользователь: ${settings.user || 'не указан'}\n`;
    message += `🔑 Пароль: ${settings.pass ? '****' : 'не указан'}\n`;
    message += `📬 От кого: ${settings.from || 'не указан'}\n\n`;
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('✏️ Изменить', 'edit_smtp')],
      [Markup.button.callback('🔙 Назад', 'back_to_email_menu')]
    ]);
    
    await ctx.reply(message, { 
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    
  } catch (error) {
    logger.error('Error viewing SMTP settings:', error);
    ctx.reply('❌ Ошибка при получении настроек');
  }
};

// Просмотр email адресов
const viewEmailAddresses = async (ctx) => {
  try {
    const accountantEmail = await Settings.getValue('accountant_email');
    const managerEmails = await Settings.getValue('manager_emails');
    const notificationEmails = await Settings.getValue('notification_emails');
    
    let message = '📮 <b>Email адреса для уведомлений:</b>\n\n';
    
    message += '📊 <b>Бухгалтер (ТОРГ-12):</b>\n';
    message += accountantEmail || 'не указан';
    message += '\n\n';
    
    message += '👔 <b>Менеджеры:</b>\n';
    message += managerEmails || 'не указаны';
    message += '\n\n';
    
    message += '🔔 <b>Дополнительные адреса:</b>\n';
    message += notificationEmails || 'не указаны';
    message += '\n\n';
    
    message += '<i>Несколько адресов указывайте через запятую</i>';
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📊 Изменить бухгалтера', 'edit_accountant_email')],
      [Markup.button.callback('👔 Изменить менеджеров', 'edit_manager_emails')],
      [Markup.button.callback('🔔 Изменить доп. адреса', 'edit_notification_emails')],
      [Markup.button.callback('🔙 Назад', 'back_to_email_menu')]
    ]);
    
    await ctx.reply(message, { 
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    
  } catch (error) {
    logger.error('Error viewing email addresses:', error);
    ctx.reply('❌ Ошибка при получении адресов');
  }
};

// Тест SMTP соединения
const testSmtpConnection = async (ctx) => {
  await ctx.reply('🔄 Проверяю соединение с SMTP сервером...');
  
  try {
    const result = await emailService.testConnection();
    
    if (result.success) {
      await ctx.reply('✅ Соединение с SMTP сервером установлено успешно!');
    } else {
      await ctx.reply(`❌ Ошибка соединения: ${result.error}`);
    }
    
  } catch (error) {
    logger.error('Error testing SMTP connection:', error);
    ctx.reply('❌ Ошибка при проверке соединения');
  }
};

// Отправка тестового письма
const sendTestEmail = async (ctx) => {
  await ctx.reply(
    '📨 Введите email адрес для отправки тестового письма:',
    Markup.inlineKeyboard([
      [Markup.button.callback('❌ Отмена', 'cancel_test_email')]
    ])
  );
  
  ctx.session.awaitingTestEmail = true;
};

// Обработка ввода email для теста
const handleTestEmailInput = async (ctx) => {
  const email = ctx.message.text.trim();
  
  // Простая проверка email
  if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return ctx.reply('⚠️ Введите корректный email адрес');
  }
  
  ctx.session.awaitingTestEmail = false;
  
  await ctx.reply('📤 Отправляю тестовое письмо...');
  
  try {
    const result = await emailService.sendEmail({
      to: email,
      subject: 'Тестовое письмо - Система закупок',
      html: `
        <h2>Тестовое письмо</h2>
        <p>Это тестовое письмо от системы управления закупками.</p>
        <p>Если вы получили это письмо, значит настройки email работают корректно.</p>
        <hr>
        <p><small>Отправлено: ${new Date().toLocaleString('ru-RU')}</small></p>
      `
    });
    
    if (result.success) {
      await ctx.reply(`✅ Тестовое письмо успешно отправлено на ${email}`);
    } else {
      await ctx.reply(`❌ Ошибка отправки: ${result.error}`);
    }
    
  } catch (error) {
    logger.error('Error sending test email:', error);
    ctx.reply('❌ Ошибка при отправке тестового письма');
  }
};

// Редактирование SMTP настроек (начало сцены)
const editSmtpSettings = async (ctx) => {
  await ctx.answerCbQuery();
  ctx.scene.enter('edit_smtp_scene');
};

// Редактирование email адресов
const editEmailAddress = async (ctx, type) => {
  await ctx.answerCbQuery();
  
  let prompt = '';
  switch (type) {
    case 'accountant':
      prompt = '📊 Введите email бухгалтера для отправки ТОРГ-12:';
      break;
    case 'managers':
      prompt = '👔 Введите email адреса менеджеров через запятую:';
      break;
    case 'notification':
      prompt = '🔔 Введите дополнительные email адреса через запятую:';
      break;
  }
  
  await ctx.reply(
    prompt,
    Markup.inlineKeyboard([
      [Markup.button.callback('❌ Отмена', 'cancel_email_edit')]
    ])
  );
  
  ctx.session.editingEmailType = type;
};

// Обработка ввода email адресов
const handleEmailAddressInput = async (ctx) => {
  const type = ctx.session.editingEmailType;
  const value = ctx.message.text.trim();
  
  try {
    let key = '';
    switch (type) {
      case 'accountant':
        key = 'accountant_email';
        break;
      case 'managers':
        key = 'manager_emails';
        break;
      case 'notification':
        key = 'notification_emails';
        break;
    }
    
    await Settings.setValue(key, value);
    
    ctx.session.editingEmailType = null;
    
    await ctx.reply('✅ Email адреса сохранены');
    
    // Показываем обновленный список
    return viewEmailAddresses(ctx);
    
  } catch (error) {
    logger.error('Error saving email addresses:', error);
    ctx.reply('❌ Ошибка при сохранении адресов');
  }
};

// Обработка callback запросов
const handleEmailSettingsCallbacks = async (ctx) => {
  const action = ctx.callbackQuery.data;
  
  switch (action) {
    case 'edit_smtp':
      return editSmtpSettings(ctx);
    
    case 'edit_accountant_email':
      return editEmailAddress(ctx, 'accountant');
    
    case 'edit_manager_emails':
      return editEmailAddress(ctx, 'managers');
    
    case 'edit_notification_emails':
      return editEmailAddress(ctx, 'notification');
    
    case 'back_to_email_menu':
      await ctx.answerCbQuery();
      await ctx.deleteMessage();
      return emailSettingsMenu(ctx);
    
    case 'cancel_test_email':
    case 'cancel_email_edit':
      await ctx.answerCbQuery();
      ctx.session.awaitingTestEmail = false;
      ctx.session.editingEmailType = null;
      await ctx.deleteMessage();
      return;
  }
};

// Обработка текстовых команд
const handleTextCommands = async (ctx) => {
  const text = ctx.message.text;
  
  // Проверка на ввод email для теста
  if (ctx.session.awaitingTestEmail) {
    return handleTestEmailInput(ctx);
  }
  
  // Проверка на редактирование email адресов
  if (ctx.session.editingEmailType) {
    return handleEmailAddressInput(ctx);
  }
  
  switch (text) {
    case '📧 SMTP настройки':
      return viewSmtpSettings(ctx);
    case '📮 Email адреса':
      return viewEmailAddresses(ctx);
    case '🧪 Тест соединения':
      return testSmtpConnection(ctx);
    case '📨 Тест письма':
      return sendTestEmail(ctx);
    case '🔙 Назад':
      // Возвращаемся в меню менеджера
      const managerHandlers = require('./manager');
      return managerHandlers.menu(ctx);
    default:
      return false;
  }
};

module.exports = {
  emailSettingsMenu,
  viewSmtpSettings,
  viewEmailAddresses,
  testSmtpConnection,
  sendTestEmail,
  handleEmailSettingsCallbacks,
  handleTextCommands
};