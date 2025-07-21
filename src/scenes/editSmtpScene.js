const { Scenes, Markup } = require('telegraf');
const { Settings } = require('../database/models');
const emailService = require('../services/EmailService');
const logger = require('../utils/logger');

// Сцена редактирования SMTP настроек
const editSmtpScene = new Scenes.BaseScene('edit_smtp_scene');

// Вход в сцену
editSmtpScene.enter(async (ctx) => {
  ctx.scene.session.smtpSettings = {};
  ctx.scene.session.currentStep = 'host';
  
  await ctx.reply(
    '⚙️ <b>Настройка SMTP</b>\n\n' +
    '📌 Введите адрес SMTP сервера:\n\n' +
    'Примеры:\n' +
    '• Gmail: smtp.gmail.com\n' +
    '• Yandex: smtp.yandex.ru\n' +
    '• Mail.ru: smtp.mail.ru',
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отмена', 'cancel_smtp_setup')]
      ])
    }
  );
});

// Обработка текстовых сообщений
editSmtpScene.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  const { currentStep, smtpSettings } = ctx.scene.session;
  
  switch (currentStep) {
    case 'host':
      smtpSettings.host = text;
      ctx.scene.session.currentStep = 'port';
      
      await ctx.reply(
        '🔢 Введите порт SMTP сервера:\n\n' +
        'Стандартные порты:\n' +
        '• 587 - для TLS (рекомендуется)\n' +
        '• 465 - для SSL\n' +
        '• 25 - без шифрования',
        Markup.inlineKeyboard([
          [
            Markup.button.callback('587', 'port_587'),
            Markup.button.callback('465', 'port_465'),
            Markup.button.callback('25', 'port_25')
          ],
          [Markup.button.callback('❌ Отмена', 'cancel_smtp_setup')]
        ])
      );
      break;
      
    case 'port':
      const port = parseInt(text);
      if (isNaN(port) || port < 1 || port > 65535) {
        return ctx.reply('⚠️ Введите корректный номер порта (1-65535)');
      }
      
      smtpSettings.port = port;
      smtpSettings.secure = port === 465; // SSL для порта 465
      ctx.scene.session.currentStep = 'user';
      
      await ctx.reply(
        '👤 Введите email для авторизации на SMTP сервере:\n\n' +
        'Это обычно ваш полный email адрес',
        Markup.inlineKeyboard([
          [Markup.button.callback('❌ Отмена', 'cancel_smtp_setup')]
        ])
      );
      break;
      
    case 'user':
      if (!text.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        return ctx.reply('⚠️ Введите корректный email адрес');
      }
      
      smtpSettings.user = text;
      ctx.scene.session.currentStep = 'pass';
      
      await ctx.reply(
        '🔑 Введите пароль для SMTP сервера:\n\n' +
        '⚠️ Для Gmail и Yandex используйте пароль приложения, а не обычный пароль',
        Markup.inlineKeyboard([
          [Markup.button.callback('❌ Отмена', 'cancel_smtp_setup')]
        ])
      );
      break;
      
    case 'pass':
      smtpSettings.pass = text;
      ctx.scene.session.currentStep = 'from';
      
      await ctx.reply(
        '📬 Введите email адрес отправителя:\n\n' +
        'Обычно совпадает с email для авторизации',
        Markup.inlineKeyboard([
          [Markup.button.callback(`Использовать ${smtpSettings.user}`, 'use_auth_email')],
          [Markup.button.callback('❌ Отмена', 'cancel_smtp_setup')]
        ])
      );
      break;
      
    case 'from':
      if (!text.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        return ctx.reply('⚠️ Введите корректный email адрес');
      }
      
      smtpSettings.from = text;
      await saveSmtpSettings(ctx);
      break;
  }
});

// Обработка callback запросов
editSmtpScene.on('callback_query', async (ctx) => {
  const action = ctx.callbackQuery.data;
  
  if (action === 'cancel_smtp_setup') {
    await ctx.answerCbQuery('Настройка отменена');
    await ctx.deleteMessage();
    return ctx.scene.leave();
  }
  
  // Быстрый выбор порта
  if (action.startsWith('port_')) {
    const port = parseInt(action.split('_')[1]);
    ctx.scene.session.smtpSettings.port = port;
    ctx.scene.session.smtpSettings.secure = port === 465;
    ctx.scene.session.currentStep = 'user';
    
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      '👤 Введите email для авторизации на SMTP сервере:\n\n' +
      'Это обычно ваш полный email адрес',
      {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('❌ Отмена', 'cancel_smtp_setup')]
        ])
      }
    );
  }
  
  // Использовать email авторизации как отправителя
  if (action === 'use_auth_email') {
    ctx.scene.session.smtpSettings.from = ctx.scene.session.smtpSettings.user;
    await ctx.answerCbQuery();
    await saveSmtpSettings(ctx);
  }
});

// Сохранение настроек
async function saveSmtpSettings(ctx) {
  const { smtpSettings } = ctx.scene.session;
  
  await ctx.reply('💾 Сохраняю настройки...');
  
  try {
    // Сохраняем настройки
    for (const [key, value] of Object.entries(smtpSettings)) {
      await Settings.setEmailSetting(`smtp_${key}`, value);
    }
    
    // Обновляем email сервис
    const result = await emailService.updateSmtpSettings(smtpSettings);
    
    if (result.success) {
      await ctx.reply(
        '✅ <b>SMTP настройки сохранены!</b>\n\n' +
        '🧪 Проверяю соединение...',
        { parse_mode: 'HTML' }
      );
      
      // Тестируем соединение
      const testResult = await emailService.testConnection();
      
      if (testResult.success) {
        await ctx.reply('✅ Соединение с SMTP сервером установлено успешно!');
      } else {
        await ctx.reply(
          `⚠️ Не удалось подключиться к SMTP серверу:\n${testResult.error}\n\n` +
          'Проверьте настройки и попробуйте снова.'
        );
      }
    } else {
      throw new Error(result.error);
    }
    
  } catch (error) {
    logger.error('Error saving SMTP settings:', error);
    await ctx.reply('❌ Ошибка при сохранении настроек');
  }
  
  return ctx.scene.leave();
}

// Выход из сцены
editSmtpScene.leave((ctx) => {
  delete ctx.scene.session.smtpSettings;
  delete ctx.scene.session.currentStep;
});

module.exports = editSmtpScene;