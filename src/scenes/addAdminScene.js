const { Scenes } = require('telegraf');
const { User } = require('../database/models');
const logger = require('../utils/logger');

const addAdminScene = new Scenes.BaseScene('add_admin');

// Вход в сцену
addAdminScene.enter(async (ctx) => {
  await ctx.reply(
    '👑 <b>Добавление администратора</b>\n\n' +
    'Введите Telegram ID пользователя, которого хотите назначить администратором.\n\n' +
    'Для отмены введите /cancel',
    { parse_mode: 'HTML' }
  );
});

// Обработка ввода ID
addAdminScene.on('text', async (ctx) => {
  const text = ctx.message.text;
  
  if (text === '/cancel') {
    await ctx.reply('❌ Операция отменена');
    return ctx.scene.leave();
  }
  
  // Проверяем, что введен корректный ID
  const telegramId = parseInt(text);
  if (isNaN(telegramId)) {
    return ctx.reply('⚠️ Введите корректный Telegram ID (число)');
  }
  
  try {
    // Проверяем, существует ли пользователь
    let user = await User.findOne({ where: { telegram_id: telegramId } });
    
    if (user) {
      // Пользователь существует, проверяем его роль
      if (user.role === 'admin') {
        await ctx.reply('⚠️ Этот пользователь уже является администратором');
        return ctx.scene.leave();
      }
      
      // Обновляем роль
      const oldRole = user.role;
      user.role = 'admin';
      await user.save();
      
      await ctx.reply(
        '✅ <b>Администратор добавлен успешно!</b>\n\n' +
        `Пользователь: ${user.first_name || ''} ${user.last_name || ''}\n` +
        `Username: @${user.username || 'нет'}\n` +
        `Предыдущая роль: ${oldRole}\n` +
        `Новая роль: admin`,
        { parse_mode: 'HTML' }
      );
      
      // Уведомляем пользователя о новой роли
      try {
        await ctx.telegram.sendMessage(
          telegramId,
          '🎉 <b>Поздравляем!</b>\n\n' +
          'Вам предоставлены права администратора в системе управления закупками.\n\n' +
          'Теперь вам доступна команда /admin_panel для управления системой.',
          { parse_mode: 'HTML' }
        );
      } catch (e) {
        logger.error('Error notifying new admin:', e);
      }
    } else {
      // Создаем нового пользователя-администратора
      await ctx.reply(
        '⚠️ Пользователь с таким ID не найден в системе.\n\n' +
        'Хотите создать нового администратора?\n' +
        'Введите данные в формате:\n' +
        'Имя Фамилия username\n\n' +
        'Например: Иван Иванов ivanov\n\n' +
        'Для отмены введите /cancel'
      );
      
      ctx.scene.state.telegramId = telegramId;
      ctx.scene.state.waitingForUserData = true;
      return;
    }
  } catch (error) {
    logger.error('Error in addAdminScene:', error);
    await ctx.reply('❌ Произошла ошибка при добавлении администратора');
  }
  
  return ctx.scene.leave();
});

// Обработка создания нового администратора
addAdminScene.on('text', async (ctx) => {
  if (!ctx.scene.state.waitingForUserData) return;
  
  const text = ctx.message.text;
  
  if (text === '/cancel') {
    await ctx.reply('❌ Операция отменена');
    return ctx.scene.leave();
  }
  
  const parts = text.split(' ');
  if (parts.length < 2) {
    return ctx.reply('⚠️ Введите как минимум имя и фамилию');
  }
  
  const firstName = parts[0];
  const lastName = parts[1];
  const username = parts[2] || null;
  
  try {
    const user = await User.create({
      telegram_id: ctx.scene.state.telegramId,
      first_name: firstName,
      last_name: lastName,
      username: username,
      role: 'admin',
      is_active: true
    });
    
    await ctx.reply(
      '✅ <b>Новый администратор создан успешно!</b>\n\n' +
      `ID: ${user.telegram_id}\n` +
      `Имя: ${user.first_name} ${user.last_name}\n` +
      `Username: @${user.username || 'нет'}\n` +
      `Роль: admin`,
      { parse_mode: 'HTML' }
    );
    
    // Уведомляем пользователя
    try {
      await ctx.telegram.sendMessage(
        user.telegram_id,
        '🎉 <b>Добро пожаловать!</b>\n\n' +
        'Вы были добавлены в систему управления закупками как администратор.\n\n' +
        'Используйте команду /start для начала работы и /admin_panel для доступа к панели администратора.',
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      logger.error('Error notifying new admin:', e);
    }
  } catch (error) {
    logger.error('Error creating admin:', error);
    await ctx.reply('❌ Произошла ошибка при создании администратора');
  }
  
  return ctx.scene.leave();
});

module.exports = addAdminScene;