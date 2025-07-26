const { User, Restaurant, Order, Purchase, Settings } = require('../database/models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Главное меню администратора
const adminPanel = async (ctx) => {
  try {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '👥 Управление пользователями', callback_data: 'admin_users' },
            { text: '🏢 Управление ресторанами', callback_data: 'admin_restaurants' }
          ],
          [
            { text: '⚙️ Настройки системы', callback_data: 'admin_settings' },
            { text: '📊 Статистика', callback_data: 'admin_stats' }
          ],
          [
            { text: '💾 Резервная копия БД', callback_data: 'admin_backup' },
            { text: '📋 Логи системы', callback_data: 'admin_logs' }
          ]
        ]
      }
    };

    await ctx.reply(
      '🔧 <b>Панель администратора</b>\n\n' +
      'Выберите необходимый раздел:',
      { parse_mode: 'HTML', ...keyboard }
    );
  } catch (error) {
    logger.error('Error in adminPanel:', error);
    ctx.reply('Произошла ошибка при загрузке панели администратора');
  }
};

// Управление пользователями
const usersManagement = async (ctx) => {
  try {
    const isAdmin = ctx.user && ctx.user.role === 'admin';
    
    // Формируем кнопки в зависимости от роли
    const buttons = [
      [
        { text: '📋 Список пользователей', callback_data: 'admin_users_list' },
        { text: '🔍 Поиск пользователя', callback_data: 'admin_users_search' }
      ],
      [
        { text: '⏳ Заявки на регистрацию', callback_data: 'admin_users_pending' }
      ]
    ];
    
    // Добавляем кнопку администратора только для админов
    if (isAdmin) {
      buttons[1].push({ text: '➕ Добавить администратора', callback_data: 'admin_users_add_admin' });
    }
    
    // Кнопка назад ведет в разные места для админа и менеджера
    buttons.push([
      { text: '🔙 Назад', callback_data: isAdmin ? 'admin_panel' : 'menu_back' }
    ]);
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: buttons
      }
    };

    const messageText = '👥 <b>Управление пользователями</b>\n\n' +
      'Выберите действие:';
    
    // Если это callback query, редактируем сообщение
    if (ctx.callbackQuery) {
      await ctx.editMessageText(messageText, { parse_mode: 'HTML', ...keyboard });
    } else {
      // Если это обычное сообщение, отправляем новое
      await ctx.reply(messageText, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (error) {
    logger.error('Error in usersManagement:', error);
    ctx.reply('Произошла ошибка при загрузке меню управления пользователями');
  }
};

// Список пользователей
const usersList = async (ctx, page = 0) => {
  try {
    const limit = 10;
    const offset = page * limit;
    const isManager = ctx.user && ctx.user.role === 'manager';

    logger.info('Fetching users list', { page, limit, offset, isManager });

    // Формируем условия поиска
    const whereCondition = {};
    
    // Если это менеджер, показываем только одобренных им пользователей
    if (isManager) {
      // Получаем ID пользователей из обработанных менеджером заявок
      const { RegistrationRequest } = require('../database/models');
      const approvedRequests = await RegistrationRequest.findAll({
        where: {
          processed_by: ctx.user.id,
          status: 'approved'
        },
        attributes: ['telegram_id']
      });
      
      const approvedTelegramIds = approvedRequests.map(req => req.telegram_id);
      
      if (approvedTelegramIds.length > 0) {
        whereCondition.telegram_id = approvedTelegramIds;
      } else {
        // Если менеджер никого не одобрял, показываем пустой список
        whereCondition.id = -1; // Невозможный ID
      }
    }

    const { count, rows: users } = await User.findAndCountAll({
      where: whereCondition,
      include: [{
        model: Restaurant,
        as: 'restaurant',
        attributes: ['name'],
        required: false
      }],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });
    
    logger.info('Users found', { count, usersLength: users.length });

    if (users.length === 0) {
      const message = '👥 <b>Список пользователей</b>\n\n📋 Пользователи не найдены';
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔙 К управлению пользователями', callback_data: 'admin_users' }
            ]
          ]
        }
      };
      
      if (ctx.callbackQuery) {
        return await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
      } else {
        return await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
      }
    }

    let message = '👥 <b>Список пользователей</b>\n\n';
    
    users.forEach((user, index) => {
      const roleEmoji = {
        'admin': '👑',
        'manager': '💼',
        'buyer': '🛒',
        'restaurant': '🍽️'
      };
      
      message += `${offset + index + 1}. ${roleEmoji[user.role] || '👤'} `;
      message += `${user.first_name || ''} ${user.last_name || ''}\n`;
      message += `   @${user.username || 'нет username'} (ID: ${user.telegram_id})\n`;
      message += `   Роль: ${user.role}\n`;
      if (user.restaurant) {
        message += `   Ресторан: ${user.restaurant.name}\n`;
      }
      message += `   Статус: ${user.is_active ? '✅ Активен' : '❌ Заблокирован'}\n`;
      message += `   /user_${user.id}\n\n`;
    });

    const totalPages = Math.ceil(count / limit);
    const keyboard = {
      reply_markup: {
        inline_keyboard: []
      }
    };

    // Навигация по страницам
    const navigation = [];
    if (page > 0) {
      navigation.push({ text: '◀️ Назад', callback_data: `admin_users_list_${page - 1}` });
    }
    if (totalPages > 1) {
      navigation.push({ text: `${page + 1}/${totalPages}`, callback_data: 'ignore' });
    }
    if (page < totalPages - 1) {
      navigation.push({ text: 'Вперед ▶️', callback_data: `admin_users_list_${page + 1}` });
    }
    if (navigation.length > 0) {
      keyboard.reply_markup.inline_keyboard.push(navigation);
    }

    keyboard.reply_markup.inline_keyboard.push([
      { text: '🔙 К управлению пользователями', callback_data: 'admin_users' }
    ]);

    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
    } else {
      await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (error) {
    logger.error('Error in usersList:', error);
    ctx.reply('Произошла ошибка при загрузке списка пользователей');
  }
};

// Управление конкретным пользователем
const userManagement = async (ctx, userId) => {
  try {
    const user = await User.findByPk(userId, {
      include: [{
        model: Restaurant,
        as: 'restaurant'
      }]
    });

    if (!user) {
      return ctx.reply('Пользователь не найден');
    }

    const roleEmoji = {
      'admin': '👑',
      'manager': '💼',
      'buyer': '🛒',
      'restaurant': '🍽️'
    };

    let message = `${roleEmoji[user.role] || '👤'} <b>Информация о пользователе</b>\n\n`;
    message += `<b>ID:</b> ${user.telegram_id}\n`;
    message += `<b>Username:</b> @${user.username || 'нет'}\n`;
    message += `<b>Имя:</b> ${user.first_name || 'не указано'}\n`;
    message += `<b>Фамилия:</b> ${user.last_name || 'не указано'}\n`;
    message += `<b>Телефон:</b> ${user.phone || 'не указан'}\n`;
    message += `<b>Роль:</b> ${user.role}\n`;
    if (user.restaurant) {
      message += `<b>Ресторан:</b> ${user.restaurant.name}\n`;
    }
    message += `<b>Статус:</b> ${user.is_active ? '✅ Активен' : '❌ Заблокирован'}\n`;
    message += `<b>Дата регистрации:</b> ${user.created_at ? new Date(user.created_at).toLocaleString('ru-RU') : 'не указана'}\n`;

    // Статистика пользователя
    if (user.role === 'restaurant') {
      const ordersCount = await Order.count({ where: { user_id: user.id } });
      message += `\n<b>📊 Статистика:</b>\n`;
      message += `Заказов создано: ${ordersCount}\n`;
    } else if (user.role === 'buyer') {
      const purchasesCount = await Purchase.count({ where: { buyer_id: user.id } });
      message += `\n<b>📊 Статистика:</b>\n`;
      message += `Закупок выполнено: ${purchasesCount}\n`;
    }

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { 
              text: user.is_active ? '🚫 Заблокировать' : '✅ Разблокировать', 
              callback_data: `admin_user_toggle_${user.id}` 
            }
          ],
          [
            { text: '🔄 Изменить роль', callback_data: `admin_user_role_${user.id}` },
            { text: '🏢 Изменить ресторан', callback_data: `admin_user_restaurant_${user.id}` }
          ],
          [
            { text: '📝 Редактировать данные', callback_data: `admin_user_edit_${user.id}` }
          ],
          [
            { text: '🗑️ Удалить пользователя', callback_data: `admin_user_delete_${user.id}` }
          ],
          [
            { text: '🔙 К списку пользователей', callback_data: 'admin_users_list' }
          ]
        ]
      }
    };

    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error in userManagement:', error);
    ctx.reply('Произошла ошибка при загрузке информации о пользователе');
  }
};

// Управление ресторанами
const restaurantsManagement = async (ctx) => {
  try {
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 Список ресторанов', callback_data: 'admin_restaurants_list' },
            { text: '➕ Добавить ресторан', callback_data: 'admin_restaurants_add' }
          ],
          [
            { text: '📊 Статистика по ресторанам', callback_data: 'admin_restaurants_stats' }
          ],
          [
            { text: '🔙 Назад', callback_data: 'admin_panel' }
          ]
        ]
      }
    };

    await ctx.editMessageText(
      '🏢 <b>Управление ресторанами</b>\n\n' +
      'Выберите действие:',
      { parse_mode: 'HTML', ...keyboard }
    );
  } catch (error) {
    logger.error('Error in restaurantsManagement:', error);
    ctx.reply('Произошла ошибка при загрузке меню управления ресторанами');
  }
};

// Список ресторанов
const restaurantsList = async (ctx) => {
  try {
    const restaurants = await Restaurant.findAll({
      include: [{
        model: User,
        as: 'users'
      }],
      order: [['name', 'ASC']]
    });

    if (restaurants.length === 0) {
      return ctx.reply('Рестораны не найдены');
    }

    let message = '🏢 <b>Список ресторанов</b>\n\n';
    
    for (const [index, restaurant] of restaurants.entries()) {
      const ordersCount = await Order.count({ 
        where: { restaurant_id: restaurant.id } 
      });
      
      message += `${index + 1}. <b>${restaurant.name}</b>\n`;
      message += `   Адрес: ${restaurant.address || 'не указан'}\n`;
      message += `   Пользователей: ${restaurant.users.length}\n`;
      message += `   Заказов: ${ordersCount}\n`;
      message += `   Статус: ${restaurant.is_active ? '✅ Активен' : '❌ Неактивен'}\n`;
      message += `   /restaurant_${restaurant.id}\n\n`;
    }

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '➕ Добавить ресторан', callback_data: 'admin_restaurants_add' }
          ],
          [
            { text: '🔙 К управлению ресторанами', callback_data: 'admin_restaurants' }
          ]
        ]
      }
    };

    if (ctx.callbackQuery) {
      await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
    } else {
      await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    }
  } catch (error) {
    logger.error('Error in restaurantsList:', error);
    ctx.reply('Произошла ошибка при загрузке списка ресторанов');
  }
};

// Создание резервной копии БД
const createBackup = async (ctx) => {
  try {
    await ctx.answerCbQuery('Создание резервной копии...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '../../backups');
    const backupFile = path.join(backupDir, `backup_${timestamp}.sqlite`);
    
    // Создаем директорию для бэкапов если её нет
    await fs.mkdir(backupDir, { recursive: true });
    
    // Путь к файлу базы данных SQLite
    const dbPath = path.join(__dirname, '../../database.sqlite');
    
    // Копируем файл базы данных
    await fs.copyFile(dbPath, backupFile);
    
    // Проверяем размер файла
    const stats = await fs.stat(backupFile);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    // Архивируем бэкап
    const archiveFile = `${backupFile}.gz`;
    await execPromise(`gzip ${backupFile}`);
    
    const archiveStats = await fs.stat(archiveFile);
    const archiveSizeInMB = (archiveStats.size / (1024 * 1024)).toFixed(2);
    
    await ctx.reply(
      '✅ <b>Резервная копия создана успешно</b>\n\n' +
      `📁 Файл: backup_${timestamp}.sqlite.gz\n` +
      `📊 Размер: ${archiveSizeInMB} МБ (сжато из ${fileSizeInMB} МБ)\n` +
      `📍 Путь: ${archiveFile}`,
      { parse_mode: 'HTML' }
    );
    
    // Очистка старых бэкапов (оставляем последние 10)
    const files = await fs.readdir(backupDir);
    const backupFiles = files
      .filter(f => f.startsWith('backup_') && f.endsWith('.gz'))
      .sort()
      .reverse();
    
    if (backupFiles.length > 10) {
      for (const oldFile of backupFiles.slice(10)) {
        await fs.unlink(path.join(backupDir, oldFile));
      }
    }
  } catch (error) {
    logger.error('Error creating backup:', error);
    ctx.reply('❌ Ошибка при создании резервной копии: ' + error.message);
  }
};

// Статистика системы
const systemStats = async (ctx) => {
  try {
    await ctx.answerCbQuery('Загрузка статистики...');
    
    // Собираем статистику
    const stats = {
      users: {
        total: await User.count(),
        active: await User.count({ where: { is_active: true } }),
        byRole: await User.findAll({
          attributes: ['role', [require('sequelize').fn('COUNT', 'role'), 'count']],
          group: ['role']
        })
      },
      restaurants: {
        total: await Restaurant.count(),
        active: await Restaurant.count({ where: { is_active: true } })
      },
      orders: {
        total: await Order.count(),
        byStatus: await Order.findAll({
          attributes: ['status', [require('sequelize').fn('COUNT', 'status'), 'count']],
          group: ['status']
        }),
        today: await Order.count({
          where: {
            created_at: {
              [Op.gte]: new Date().setHours(0, 0, 0, 0)
            }
          }
        }),
        thisMonth: await Order.count({
          where: {
            created_at: {
              [Op.gte]: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            }
          }
        })
      },
      purchases: {
        total: await Purchase.count(),
        today: await Purchase.count({
          where: {
            created_at: {
              [Op.gte]: new Date().setHours(0, 0, 0, 0)
            }
          }
        })
      }
    };
    
    let message = '📊 <b>Статистика системы</b>\n\n';
    
    // Пользователи
    message += '<b>👥 Пользователи:</b>\n';
    message += `Всего: ${stats.users.total}\n`;
    message += `Активных: ${stats.users.active}\n`;
    message += 'По ролям:\n';
    for (const role of stats.users.byRole) {
      const roleNames = {
        'admin': 'Администраторы',
        'manager': 'Менеджеры',
        'buyer': 'Закупщики',
        'restaurant': 'Рестораны'
      };
      message += `  • ${roleNames[role.role] || role.role}: ${role.dataValues.count}\n`;
    }
    
    // Рестораны
    message += '\n<b>🏢 Рестораны:</b>\n';
    message += `Всего: ${stats.restaurants.total}\n`;
    message += `Активных: ${stats.restaurants.active}\n`;
    
    // Заказы
    message += '\n<b>📦 Заказы:</b>\n';
    message += `Всего: ${stats.orders.total}\n`;
    message += `Сегодня: ${stats.orders.today}\n`;
    message += `За месяц: ${stats.orders.thisMonth}\n`;
    message += 'По статусам:\n';
    for (const status of stats.orders.byStatus) {
      const statusNames = {
        'pending': 'Ожидают',
        'approved': 'Одобрены',
        'processing': 'В обработке',
        'completed': 'Завершены',
        'cancelled': 'Отменены'
      };
      message += `  • ${statusNames[status.status] || status.status}: ${status.dataValues.count}\n`;
    }
    
    // Закупки
    message += '\n<b>🛒 Закупки:</b>\n';
    message += `Всего: ${stats.purchases.total}\n`;
    message += `Сегодня: ${stats.purchases.today}\n`;
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📈 Детальная аналитика', callback_data: 'admin_detailed_analytics' }
          ],
          [
            { text: '🔙 Назад', callback_data: 'admin_panel' }
          ]
        ]
      }
    };
    
    await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error in systemStats:', error);
    ctx.reply('Произошла ошибка при загрузке статистики');
  }
};

// Обработчики callback-запросов
const handleAdminCallbacks = async (ctx) => {
  const action = ctx.callbackQuery.data;
  const { Op } = require('sequelize');
  
  logger.info('Admin callback received', { 
    action, 
    userId: ctx.from.id,
    username: ctx.from.username 
  });
  
  try {
    // Главное меню
    if (action === 'admin_panel') {
      await ctx.answerCbQuery();
      return adminPanel(ctx);
    }
    
    // Управление пользователями
    if (action === 'admin_users') {
      await ctx.answerCbQuery();
      return usersManagement(ctx);
    }
    
    if (action === 'admin_users_list') {
      await ctx.answerCbQuery();
      return usersList(ctx, 0);
    }
    
    if (action.startsWith('admin_users_list_')) {
      const page = parseInt(action.split('_')[3]);
      await ctx.answerCbQuery();
      return usersList(ctx, page);
    }
    
    // Поиск пользователя
    if (action === 'admin_users_search') {
      await ctx.answerCbQuery();
      
      ctx.session = ctx.session || {};
      ctx.session.searchingUser = true;
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Отмена', callback_data: 'admin_users_search_cancel' }]
          ]
        }
      };
      
      await ctx.reply(
        '🔍 <b>Поиск пользователя</b>\n\n' +
        'Введите:\n' +
        '• Username (@username)\n' +
        '• Telegram ID\n' +
        '• Имя или фамилию\n' +
        '• Номер телефона\n\n' +
        '<i>Для отмены нажмите кнопку или отправьте /cancel</i>',
        { parse_mode: 'HTML', ...keyboard }
      );
      
      return;
    }
    
    // Отмена поиска
    if (action === 'admin_users_search_cancel') {
      await ctx.answerCbQuery('Поиск отменен');
      
      if (ctx.session) {
        delete ctx.session.searchingUser;
      }
      
      await ctx.deleteMessage();
      return usersManagement(ctx);
    }
    
    // Заявки на регистрацию
    if (action === 'admin_users_pending') {
      await ctx.answerCbQuery();
      
      try {
        const { RegistrationRequest } = require('../database/models');
        
        // Получаем все заявки со статусом pending
        const registrationRequests = await RegistrationRequest.findAll({
          where: { status: 'pending' },
          order: [['created_at', 'DESC']]
        });
        
        let message = '⏳ <b>Заявки на регистрацию</b>\n\n';
        
        if (registrationRequests.length === 0) {
          message += '✅ Нет ожидающих заявок';
        } else {
          message += `📋 Найдено заявок: ${registrationRequests.length}\n\n`;
          
          registrationRequests.forEach((request, index) => {
            message += `${index + 1}. <b>${request.first_name || ''} ${request.last_name || ''}</b>\n`;
            message += `   👤 @${request.username || 'нет username'}\n`;
            message += `   📱 ID: ${request.telegram_id}\n`;
            
            // Показываем информацию о пользователе
            if (request.contact_info) {
              const info = request.contact_info.substring(0, 100);
              message += `   📝 ${info}${request.contact_info.length > 100 ? '...' : ''}\n`;
            }
            
            // Форматируем дату
            const createdAt = request.created_at || request.createdAt;
            const createdDate = createdAt ? new Date(createdAt) : null;
            const dateStr = createdDate && !isNaN(createdDate.getTime()) 
              ? createdDate.toLocaleString('ru-RU') 
              : 'не указана';
            message += `   📅 Дата: ${dateStr}\n`;
            
            // Кнопка для обработки заявки
            message += `   🔗 /admin_reg_request_${request.id}\n\n`;
          });
        }
        
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Обновить', callback_data: 'admin_users_pending' }],
              [{ text: '🔙 К управлению пользователями', callback_data: 'admin_users' }]
            ]
          }
        };
        
        // Проверяем, откуда был вызов
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
          try {
            await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
          } catch (editError) {
            // Если не можем отредактировать, отправляем новое сообщение
            await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
          }
        } else {
          await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
        }
      } catch (error) {
        logger.error('Error in pending users:', error);
        await ctx.reply('❌ Ошибка при загрузке заявок');
      }
      
      return;
    }
    
    // Управление ресторанами
    if (action === 'admin_restaurants') {
      await ctx.answerCbQuery();
      return restaurantsManagement(ctx);
    }
    
    if (action === 'admin_restaurants_list') {
      await ctx.answerCbQuery();
      return restaurantsList(ctx);
    }
    
    // Статистика по ресторанам
    if (action === 'admin_restaurants_stats') {
      await ctx.answerCbQuery();
      
      try {
        const restaurants = await Restaurant.findAll({
          include: [{
            model: User,
            as: 'users'
          }],
          order: [['created_at', 'DESC']]
        });
        
        let message = '📊 <b>Статистика по ресторанам</b>\n\n';
        
        // Общая статистика
        const totalRestaurants = restaurants.length;
        const activeRestaurants = restaurants.filter(r => r.is_active).length;
        const totalUsers = restaurants.reduce((sum, r) => sum + r.users.length, 0);
        
        message += `<b>Общая информация:</b>\n`;
        message += `• Всего ресторанов: ${totalRestaurants}\n`;
        message += `• Активных: ${activeRestaurants}\n`;
        message += `• Неактивных: ${totalRestaurants - activeRestaurants}\n`;
        message += `• Всего пользователей: ${totalUsers}\n\n`;
        
        // Статистика по каждому ресторану
        if (restaurants.length > 0) {
          message += '<b>По ресторанам:</b>\n\n';
          
          for (const restaurant of restaurants) {
            const ordersCount = await Order.count({ 
              where: { restaurant_id: restaurant.id } 
            });
            
            const lastOrder = await Order.findOne({
              where: { restaurant_id: restaurant.id },
              order: [['created_at', 'DESC']]
            });
            
            message += `<b>${restaurant.name}</b>\n`;
            message += `• Статус: ${restaurant.is_active ? '✅ Активен' : '❌ Неактивен'}\n`;
            message += `• Пользователей: ${restaurant.users.length}\n`;
            message += `• Заказов: ${ordersCount}\n`;
            
            if (lastOrder) {
              message += `• Последний заказ: ${new Date(lastOrder.created_at).toLocaleDateString('ru-RU')}\n`;
            }
            
            message += '\n';
          }
        }
        
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📊 Экспорт статистики', callback_data: 'admin_restaurants_export_stats' }],
              [{ text: '🔄 Обновить', callback_data: 'admin_restaurants_stats' }],
              [{ text: '🔙 К управлению ресторанами', callback_data: 'admin_restaurants' }]
            ]
          }
        };
        
        await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
      } catch (error) {
        logger.error('Error in restaurants stats:', error);
        await ctx.reply('❌ Ошибка при загрузке статистики');
      }
      
      return;
    }
    
    // Экспорт статистики ресторанов
    if (action === 'admin_restaurants_export_stats') {
      await ctx.answerCbQuery('Генерация отчета...');
      
      try {
        const restaurants = await Restaurant.findAll({
          include: [{
            model: User,
            as: 'users'
          }],
          order: [['name', 'ASC']]
        });
        
        let csvContent = 'Ресторан,Статус,Количество пользователей,Количество заказов,Дата создания\n';
        
        for (const restaurant of restaurants) {
          const ordersCount = await Order.count({ 
            where: { restaurant_id: restaurant.id } 
          });
          
          csvContent += `"${restaurant.name}",`;
          csvContent += `"${restaurant.is_active ? 'Активен' : 'Неактивен'}",`;
          csvContent += `${restaurant.users.length},`;
          csvContent += `${ordersCount},`;
          csvContent += `"${restaurant.created_at ? new Date(restaurant.created_at).toLocaleDateString('ru-RU') : ''}"\n`;
        }
        
        // Конвертируем в Buffer для отправки
        const buffer = Buffer.from(csvContent, 'utf-8');
        
        await ctx.replyWithDocument({
          source: buffer,
          filename: `restaurants_stats_${new Date().toISOString().split('T')[0]}.csv`
        }, {
          caption: '📊 Статистика по ресторанам'
        });
        
      } catch (error) {
        logger.error('Error exporting restaurants stats:', error);
        await ctx.reply('❌ Ошибка при экспорте статистики');
      }
      
      return;
    }
    
    // Резервное копирование
    if (action === 'admin_backup') {
      return createBackup(ctx);
    }
    
    // Статистика
    if (action === 'admin_stats') {
      return systemStats(ctx);
    }
    
    // Переключение активности пользователя
    if (action.startsWith('admin_user_toggle_')) {
      const userId = parseInt(action.split('_')[3]);
      logger.info('Toggling user active status', { userId, action });
      
      const user = await User.findByPk(userId);
      if (user) {
        logger.info('User found for toggle', { 
          userId: user.id, 
          telegramId: user.telegram_id,
          currentStatus: user.is_active 
        });
        
        user.is_active = !user.is_active;
        await user.save();
        
        // Отправляем уведомление пользователю
        try {
          const notificationText = user.is_active ?
            '✅ <b>Ваша учетная запись активирована!</b>\n\n' +
            'Теперь вы можете использовать все функции бота.\n' +
            'Используйте /start для начала работы.' :
            '🚫 <b>Ваша учетная запись деактивирована!</b>\n\n' +
            'Доступ к функциям бота временно ограничен.\n' +
            'Обратитесь к администратору для получения информации.';
          
          await ctx.telegram.sendMessage(user.telegram_id, notificationText, {
            parse_mode: 'HTML'
          });
          
          await ctx.answerCbQuery(
            `Пользователь ${user.is_active ? 'активирован' : 'заблокирован'} и уведомлен`
          );
        } catch (err) {
          logger.error('Error sending activation notification:', err);
          await ctx.answerCbQuery(
            `Пользователь ${user.is_active ? 'активирован' : 'заблокирован'}`
          );
        }
        
        return userManagement(ctx, userId);
      }
    }
    
    // Изменение роли пользователя
    if (action.startsWith('admin_user_role_')) {
      const userId = parseInt(action.split('_')[3]);
      await ctx.answerCbQuery();
      
      const user = await User.findByPk(userId);
      if (!user) {
        return ctx.reply('❌ Пользователь не найден');
      }
      
      const roles = ['admin', 'manager', 'restaurant', 'buyer'];
      const roleNames = {
        'admin': '👑 Администратор',
        'manager': '💼 Менеджер',
        'restaurant': '🍽️ Ресторан',
        'buyer': '🛒 Закупщик'
      };
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: roles
            .filter(role => role !== user.role)
            .map(role => ([{ 
              text: roleNames[role], 
              callback_data: `admin_set_role_${userId}_${role}` 
            }]))
            .concat([[{ text: '🔙 Назад', callback_data: `user_${userId}` }]])
        }
      };
      
      return ctx.reply(
        `🔄 <b>Изменение роли пользователя</b>\n\n` +
        `Текущая роль: ${roleNames[user.role]}\n` +
        `Выберите новую роль:`,
        { parse_mode: 'HTML', ...keyboard }
      );
    }
    
    // Установка новой роли
    if (action.startsWith('admin_set_role_')) {
      const parts = action.split('_');
      const userId = parseInt(parts[3]);
      const newRole = parts[4];
      
      logger.info('Setting new role for user', { userId, newRole, action });
      
      const user = await User.findByPk(userId);
      if (user) {
        logger.info('User found', { 
          userId: user.id, 
          telegramId: user.telegram_id,
          currentRole: user.role,
          isActive: user.is_active 
        });
        const oldRole = user.role;
        const wasPending = oldRole === 'pending';
        
        user.role = newRole;
        // Если был pending, активируем пользователя
        if (wasPending) {
          user.is_active = true;
          
          // Обновляем статус заявки на регистрацию
          const { RegistrationRequest } = require('../database/models');
          await RegistrationRequest.update(
            { status: 'approved' },
            { where: { telegram_id: user.telegram_id, status: 'pending' } }
          );
        }
        await user.save();
        
        // Отправляем уведомление пользователю
        const roleNames = {
          'admin': '👑 Администратор',
          'manager': '💼 Менеджер',
          'restaurant': '🍽️ Ресторан',
          'buyer': '🛒 Закупщик'
        };
        
        try {
          let notificationText = '';
          
          if (wasPending) {
            notificationText = 
              '✅ <b>Ваша заявка одобрена!</b>\n\n' +
              `Вам назначена роль: ${roleNames[newRole]}\n\n` +
              'Теперь вы можете использовать все функции бота.\n' +
              'Используйте /start для начала работы.';
          } else {
            notificationText = 
              '🔄 <b>Ваша роль изменена!</b>\n\n' +
              `Старая роль: ${roleNames[oldRole] || oldRole}\n` +
              `Новая роль: ${roleNames[newRole]}\n\n` +
              'Используйте /start для обновления меню.';
          }
          
          logger.info('Sending role change notification', { 
            userId: user.id, 
            telegramId: user.telegram_id,
            wasPending,
            oldRole,
            newRole 
          });
          
          await ctx.telegram.sendMessage(user.telegram_id, notificationText, {
            parse_mode: 'HTML'
          });
          
          logger.info('Role change notification sent successfully');
          await ctx.answerCbQuery('✅ Роль изменена и уведомление отправлено');
        } catch (err) {
          logger.error('Error sending role change notification:', err);
          await ctx.answerCbQuery('✅ Роль изменена, но не удалось отправить уведомление');
        }
        
        await ctx.deleteMessage();
        return userManagement(ctx, userId);
      }
    }
    
    // Изменение ресторана пользователя
    if (action.startsWith('admin_user_restaurant_')) {
      const userId = parseInt(action.split('_')[3]);
      await ctx.answerCbQuery();
      
      const restaurants = await Restaurant.findAll({ 
        where: { is_active: true },
        order: [['name', 'ASC']] 
      });
      
      if (restaurants.length === 0) {
        return ctx.reply('❌ Нет активных ресторанов');
      }
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: restaurants
            .map(r => ([{ 
              text: r.name, 
              callback_data: `admin_set_restaurant_${userId}_${r.id}` 
            }]))
            .concat([[{ text: '❌ Убрать ресторан', callback_data: `admin_set_restaurant_${userId}_null` }]])
            .concat([[{ text: '🔙 Назад', callback_data: `user_${userId}` }]])
        }
      };
      
      return ctx.reply(
        `🏢 <b>Изменение ресторана пользователя</b>\n\n` +
        `Выберите ресторан:`,
        { parse_mode: 'HTML', ...keyboard }
      );
    }
    
    // Установка ресторана
    if (action.startsWith('admin_set_restaurant_')) {
      const parts = action.split('_');
      const userId = parseInt(parts[3]);
      const restaurantId = parts[4] === 'null' ? null : parseInt(parts[4]);
      
      const user = await User.findByPk(userId);
      if (user) {
        const oldRestaurantId = user.restaurant_id;
        user.restaurant_id = restaurantId;
        await user.save();
        
        // Отправляем уведомление пользователю об изменении ресторана
        try {
          let notificationText = '';
          
          if (restaurantId === null) {
            // Ресторан был удален
            notificationText = 
              '🏢 <b>Изменение ресторана</b>\n\n' +
              'Вы были отвязаны от ресторана.\n' +
              'Обратитесь к администратору для назначения нового ресторана.';
          } else {
            // Ресторан назначен или изменен
            const restaurant = await Restaurant.findByPk(restaurantId);
            if (restaurant) {
              if (oldRestaurantId === null) {
                // Первое назначение ресторана
                notificationText = 
                  '🏢 <b>Назначение ресторана</b>\n\n' +
                  `Вам назначен ресторан: ${restaurant.name}\n\n` +
                  'Теперь вы можете создавать заказы для этого ресторана.';
              } else {
                // Изменение ресторана
                notificationText = 
                  '🏢 <b>Изменение ресторана</b>\n\n' +
                  `Вам назначен новый ресторан: ${restaurant.name}\n\n` +
                  'Все будущие заказы будут создаваться для этого ресторана.';
              }
            }
          }
          
          if (notificationText) {
            await ctx.telegram.sendMessage(user.telegram_id, notificationText, {
              parse_mode: 'HTML'
            });
          }
        } catch (notifError) {
          logger.error('Error sending restaurant change notification:', notifError);
        }
        
        await ctx.answerCbQuery('✅ Ресторан изменен');
        await ctx.deleteMessage();
        return userManagement(ctx, userId);
      }
    }
    
    // Редактирование данных пользователя
    if (action.startsWith('admin_user_edit_')) {
      const userId = parseInt(action.split('_')[3]);
      await ctx.answerCbQuery();
      
      const user = await User.findByPk(userId);
      if (!user) {
        return ctx.reply('❌ Пользователь не найден');
      }
      
      // Сохраняем в сессии ID редактируемого пользователя
      ctx.session = ctx.session || {};
      ctx.session.editingUserId = userId;
      ctx.session.editingUserField = null;
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📝 Изменить имя', callback_data: `admin_edit_user_firstname_${userId}` },
              { text: '📝 Изменить фамилию', callback_data: `admin_edit_user_lastname_${userId}` }
            ],
            [
              { text: '📱 Изменить телефон', callback_data: `admin_edit_user_phone_${userId}` }
            ],
            [
              { text: '🔙 Назад', callback_data: `user_${userId}` }
            ]
          ]
        }
      };
      
      let message = '📝 <b>Редактирование данных пользователя</b>\n\n';
      message += `<b>Имя:</b> ${user.first_name || 'не указано'}\n`;
      message += `<b>Фамилия:</b> ${user.last_name || 'не указано'}\n`;
      message += `<b>Телефон:</b> ${user.phone || 'не указан'}\n\n`;
      message += 'Выберите, что хотите изменить:';
      
      return ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    }
    
    // Обработка выбора поля для редактирования
    if (action.match(/^admin_edit_user_(firstname|lastname|phone)_(\d+)$/)) {
      const match = action.match(/^admin_edit_user_(firstname|lastname|phone)_(\d+)$/);
      const field = match[1];
      const userId = parseInt(match[2]);
      
      await ctx.answerCbQuery();
      
      ctx.session = ctx.session || {};
      ctx.session.editingUserId = userId;
      ctx.session.editingUserField = field;
      
      const fieldNames = {
        'firstname': 'имя',
        'lastname': 'фамилию',
        'phone': 'номер телефона'
      };
      
      let message = `📝 Введите новое ${fieldNames[field]}:\n\n`;
      
      if (field === 'phone') {
        message += '<b>Примеры формата:</b>\n' +
                   '• +7 (999) 123-45-67\n' +
                   '• 8 999 123 45 67\n' +
                   '• 89991234567\n\n';
      }
      
      message += '<i>Отправьте сообщение с новым значением или /cancel для отмены</i>';
      
      await ctx.reply(message, { parse_mode: 'HTML' });
      
      return;
    }
    
    // Удаление пользователя
    if (action.startsWith('admin_user_delete_')) {
      const userId = parseInt(action.split('_')[3]);
      await ctx.answerCbQuery();
      
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Да, удалить', callback_data: `admin_confirm_delete_user_${userId}` },
              { text: '❌ Отмена', callback_data: `user_${userId}` }
            ]
          ]
        }
      };
      
      return ctx.reply(
        '⚠️ <b>Подтверждение удаления</b>\n\n' +
        'Вы действительно хотите удалить этого пользователя?\n' +
        'Это действие нельзя отменить!',
        { parse_mode: 'HTML', ...keyboard }
      );
    }
    
    // Подтверждение удаления пользователя
    if (action.startsWith('admin_confirm_delete_user_')) {
      const userId = parseInt(action.split('_')[4]);
      logger.info('Deleting user', { userId, action });
      
      try {
        const user = await User.findByPk(userId);
        if (!user) {
          logger.error('User not found for deletion', { userId });
          await ctx.answerCbQuery('❌ Пользователь не найден');
          return;
        }
        
        const telegramId = user.telegram_id;
        const userRole = user.role;
        const restaurantId = user.restaurant_id;
        
        // Начинаем транзакцию для безопасного удаления
        const { sequelize } = require('../database/models');
        const transaction = await sequelize.transaction();
        
        try {
          // Удаляем связанные заявки на регистрацию
          const { RegistrationRequest, ScheduledOrder, Purchase, Settings } = require('../database/models');
          await RegistrationRequest.destroy({
            where: { telegram_id: telegramId },
            transaction
          });
          
          // Удаляем запланированные заказы созданные пользователем
          await ScheduledOrder.destroy({
            where: { created_by: userId },
            transaction
          });
          
          // Обновляем Purchase - устанавливаем buyer_id в NULL
          await Purchase.update(
            { buyer_id: null },
            { 
              where: { buyer_id: userId },
              transaction 
            }
          );
          
          // Обновляем заявки на регистрацию, обработанные этим пользователем
          await RegistrationRequest.update(
            { processed_by: null },
            {
              where: { processed_by: userId },
              transaction
            }
          );
          
          // Если это пользователь ресторана, удаляем его черновики
          if (userRole === 'restaurant') {
            const { DraftOrder, DraftOrderItem } = require('../database/models');
            
            // Находим все черновики пользователя
            const drafts = await DraftOrder.findAll({
              where: { user_id: userId },
              transaction
            });
            
            // Удаляем элементы черновиков
            for (const draft of drafts) {
              await DraftOrderItem.destroy({
                where: { draft_order_id: draft.id },
                transaction
              });
            }
            
            // Удаляем сами черновики
            await DraftOrder.destroy({
              where: { user_id: userId },
              transaction
            });
          }
          
          // Обновляем заказы - устанавливаем поля в NULL вместо удаления
          await Order.update(
            { user_id: null },
            { 
              where: { user_id: userId },
              transaction 
            }
          );
          
          // Обновляем заказы обработанные/одобренные/отклоненные пользователем
          await Order.update(
            { processed_by: null },
            { 
              where: { processed_by: userId },
              transaction 
            }
          );
          
          await Order.update(
            { approved_by: null },
            { 
              where: { approved_by: userId },
              transaction 
            }
          );
          
          await Order.update(
            { rejected_by: null },
            { 
              where: { rejected_by: userId },
              transaction 
            }
          );
          
          // Удаляем историю цен
          const { PriceHistory } = require('../database/models');
          await PriceHistory.destroy({
            where: { user_id: userId },
            transaction
          });
          
          // Удаляем пользователя
          await user.destroy({ transaction });
          
          // Подтверждаем транзакцию
          await transaction.commit();
          
          logger.info('User deleted successfully', { userId, telegramId, userRole });
          await ctx.answerCbQuery('✅ Пользователь удален');
          await ctx.deleteMessage();
          return ctx.reply('✅ Пользователь успешно удален');
          
        } catch (error) {
          // Откатываем транзакцию в случае ошибки
          await transaction.rollback();
          throw error;
        }
        
      } catch (error) {
        logger.error('Error deleting user', { userId, error: error.message, stack: error.stack });
        await ctx.answerCbQuery('❌ Ошибка при удалении');
        return ctx.reply(
          '❌ Произошла ошибка при удалении пользователя.\n\n' +
          `Детали: ${error.message}`
        );
      }
    }
    
    // Добавление администратора
    if (action === 'admin_users_add_admin') {
      await ctx.answerCbQuery();
      return ctx.scene.enter('add_admin');
    }
    
    // Добавление ресторана
    if (action === 'admin_restaurants_add') {
      await ctx.answerCbQuery();
      return ctx.scene.enter('add_restaurant');
    }
    
    // Редактирование ресторана
    if (action.startsWith('admin_restaurant_edit_')) {
      const restaurantId = parseInt(action.split('_')[3]);
      await ctx.answerCbQuery();
      ctx.scene.state.restaurantId = restaurantId;
      return ctx.scene.enter('edit_restaurant');
    }
    
    // Переключение активности ресторана
    if (action.startsWith('admin_restaurant_toggle_')) {
      const restaurantId = parseInt(action.split('_')[3]);
      const restaurant = await Restaurant.findByPk(restaurantId);
      if (restaurant) {
        restaurant.is_active = !restaurant.is_active;
        await restaurant.save();
        await ctx.answerCbQuery(`Ресторан ${restaurant.is_active ? 'активирован' : 'деактивирован'}`);
        return restaurantManagement(ctx, restaurantId);
      }
    }
    
    // Управление филиалами
    if (action.startsWith('admin_branches:')) {
      const restaurantId = parseInt(action.split(':')[1]);
      await ctx.answerCbQuery();
      const { manageBranches } = require('./restaurantBranch');
      return manageBranches(ctx, restaurantId);
    }
    
    // Настройки системы
    if (action === 'admin_settings') {
      await ctx.answerCbQuery();
      return systemSettings(ctx);
    }
    
    // Просмотр логов
    if (action === 'admin_logs') {
      await ctx.answerCbQuery();
      return viewLogs(ctx);
    }
    
    // Настройки расписания
    if (action === 'admin_settings_schedule') {
      await ctx.answerCbQuery();
      return scheduleSettings(ctx);
    }
    
    // Настройки уведомлений
    if (action === 'admin_settings_notifications') {
      await ctx.answerCbQuery();
      return notificationSettings(ctx);
    }
    
    // Добавить расписание
    if (action === 'admin_schedule_add') {
      await ctx.answerCbQuery();
      return ctx.scene.enter('add_schedule');
    }
    
    // Обработка действий с расписанием
    if (action.startsWith('admin_schedule_toggle_')) {
      const scheduleId = parseInt(action.split('_')[3]);
      await toggleSchedule(ctx, scheduleId);
      return;
    }
    
    if (action.startsWith('admin_schedule_edit_time_')) {
      const scheduleId = parseInt(action.split('_')[4]);
      await editScheduleTime(ctx, scheduleId);
      return;
    }
    
    if (action.startsWith('admin_schedule_edit_days_')) {
      const scheduleId = parseInt(action.split('_')[4]);
      await editScheduleDays(ctx, scheduleId);
      return;
    }
    
    if (action.startsWith('admin_schedule_delete_')) {
      const scheduleId = parseInt(action.split('_')[3]);
      await deleteSchedule(ctx, scheduleId);
      return;
    }
    
    // Обработка заявки на регистрацию
    if (action.startsWith('admin_reg_request:')) {
      const requestId = parseInt(action.split(':')[1]);
      await ctx.answerCbQuery();
      
      try {
        const { RegistrationRequest } = require('../database/models');
        const request = await RegistrationRequest.findByPk(requestId);
        
        if (!request || request.status !== 'pending') {
          return ctx.reply('❌ Заявка не найдена или уже обработана');
        }
        
        // Логируем для отладки
        logger.info('Processing registration request', {
          requestId,
          created_at: request.created_at,
          createdAt: request.createdAt,
          dataValues: Object.keys(request.dataValues)
        });
        
        // Показываем детали заявки
        let message = '📋 <b>Заявка на регистрацию</b>\n\n';
        message += `👤 Пользователь: ${request.first_name || ''} ${request.last_name || ''}\n`;
        message += `📱 Username: @${request.username || 'не указан'}\n`;
        message += `🆔 Telegram ID: ${request.telegram_id}\n\n`;
        
        if (request.notes || request.contact_info) {
          message += `📝 <b>Информация от пользователя:</b>\n`;
          message += `${request.notes || request.contact_info}\n\n`;
        }
        
        // Sequelize может использовать либо created_at, либо createdAt в зависимости от настроек
        const createdAt = request.created_at || request.createdAt;
        const createdDate = createdAt ? new Date(createdAt) : null;
        const dateStr = createdDate && !isNaN(createdDate.getTime()) 
          ? createdDate.toLocaleString('ru-RU') 
          : 'не указана';
        message += `📅 Дата подачи: ${dateStr}\n`;
        
        const isAdmin = ctx.user && ctx.user.role === 'admin';
        
        // Формируем кнопки одобрения в зависимости от роли
        const approvalButtons = [];
        
        // Ресторан - доступно всем
        approvalButtons.push([
          { text: '✅ Одобрить как ресторан', callback_data: `admin_approve_reg:${requestId}:restaurant` }
        ]);
        
        // Менеджер и закупщик - только для админов
        if (isAdmin) {
          approvalButtons.push([
            { text: '📊 Одобрить как менеджер', callback_data: `admin_approve_reg:${requestId}:manager` }
          ]);
        }
        
        // Закупщик - доступно всем
        approvalButtons.push([
          { text: '🛒 Одобрить как закупщик', callback_data: `admin_approve_reg:${requestId}:buyer` }
        ]);
        
        // Отклонить и назад
        approvalButtons.push(
          [{ text: '❌ Отклонить', callback_data: `admin_reject_reg:${requestId}` }],
          [{ text: '🔙 Назад', callback_data: 'admin_users_pending' }]
        );
        
        const keyboard = {
          reply_markup: {
            inline_keyboard: approvalButtons
          }
        };
        
        await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
      } catch (error) {
        logger.error('Error processing registration request:', error);
        await ctx.reply('❌ Ошибка при обработке заявки');
      }
      
      return;
    }
    
    // Одобрение заявки на регистрацию
    if (action.startsWith('admin_approve_reg:')) {
      const [_, requestId, role] = action.split(':');
      await ctx.answerCbQuery();
      
      try {
        // Проверяем права на назначение роли
        const isAdmin = ctx.user && ctx.user.role === 'admin';
        if (role === 'manager' && !isAdmin) {
          return ctx.reply('❌ Только администратор может назначать роль менеджера');
        }
        
        const { RegistrationRequest } = require('../database/models');
        const request = await RegistrationRequest.findByPk(requestId);
        
        if (!request || request.status !== 'pending') {
          return ctx.reply('❌ Заявка не найдена или уже обработана');
        }
        
        // Создаем или обновляем пользователя
        let user = await User.findOne({ where: { telegram_id: request.telegram_id } });
        
        if (!user) {
          user = await User.create({
            telegram_id: request.telegram_id,
            username: request.username,
            first_name: request.first_name,
            last_name: request.last_name,
            role: role,
            is_active: true,
            phone: request.contact_phone
          });
        } else {
          user.role = role;
          user.is_active = true;
          await user.save();
        }
        
        // Обновляем статус заявки
        request.status = 'approved';
        request.processed_by = ctx.user.id;
        request.processed_at = new Date();
        await request.save();
        
        // Уведомляем других админов и менеджеров о том, что заявка обработана
        try {
          const processedByName = ctx.user.first_name || ctx.user.username || 'Администратор';
          const syncMessage = 
            `✅ <b>Заявка на регистрацию обработана</b>\n\n` +
            `👤 Пользователь: ${request.first_name || ''} ${request.last_name || ''}\n` +
            `📱 Username: @${request.username || 'не указан'}\n` +
            `🆔 Telegram ID: ${request.telegram_id}\n\n` +
            `✅ Обработал: ${processedByName}\n` +
            `📅 Время: ${new Date().toLocaleString('ru-RU')}`;
          
          // Получаем всех админов и менеджеров кроме текущего пользователя
          const otherAdminsAndManagers = await User.findAll({
            where: {
              role: ['admin', 'manager'],
              is_active: true,
              id: { [require('sequelize').Op.ne]: ctx.user.id }
            }
          });
          
          // Отправляем уведомления
          const notificationService = require('../services/NotificationService');
          await Promise.all(
            otherAdminsAndManagers.map(user => 
              notificationService.sendToTelegramId(user.telegram_id, syncMessage, {
                parse_mode: 'HTML'
              })
            )
          );
          
          logger.info(`Sent registration sync notifications to ${otherAdminsAndManagers.length} users`);
        } catch (syncError) {
          logger.error('Error sending registration sync notifications:', syncError);
          // Не прерываем основной процесс из-за ошибки синхронизации
        }
        
        // Если это ресторан, показываем выбор ресторана
        if (role === 'restaurant') {
          const restaurants = await Restaurant.findAll({
            where: { is_active: true },
            order: [['name', 'ASC']]
          });
          
          const buttons = restaurants.map(r => 
            [{ text: r.name, callback_data: `admin_assign_restaurant:${user.id}:${r.id}` }]
          );
          
          buttons.push([{ text: '➕ Создать новый ресторан', callback_data: `admin_create_restaurant_for:${user.id}` }]);
          buttons.push([{ text: '⏭️ Пропустить', callback_data: `admin_skip_restaurant:${user.id}` }]);
          
          const keyboard = { reply_markup: { inline_keyboard: buttons } };
          
          await ctx.editMessageText(
            `✅ <b>Пользователь одобрен как ${role === 'restaurant' ? 'представитель ресторана' : role === 'manager' ? 'менеджер' : 'закупщик'}</b>\n\n` +
            `Выберите ресторан для привязки:`,
            { parse_mode: 'HTML', ...keyboard }
          );
        } else {
          // Для других ролей сразу уведомляем пользователя
          await notifyUserAboutApproval(ctx, user, role);
          
          await ctx.editMessageText(
            `✅ <b>Заявка одобрена!</b>\n\n` +
            `Пользователь ${user.first_name} ${user.last_name || ''} добавлен как ${role === 'manager' ? 'менеджер' : 'закупщик'}.\n` +
            `Уведомление отправлено.`,
            { parse_mode: 'HTML' }
          );
        }
      } catch (error) {
        logger.error('Error approving registration:', error);
        await ctx.reply('❌ Ошибка при одобрении заявки');
      }
      
      return;
    }
    
    // Привязка ресторана к пользователю
    if (action.startsWith('admin_assign_restaurant:')) {
      const [_, userId, restaurantId] = action.split(':');
      await ctx.answerCbQuery();
      
      try {
        const user = await User.findByPk(userId);
        if (user) {
          const restaurant = await Restaurant.findByPk(parseInt(restaurantId));
          user.restaurant_id = parseInt(restaurantId);
          await user.save();
          
          await notifyUserAboutApproval(ctx, user, 'restaurant', restaurantId);
          
          // Уведомляем других админов и менеджеров о завершении регистрации
          try {
            const processedByName = ctx.user.first_name || ctx.user.username || 'Администратор';
            const syncMessage = 
              `✅ <b>Регистрация ресторана завершена</b>\n\n` +
              `👤 Пользователь: ${user.first_name || ''} ${user.last_name || ''}\n` +
              `📱 Username: @${user.username || 'не указан'}\n` +
              `🆔 Telegram ID: ${user.telegram_id}\n` +
              `🏪 Ресторан: ${restaurant?.name || 'Не указан'}\n\n` +
              `✅ Обработал: ${processedByName}\n` +
              `📅 Время: ${new Date().toLocaleString('ru-RU')}`;
            
            // Получаем всех админов и менеджеров кроме текущего пользователя
            const otherAdminsAndManagers = await User.findAll({
              where: {
                role: ['admin', 'manager'],
                is_active: true,
                id: { [require('sequelize').Op.ne]: ctx.user.id }
              }
            });
            
            // Отправляем уведомления
            const notificationService = require('../services/NotificationService');
            await Promise.all(
              otherAdminsAndManagers.map(user => 
                notificationService.sendToTelegramId(user.telegram_id, syncMessage, {
                  parse_mode: 'HTML'
                })
              )
            );
            
            logger.info(`Sent restaurant assignment sync notifications to ${otherAdminsAndManagers.length} users`);
          } catch (syncError) {
            logger.error('Error sending restaurant assignment sync notifications:', syncError);
          }
          
          await ctx.editMessageText(
            `✅ <b>Готово!</b>\n\n` +
            `Пользователь привязан к ресторану и уведомлен об одобрении.`,
            { parse_mode: 'HTML' }
          );
        }
      } catch (error) {
        logger.error('Error assigning restaurant:', error);
        await ctx.reply('❌ Ошибка при привязке ресторана');
      }
      
      return;
    }
    
    // Пропуск привязки ресторана
    if (action.startsWith('admin_skip_restaurant:')) {
      const userId = action.split(':')[1];
      await ctx.answerCbQuery();
      
      try {
        const user = await User.findByPk(userId);
        await notifyUserAboutApproval(ctx, user, 'restaurant');
        
        // Уведомляем других админов и менеджеров о завершении регистрации
        try {
          const processedByName = ctx.user.first_name || ctx.user.username || 'Администратор';
          const syncMessage = 
            `✅ <b>Регистрация ресторана завершена</b>\n\n` +
            `👤 Пользователь: ${user.first_name || ''} ${user.last_name || ''}\n` +
            `📱 Username: @${user.username || 'не указан'}\n` +
            `🆔 Telegram ID: ${user.telegram_id}\n` +
            `🏪 Ресторан: Будет привязан позже\n\n` +
            `✅ Обработал: ${processedByName}\n` +
            `📅 Время: ${new Date().toLocaleString('ru-RU')}`;
          
          // Получаем всех админов и менеджеров кроме текущего пользователя
          const otherAdminsAndManagers = await User.findAll({
            where: {
              role: ['admin', 'manager'],
              is_active: true,
              id: { [require('sequelize').Op.ne]: ctx.user.id }
            }
          });
          
          // Отправляем уведомления
          const notificationService = require('../services/NotificationService');
          await Promise.all(
            otherAdminsAndManagers.map(user => 
              notificationService.sendToTelegramId(user.telegram_id, syncMessage, {
                parse_mode: 'HTML'
              })
            )
          );
          
          logger.info(`Sent restaurant skip sync notifications to ${otherAdminsAndManagers.length} users`);
        } catch (syncError) {
          logger.error('Error sending restaurant skip sync notifications:', syncError);
        }
        
        await ctx.editMessageText(
          `✅ <b>Готово!</b>\n\n` +
          `Пользователь одобрен как представитель ресторана.\n` +
          `Ресторан можно привязать позже через управление пользователями.`,
          { parse_mode: 'HTML' }
        );
      } catch (error) {
        logger.error('Error skipping restaurant:', error);
        await ctx.reply('❌ Ошибка');
      }
      
      return;
    }
    
    // Создание нового ресторана для пользователя
    if (action.startsWith('admin_create_restaurant_for:')) {
      const userId = action.split(':')[1];
      await ctx.answerCbQuery();
      
      ctx.session = ctx.session || {};
      ctx.session.creatingRestaurantForUser = userId;
      
      await ctx.editMessageText(
        '🏢 <b>Создание нового ресторана</b>\n\n' +
        'Введите название ресторана:',
        { parse_mode: 'HTML' }
      );
      
      return;
    }
    
    // Отклонение заявки
    if (action.startsWith('admin_reject_reg:')) {
      const requestId = action.split(':')[1];
      await ctx.answerCbQuery();
      
      // Запрашиваем причину отклонения
      ctx.session = ctx.session || {};
      ctx.session.rejectingRequestId = requestId;
      
      await ctx.editMessageText(
        '❌ <b>Отклонение заявки</b>\n\n' +
        'Введите причину отклонения (она будет отправлена пользователю):',
        { parse_mode: 'HTML' }
      );
      
      return;
    }
    
    // Переход к пользователю (для кнопки "Назад")
    if (action.match(/^user_(\d+)$/)) {
      const userId = parseInt(action.match(/^user_(\d+)$/)[1]);
      await ctx.answerCbQuery();
      await ctx.deleteMessage();
      
      return userManagement(ctx, userId);
    }
  } catch (error) {
    logger.error('Error in handleAdminCallbacks:', error);
    ctx.answerCbQuery('Произошла ошибка');
  }
};

// Вспомогательная функция для уведомления пользователя об одобрении
async function notifyUserAboutApproval(ctx, user, role, restaurantId = null) {
  const roleNames = {
    'restaurant': 'представитель ресторана',
    'manager': 'менеджер-закупщик',
    'buyer': 'закупщик'
  };
  
  let message = '✅ <b>Ваша заявка одобрена!</b>\n\n';
  message += `Вам назначена роль: ${roleNames[role]}\n`;
  
  if (role === 'restaurant' && restaurantId) {
    const restaurant = await Restaurant.findByPk(restaurantId);
    if (restaurant) {
      message += `🏢 Ресторан: ${restaurant.name}\n`;
    }
  }
  
  message += '\nТеперь вы можете использовать все функции системы.\n';
  message += 'Используйте /start для начала работы.';
  
  try {
    await ctx.telegram.sendMessage(user.telegram_id, message, {
      parse_mode: 'HTML'
    });
  } catch (error) {
    logger.error('Error notifying user about approval:', error);
  }
}

// Обработчики команд по ID
const handleUserCommand = async (ctx) => {
  const match = ctx.message.text.match(/^\/user_(\d+)$/);
  if (match) {
    const userId = parseInt(match[1]);
    return userManagement(ctx, userId);
  }
};

const handleRestaurantCommand = async (ctx) => {
  const match = ctx.message.text.match(/^\/restaurant_(\d+)$/);
  if (match) {
    const restaurantId = parseInt(match[1]);
    return restaurantManagement(ctx, restaurantId);
  }
};

// Управление конкретным рестораном
const restaurantManagement = async (ctx, restaurantId) => {
  try {
    const restaurant = await Restaurant.findByPk(restaurantId, {
      include: [{
        model: User,
        as: 'users'
      }]
    });

    if (!restaurant) {
      return ctx.reply('Ресторан не найден');
    }

    const ordersCount = await Order.count({ 
      where: { restaurant_id: restaurant.id } 
    });

    let message = `🏢 <b>${restaurant.name}</b>\n\n`;
    message += `<b>ID:</b> ${restaurant.id}\n`;
    message += `<b>Адрес:</b> ${restaurant.address || 'не указан'}\n`;
    message += `<b>Телефон:</b> ${restaurant.phone || 'не указан'}\n`;
    message += `<b>Email:</b> ${restaurant.email || 'не указан'}\n`;
    message += `<b>Статус:</b> ${restaurant.is_active ? '✅ Активен' : '❌ Неактивен'}\n`;
    message += `<b>Дата создания:</b> ${restaurant.created_at ? new Date(restaurant.created_at).toLocaleString('ru-RU') : 'не указана'}\n`;
    message += `\n<b>📊 Статистика:</b>\n`;
    message += `Пользователей: ${restaurant.users.length}\n`;
    message += `Заказов: ${ordersCount}\n`;

    if (restaurant.users.length > 0) {
      message += '\n<b>👥 Пользователи:</b>\n';
      restaurant.users.forEach((user, index) => {
        message += `${index + 1}. ${user.first_name || ''} ${user.last_name || ''} (@${user.username || 'нет'}) - ${user.role}\n`;
      });
    }

    // Получаем информацию о филиалах
    const { RestaurantBranch } = require('../database/models');
    const branches = await RestaurantBranch.findAll({
      where: { restaurantId: restaurant.id, isActive: true }
    });
    
    if (branches.length > 0) {
      message += `\n<b>🏢 Филиалы (${branches.length}):</b>\n`;
      branches.forEach((branch, index) => {
        message += `${index + 1}. ${branch.address}`;
        if (branch.isMain) message += ' (Главный)';
        message += '\n';
      });
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { 
              text: restaurant.is_active ? '🚫 Деактивировать' : '✅ Активировать', 
              callback_data: `admin_restaurant_toggle_${restaurant.id}` 
            }
          ],
          [
            { text: '📝 Редактировать данные', callback_data: `admin_restaurant_edit_${restaurant.id}` }
          ],
          [
            { text: '🏢 Управление филиалами', callback_data: `admin_branches:${restaurant.id}` }
          ],
          [
            { text: '👥 Управление пользователями', callback_data: `admin_restaurant_users_${restaurant.id}` }
          ],
          [
            { text: '⏰ Расписание отправки заказов', callback_data: `manager_restaurant_schedule:${restaurant.id}` }
          ],
          [
            { text: '🗑️ Удалить ресторан', callback_data: `admin_restaurant_delete_${restaurant.id}` }
          ],
          [
            { text: '🔙 К списку ресторанов', callback_data: 'admin_restaurants_list' }
          ]
        ]
      }
    };

    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error in restaurantManagement:', error);
    ctx.reply('Произошла ошибка при загрузке информации о ресторане');
  }
};

// Настройки системы
const systemSettings = async (ctx) => {
  try {
    const settings = await Settings.findAll();
    
    let message = '⚙️ <b>Настройки системы</b>\n\n';
    
    if (settings.length > 0) {
      settings.forEach(setting => {
        message += `<b>${setting.key}:</b> ${setting.value}\n`;
      });
    } else {
      message += 'Настройки не найдены\n';
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📧 Настройки Email', callback_data: 'admin_settings_email' },
            { text: '⏰ Расписание', callback_data: 'admin_settings_schedule' }
          ],
          [
            { text: '🔔 Уведомления', callback_data: 'admin_settings_notifications' }
          ],
          [
            { text: '🔙 Назад', callback_data: 'admin_panel' }
          ]
        ]
      }
    };
    
    await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error in systemSettings:', error);
    ctx.reply('Произошла ошибка при загрузке настроек');
  }
};

// Просмотр логов
const viewLogs = async (ctx) => {
  try {
    const logsDir = path.join(__dirname, '../../logs');
    const logFile = path.join(logsDir, 'application.log');
    
    // Проверяем существование файла
    try {
      await fs.access(logFile);
    } catch {
      return ctx.reply('📋 Файл логов не найден');
    }
    
    // Читаем последние строки лога
    const { stdout } = await execPromise(`tail -n 50 "${logFile}"`);
    
    if (!stdout) {
      return ctx.reply('📋 Логи пусты');
    }
    
    // Разбиваем логи на части по 3000 символов (ограничение Telegram)
    const chunks = stdout.match(/[\s\S]{1,3000}/g) || [];
    
    for (const [index, chunk] of chunks.entries()) {
      await ctx.reply(
        `📋 <b>Системные логи (часть ${index + 1}/${chunks.length}):</b>\n\n` +
        `<code>${chunk}</code>`,
        { parse_mode: 'HTML' }
      );
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Обновить', callback_data: 'admin_logs' },
            { text: '🗑️ Очистить логи', callback_data: 'admin_logs_clear' }
          ],
          [
            { text: '🔙 Назад', callback_data: 'admin_panel' }
          ]
        ]
      }
    };
    
    await ctx.reply('Выберите действие:', keyboard);
  } catch (error) {
    logger.error('Error in viewLogs:', error);
    ctx.reply('Произошла ошибка при загрузке логов');
  }
};

// Настройки уведомлений
const notificationSettings = async (ctx) => {
  try {
    const settings = await Settings.findAll({
      where: {
        key: {
          [Op.in]: ['notification_enabled', 'notification_time', 'notification_days_before']
        }
      }
    });
    
    const settingsMap = {};
    settings.forEach(s => {
      settingsMap[s.key] = s.value;
    });
    
    let message = '🔔 <b>Настройки уведомлений</b>\n\n';
    
    message += `<b>Статус:</b> ${settingsMap.notification_enabled === 'true' ? '✅ Включены' : '❌ Выключены'}\n`;
    message += `<b>Время уведомления:</b> ${settingsMap.notification_time || '09:00'}\n`;
    message += `<b>За сколько дней:</b> ${settingsMap.notification_days_before || '1'} дней\n\n`;
    
    message += '<i>Уведомления отправляются ответственным пользователям о необходимости подготовить заказ.</i>';
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { 
              text: settingsMap.notification_enabled === 'true' ? '🔕 Выключить' : '🔔 Включить', 
              callback_data: 'admin_toggle_notifications' 
            }
          ],
          [
            { text: '⏰ Изменить время', callback_data: 'admin_edit_notification_time' },
            { text: '📅 Изменить дни', callback_data: 'admin_edit_notification_days' }
          ],
          [
            { text: '🔙 Назад', callback_data: 'admin_settings' }
          ]
        ]
      }
    };
    
    await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error in notificationSettings:', error);
    ctx.reply('Произошла ошибка при загрузке настроек уведомлений');
  }
};

// Настройки расписания
const scheduleSettings = async (ctx) => {
  try {
    const { ScheduledOrder } = require('../database/models');
    const scheduledOrders = await ScheduledOrder.findAll({
      include: [{
        model: Restaurant,
        as: 'restaurant'
      }],
      order: [['is_active', 'DESC'], ['created_at', 'DESC']]
    });
    
    let message = '⏰ <b>Настройки расписания</b>\n\n';
    
    if (scheduledOrders.length === 0) {
      message += '📋 Нет запланированных заказов\n\n';
    } else {
      message += '<b>Запланированные заказы:</b>\n\n';
      for (const [index, order] of scheduledOrders.entries()) {
        const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        const scheduleDays = JSON.parse(order.schedule_days || '[]');
        const daysStr = scheduleDays.sort((a, b) => a - b).map(d => days[d - 1]).join(', ');
        
        message += `${index + 1}. <b>${order.restaurant.name}</b>\n`;
        message += `   Время: ${order.schedule_time}\n`;
        message += `   Дни: ${daysStr}\n`;
        message += `   Статус: ${order.is_active ? '✅ Активно' : '❌ Неактивно'}\n`;
        message += `   /schedule_${order.id}\n\n`;
      }
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '➕ Добавить расписание', callback_data: 'admin_schedule_add' }
          ],
          [
            { text: '🔄 Обновить', callback_data: 'admin_settings_schedule' }
          ],
          [
            { text: '🔙 Назад', callback_data: 'admin_settings' }
          ]
        ]
      }
    };
    
    try {
      await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
    } catch (editError) {
      // Если сообщение не изменилось, просто отвечаем на callback
      if (editError.description && editError.description.includes('message is not modified')) {
        // Сообщение не изменилось, значит уже отображается актуальная информация
        return;
      } else {
        throw editError;
      }
    }
  } catch (error) {
    logger.error('Error in scheduleSettings:', error);
    ctx.reply('Произошла ошибка при загрузке настроек расписания');
  }
};

// Обработчик текстовых команд администратора
const handleTextCommands = async (ctx) => {
  const text = ctx.message.text;
  
  // Обработка создания ресторана для пользователя
  if (ctx.session?.creatingRestaurantForUser) {
    const userId = ctx.session.creatingRestaurantForUser;
    const restaurantName = text.trim();
    
    if (restaurantName.length < 3) {
      await ctx.reply('❌ Название ресторана слишком короткое. Введите корректное название:');
      return true;
    }
    
    try {
      // Создаем новый ресторан
      const restaurant = await Restaurant.create({
        name: restaurantName,
        is_active: true
      });
      
      // Создаем главный филиал для нового ресторана
      const { RestaurantBranch } = require('../database/models');
      await RestaurantBranch.create({
        restaurantId: restaurant.id,
        address: `Главный филиал ${restaurantName}`,
        isMain: true,
        isActive: true
      });
      
      // Привязываем пользователя к ресторану
      const user = await User.findByPk(userId);
      if (user) {
        user.restaurant_id = restaurant.id;
        await user.save();
        
        await notifyUserAboutApproval(ctx, user, 'restaurant', restaurant.id);
        
        await ctx.reply(
          `✅ <b>Готово!</b>\n\n` +
          `Создан ресторан: ${restaurantName}\n` +
          `Создан главный филиал\n` +
          `Пользователь привязан и уведомлен.`,
          { parse_mode: 'HTML' }
        );
      }
    } catch (error) {
      logger.error('Error creating restaurant for user:', error);
      await ctx.reply('❌ Ошибка при создании ресторана');
    }
    
    delete ctx.session.creatingRestaurantForUser;
    return true;
  }
  
  // Обработка отклонения заявки
  if (ctx.session?.rejectingRequestId) {
    const requestId = ctx.session.rejectingRequestId;
    const reason = text.trim();
    
    try {
      const { RegistrationRequest } = require('../database/models');
      const request = await RegistrationRequest.findByPk(requestId);
      
      if (request && request.status === 'pending') {
        // Обновляем статус заявки
        request.status = 'rejected';
        request.processed_by = ctx.user.id;
        request.processed_at = new Date();
        request.rejection_reason = reason;
        await request.save();
        
        // Уведомляем пользователя
        try {
          const message = 
            '❌ <b>Ваша заявка отклонена</b>\n\n' +
            `Причина: ${reason}\n\n` +
            'Если у вас есть вопросы, обратитесь к администратору.';
          
          await ctx.telegram.sendMessage(request.telegram_id, message, {
            parse_mode: 'HTML'
          });
        } catch (error) {
          logger.error('Error notifying user about rejection:', error);
        }
        
        await ctx.reply(
          '✅ <b>Заявка отклонена</b>\n\n' +
          'Пользователь уведомлен о причине отклонения.',
          { parse_mode: 'HTML' }
        );
      }
    } catch (error) {
      logger.error('Error rejecting registration:', error);
      await ctx.reply('❌ Ошибка при отклонении заявки');
    }
    
    delete ctx.session.rejectingRequestId;
    return true;
  }
  
  // Команды управления пользователями
  if (text.match(/^\/user_(\d+)$/)) {
    await handleUserCommand(ctx);
    return true;
  }
  
  // Команды управления ресторанами
  if (text.match(/^\/restaurant_(\d+)$/)) {
    await handleRestaurantCommand(ctx);
    return true;
  }
  
  // Команды управления расписанием
  if (text.match(/^\/schedule_(\d+)$/)) {
    await handleScheduleCommand(ctx);
    return true;
  }
  
  return false;
};

// Управление конкретным расписанием
const handleScheduleCommand = async (ctx) => {
  const match = ctx.message.text.match(/^\/schedule_(\d+)$/);
  if (!match) return;
  
  const scheduleId = parseInt(match[1]);
  
  try {
    const { ScheduledOrder } = require('../database/models');
    const schedule = await ScheduledOrder.findByPk(scheduleId, {
      include: [{
        model: Restaurant,
        as: 'restaurant'
      }]
    });
    
    if (!schedule) {
      return ctx.reply('❌ Расписание не найдено');
    }
    
    const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const scheduleDays = JSON.parse(schedule.schedule_days || '[]');
    const daysStr = scheduleDays.sort((a, b) => a - b).map(d => days[d - 1]).join(', ');
    
    let message = `⏰ <b>Расписание #${schedule.id}</b>\n\n`;
    message += `🏢 <b>Ресторан:</b> ${schedule.restaurant.name}\n`;
    message += `⏰ <b>Время:</b> ${schedule.schedule_time}\n`;
    message += `📅 <b>Дни:</b> ${daysStr}\n`;
    message += `📊 <b>Статус:</b> ${schedule.is_active ? '✅ Активно' : '❌ Неактивно'}\n`;
    
    if (schedule.last_run) {
      message += `\n🕐 <b>Последний запуск:</b> ${new Date(schedule.last_run).toLocaleString('ru-RU')}\n`;
    }
    
    if (schedule.next_run) {
      message += `⏭️ <b>Следующий запуск:</b> ${new Date(schedule.next_run).toLocaleString('ru-RU')}\n`;
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { 
              text: schedule.is_active ? '⏸️ Приостановить' : '▶️ Активировать', 
              callback_data: `admin_schedule_toggle_${schedule.id}` 
            }
          ],
          [
            { text: '📝 Изменить время', callback_data: `admin_schedule_edit_time_${schedule.id}` },
            { text: '📅 Изменить дни', callback_data: `admin_schedule_edit_days_${schedule.id}` }
          ],
          [
            { text: '🗑️ Удалить расписание', callback_data: `admin_schedule_delete_${schedule.id}` }
          ],
          [
            { text: '🔙 К списку расписаний', callback_data: 'admin_settings_schedule' }
          ]
        ]
      }
    };
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    logger.error('Error in handleScheduleCommand:', error);
    ctx.reply('Произошла ошибка при загрузке расписания');
  }
};

// Переключение активности расписания
const toggleSchedule = async (ctx, scheduleId) => {
  try {
    const { ScheduledOrder } = require('../database/models');
    const schedule = await ScheduledOrder.findByPk(scheduleId);
    
    if (!schedule) {
      await ctx.answerCbQuery('❌ Расписание не найдено');
      return;
    }
    
    schedule.is_active = !schedule.is_active;
    await schedule.save();
    
    await ctx.answerCbQuery(
      schedule.is_active ? '✅ Расписание активировано' : '⏸️ Расписание приостановлено'
    );
    
    // Обновляем сообщение
    await ctx.reply(`Статус расписания изменен. Используйте команду /schedule_${scheduleId} для просмотра.`);
  } catch (error) {
    logger.error('Error in toggleSchedule:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
};

// Редактирование времени расписания
const editScheduleTime = async (ctx, scheduleId) => {
  try {
    await ctx.answerCbQuery();
    
    // Сохраняем ID расписания в сессии
    ctx.session = ctx.session || {};
    ctx.session.editingScheduleId = scheduleId;
    ctx.session.editingScheduleField = 'time';
    
    await ctx.reply(
      '⏰ <b>Введите новое время отправки заказа</b>\n\n' +
      'Формат: ЧЧ:ММ (например, 09:00 или 18:30)',
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error('Error in editScheduleTime:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
};

// Редактирование дней расписания
const editScheduleDays = async (ctx, scheduleId) => {
  try {
    const { ScheduledOrder } = require('../database/models');
    const schedule = await ScheduledOrder.findByPk(scheduleId);
    
    if (!schedule) {
      await ctx.answerCbQuery('❌ Расписание не найдено');
      return;
    }
    
    await ctx.answerCbQuery();
    
    // Сохраняем ID расписания и текущие дни в сессии
    ctx.session = ctx.session || {};
    ctx.session.editingScheduleId = scheduleId;
    ctx.session.editingScheduleField = 'days';
    ctx.session.selectedDays = JSON.parse(schedule.schedule_days || '[]');
    
    const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const selectedDays = ctx.session.selectedDays;
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          days.slice(0, 4).map((day, i) => ({
            text: selectedDays.includes(i + 1) ? `✅ ${day}` : day,
            callback_data: `edit_day_${i + 1}`
          })),
          days.slice(4, 7).map((day, i) => ({
            text: selectedDays.includes(i + 5) ? `✅ ${day}` : day,
            callback_data: `edit_day_${i + 5}`
          })),
          [{ text: '✅ Сохранить изменения', callback_data: 'save_schedule_days' }],
          [{ text: '❌ Отмена', callback_data: 'cancel_schedule_edit' }]
        ]
      }
    };
    
    // Формируем строку с текущими выбранными днями
    const selectedDaysStr = selectedDays.length > 0 
      ? selectedDays.sort((a, b) => a - b).map(d => days[d - 1]).join(', ')
      : 'не выбраны';
    
    await ctx.reply(
      '📅 <b>Выберите дни недели для автоматической отправки:</b>\n\n' +
      `<b>Текущие дни:</b> ${selectedDaysStr}\n\n` +
      'Нажмите на дни, чтобы выбрать/отменить их',
      { parse_mode: 'HTML', ...keyboard }
    );
  } catch (error) {
    logger.error('Error in editScheduleDays:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
};

// Удаление расписания
const deleteSchedule = async (ctx, scheduleId) => {
  try {
    await ctx.answerCbQuery();
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Да, удалить', callback_data: `confirm_delete_schedule_${scheduleId}` },
            { text: '❌ Отмена', callback_data: `schedule_${scheduleId}` }
          ]
        ]
      }
    };
    
    await ctx.reply(
      '⚠️ <b>Подтверждение удаления</b>\n\n' +
      'Вы действительно хотите удалить это расписание?',
      { parse_mode: 'HTML', ...keyboard }
    );
  } catch (error) {
    logger.error('Error in deleteSchedule:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
};

// Обработчик callback для редактирования расписания
const handleScheduleEditCallbacks = async (ctx) => {
  const action = ctx.callbackQuery.data;
  
  logger.info('handleScheduleEditCallbacks called with action:', action);
  
  try {
    // Выбор/отмена дня недели
    if (action.match(/^edit_day_(\d+)$/)) {
      const dayNum = parseInt(action.match(/^edit_day_(\d+)$/)[1]);
      
      if (!ctx.session || !ctx.session.selectedDays) {
        await ctx.answerCbQuery('❌ Сессия истекла. Попробуйте снова.');
        return;
      }
      
      const selectedDays = ctx.session.selectedDays;
      const index = selectedDays.indexOf(dayNum);
      
      if (index > -1) {
        selectedDays.splice(index, 1);
      } else {
        selectedDays.push(dayNum);
      }
      
      ctx.session.selectedDays = selectedDays;
      
      const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            days.slice(0, 4).map((day, i) => ({
              text: selectedDays.includes(i + 1) ? `✅ ${day}` : day,
              callback_data: `edit_day_${i + 1}`
            })),
            days.slice(4, 7).map((day, i) => ({
              text: selectedDays.includes(i + 5) ? `✅ ${day}` : day,
              callback_data: `edit_day_${i + 5}`
            })),
            [{ text: '✅ Сохранить изменения', callback_data: 'save_schedule_days' }],
            [{ text: '❌ Отмена', callback_data: 'cancel_schedule_edit' }]
          ]
        }
      };
      
      await ctx.answerCbQuery();
      
      // Обновляем текст сообщения с текущими выбранными днями
      const selectedDaysStr = selectedDays.length > 0 
        ? selectedDays.sort((a, b) => a - b).map(d => days[d - 1]).join(', ')
        : 'не выбраны';
      
      const updatedMessage = '📅 <b>Выберите дни недели для автоматической отправки:</b>\n\n' +
        `<b>Текущие дни:</b> ${selectedDaysStr}\n\n` +
        'Нажмите на дни, чтобы выбрать/отменить их';
      
      await ctx.editMessageText(updatedMessage, { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
      return;
    }
    
    // Сохранение изменений дней
    if (action === 'save_schedule_days') {
      if (!ctx.session || !ctx.session.editingScheduleId || !ctx.session.selectedDays) {
        await ctx.answerCbQuery('❌ Сессия истекла. Попробуйте снова.');
        return;
      }
      
      const { ScheduledOrder } = require('../database/models');
      const schedule = await ScheduledOrder.findByPk(ctx.session.editingScheduleId, {
        include: [{
          model: Restaurant,
          as: 'restaurant'
        }]
      });
      
      if (!schedule) {
        await ctx.answerCbQuery('❌ Расписание не найдено');
        return;
      }
      
      if (ctx.session.selectedDays.length === 0) {
        await ctx.answerCbQuery('❌ Выберите хотя бы один день!', { show_alert: true });
        return;
      }
      
      // Проверяем конфликты с другими расписаниями
      const otherSchedules = await ScheduledOrder.findAll({
        where: {
          id: { [Op.ne]: ctx.session.editingScheduleId },
          is_active: true
        },
        include: [{
          model: Restaurant,
          as: 'restaurant'
        }]
      });
      
      const conflicts = [];
      for (const otherSchedule of otherSchedules) {
        const otherDays = JSON.parse(otherSchedule.schedule_days || '[]');
        const conflictingDays = ctx.session.selectedDays.filter(day => otherDays.includes(day));
        
        if (conflictingDays.length > 0) {
          conflicts.push({
            schedule: otherSchedule,
            days: conflictingDays
          });
        }
      }
      
      // Если есть конфликты, спрашиваем подтверждение
      if (conflicts.length > 0 && !ctx.session.conflictsConfirmed) {
        ctx.session.conflictsToResolve = conflicts;
        await ctx.answerCbQuery();
        
        const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        let message = '⚠️ <b>Обнаружены конфликты расписания</b>\n\n';
        
        for (const conflict of conflicts) {
          const conflictDaysStr = conflict.days.sort((a, b) => a - b).map(d => days[d - 1]).join(', ');
          message += `🏢 <b>${conflict.schedule.restaurant.name}</b>\n`;
          message += `📅 Дни: ${conflictDaysStr}\n\n`;
        }
        
        message += 'Эти дни уже используются в других расписаниях. Продолжить и переместить эти дни в текущее расписание?';
        
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Да, переместить', callback_data: 'confirm_schedule_conflicts' },
                { text: '❌ Отмена', callback_data: 'cancel_schedule_edit' }
              ]
            ]
          }
        };
        
        await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
        return;
      }
      
      // Если конфликты подтверждены, удаляем дни из других расписаний
      if (ctx.session.conflictsToResolve) {
        for (const conflict of ctx.session.conflictsToResolve) {
          const otherSchedule = await ScheduledOrder.findByPk(conflict.schedule.id);
          const otherDays = JSON.parse(otherSchedule.schedule_days || '[]');
          const remainingDays = otherDays.filter(day => !conflict.days.includes(day));
          otherSchedule.schedule_days = JSON.stringify(remainingDays);
          await otherSchedule.save();
        }
      }
      
      schedule.schedule_days = JSON.stringify(ctx.session.selectedDays);
      await schedule.save();
      
      await ctx.answerCbQuery('✅ Дни недели обновлены');
      await ctx.deleteMessage();
      
      // Показываем обновленное расписание
      const updatedMessage = ctx.session.conflictsToResolve ? 
        `Дни недели обновлены. Конфликтующие дни перемещены из других расписаний.\n\nИспользуйте команду /schedule_${ctx.session.editingScheduleId} для просмотра расписания.` :
        `Дни недели обновлены. Используйте команду /schedule_${ctx.session.editingScheduleId} для просмотра расписания.`;
      
      await ctx.reply(updatedMessage);
      
      // Очищаем сессию
      delete ctx.session.editingScheduleId;
      delete ctx.session.editingScheduleField;
      delete ctx.session.selectedDays;
      delete ctx.session.conflictsConfirmed;
      delete ctx.session.conflictsToResolve;
      return;
    }
    
    // Подтверждение конфликтов расписания
    if (action === 'confirm_schedule_conflicts') {
      if (!ctx.session || !ctx.session.editingScheduleId || !ctx.session.selectedDays) {
        await ctx.answerCbQuery('❌ Сессия истекла. Попробуйте снова.');
        return;
      }
      
      ctx.session.conflictsConfirmed = true;
      // Вызываем сохранение снова с подтвержденными конфликтами
      ctx.callbackQuery.data = 'save_schedule_days';
      return handleScheduleEditCallbacks(ctx);
    }
    
    // Отмена редактирования
    if (action === 'cancel_schedule_edit') {
      await ctx.answerCbQuery('Отменено');
      await ctx.deleteMessage();
      
      if (ctx.session && ctx.session.editingScheduleId) {
        delete ctx.session.editingScheduleId;
        delete ctx.session.editingScheduleField;
        delete ctx.session.selectedDays;
        delete ctx.session.conflictsConfirmed;
        delete ctx.session.conflictsToResolve;
      }
      return;
    }
    
    // Подтверждение удаления
    if (action.match(/^confirm_delete_schedule_(\d+)$/)) {
      const scheduleId = parseInt(action.match(/^confirm_delete_schedule_(\d+)$/)[1]);
      
      const { ScheduledOrder } = require('../database/models');
      const schedule = await ScheduledOrder.findByPk(scheduleId);
      
      if (!schedule) {
        await ctx.answerCbQuery('❌ Расписание не найдено');
        return;
      }
      
      await schedule.destroy();
      await ctx.answerCbQuery('✅ Расписание удалено');
      await ctx.deleteMessage();
      
      // Возвращаемся к списку расписаний
      await scheduleSettings(ctx);
      return;
    }
    
    // Переход к расписанию
    if (action.match(/^schedule_(\d+)$/)) {
      const scheduleId = parseInt(action.match(/^schedule_(\d+)$/)[1]);
      await ctx.answerCbQuery();
      await ctx.deleteMessage();
      
      await ctx.reply(`Используйте команду /schedule_${scheduleId} для просмотра расписания.`);
      return;
    }
    
  } catch (error) {
    logger.error('Error in handleScheduleEditCallbacks:', error);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
};

// Обработка поиска пользователя
const handleUserSearch = async (ctx) => {
  if (!ctx.session || !ctx.session.searchingUser) {
    return false;
  }
  
  const searchQuery = ctx.message.text.trim();
  
  // Отмена поиска
  if (searchQuery === '/cancel') {
    delete ctx.session.searchingUser;
    await ctx.reply('❌ Поиск отменен');
    return usersManagement(ctx);
  }
  
  try {
    const { Op } = require('sequelize');
    
    // Подготавливаем условия поиска
    const whereConditions = [];
    
    // Поиск по username (с @ или без)
    const username = searchQuery.replace('@', '');
    whereConditions.push({ username: { [Op.like]: `%${username}%` } });
    
    // Поиск по Telegram ID (если это число)
    if (/^\d+$/.test(searchQuery)) {
      whereConditions.push({ telegram_id: searchQuery });
    }
    
    // Поиск по имени/фамилии
    whereConditions.push({ first_name: { [Op.like]: `%${searchQuery}%` } });
    whereConditions.push({ last_name: { [Op.like]: `%${searchQuery}%` } });
    
    // Поиск по телефону (очищаем от лишних символов)
    const cleanPhone = searchQuery.replace(/[^\d+]/g, '');
    if (cleanPhone) {
      whereConditions.push({ phone: { [Op.like]: `%${cleanPhone}%` } });
    }
    
    // Выполняем поиск
    const users = await User.findAll({
      where: { [Op.or]: whereConditions },
      include: [{
        model: Restaurant,
        as: 'restaurant',
        attributes: ['name']
      }],
      limit: 10
    });
    
    delete ctx.session.searchingUser;
    
    if (users.length === 0) {
      await ctx.reply(
        '❌ <b>Пользователи не найдены</b>\n\n' +
        `По запросу "${searchQuery}" ничего не найдено.\n\n` +
        'Попробуйте изменить поисковый запрос.',
        { parse_mode: 'HTML' }
      );
      return usersManagement(ctx);
    }
    
    // Формируем результаты
    let message = `🔍 <b>Результаты поиска</b>\n\n`;
    message += `Найдено пользователей: ${users.length}\n\n`;
    
    users.forEach((user, index) => {
      const roleEmoji = {
        'admin': '👑',
        'manager': '💼',
        'buyer': '🛒',
        'restaurant': '🍽️'
      };
      
      message += `${index + 1}. ${roleEmoji[user.role] || '👤'} `;
      message += `${user.first_name || ''} ${user.last_name || ''}\n`;
      message += `   @${user.username || 'нет username'} (ID: ${user.telegram_id})\n`;
      message += `   Роль: ${user.role}\n`;
      if (user.restaurant) {
        message += `   Ресторан: ${user.restaurant.name}\n`;
      }
      message += `   /user_${user.id}\n\n`;
    });
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔍 Новый поиск', callback_data: 'admin_users_search' }],
          [{ text: '🔙 К управлению пользователями', callback_data: 'admin_users' }]
        ]
      }
    };
    
    await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
    return true;
    
  } catch (error) {
    logger.error('Error in user search:', error);
    delete ctx.session.searchingUser;
    await ctx.reply('❌ Ошибка при поиске пользователей');
    return true;
  }
};

// Обработка ввода текста для редактирования пользователя
const handleUserEditTextInput = async (ctx) => {
  if (!ctx.session || !ctx.session.editingUserId || !ctx.session.editingUserField) {
    return false;
  }
  
  const text = ctx.message.text;
  
  // Отмена редактирования
  if (text === '/cancel') {
    const userId = ctx.session.editingUserId;
    delete ctx.session.editingUserId;
    delete ctx.session.editingUserField;
    await ctx.reply('❌ Редактирование отменено');
    return userManagement(ctx, userId);
  }
  
  try {
    const user = await User.findByPk(ctx.session.editingUserId);
    if (!user) {
      await ctx.reply('❌ Пользователь не найден');
      delete ctx.session.editingUserId;
      delete ctx.session.editingUserField;
      return true;
    }
    
    const field = ctx.session.editingUserField;
    
    // Валидация телефона
    if (field === 'phone') {
      // Убираем все символы кроме цифр и +
      const cleanPhone = text.replace(/[^\d+]/g, '');
      
      // Проверяем формат телефона (российский или международный)
      const phoneRegex = /^(\+7|8|7)?[\s-]?\(?[0-9]{3}\)?[\s-]?[0-9]{3}[\s-]?[0-9]{2}[\s-]?[0-9]{2}$/;
      const internationalRegex = /^\+[1-9]\d{1,14}$/;
      
      if (!phoneRegex.test(text) && !internationalRegex.test(cleanPhone)) {
        await ctx.reply(
          '❌ Неверный формат телефона.\n\n' +
          '<b>Допустимые форматы:</b>\n' +
          '• +7 (999) 123-45-67\n' +
          '• 8 999 123 45 67\n' +
          '• 89991234567\n' +
          '• +79991234567\n' +
          '• Международный: +1234567890\n\n' +
          '<i>Попробуйте еще раз или отправьте /cancel для отмены</i>',
          { parse_mode: 'HTML' }
        );
        return true;
      }
      
      // Сохраняем очищенный номер
      user.phone = cleanPhone;
      await user.save();
      await ctx.reply('✅ Телефон успешно обновлен');
      
      const userId = ctx.session.editingUserId;
      delete ctx.session.editingUserId;
      delete ctx.session.editingUserField;
      
      return userManagement(ctx, userId);
    }
    
    // Обновляем данные
    if (field === 'firstname') {
      user.first_name = text;
    } else if (field === 'lastname') {
      user.last_name = text;
    } else if (field === 'phone') {
      user.phone = text;
    }
    
    await user.save();
    
    await ctx.reply('✅ Данные успешно обновлены');
    
    const userId = ctx.session.editingUserId;
    delete ctx.session.editingUserId;
    delete ctx.session.editingUserField;
    
    return userManagement(ctx, userId);
  } catch (error) {
    logger.error('Error updating user data:', error);
    await ctx.reply('❌ Ошибка при обновлении данных');
    return true;
  }
};

// Обработка ввода текста для расписания
const handleScheduleTextInput = async (ctx) => {
  if (!ctx.session || !ctx.session.editingScheduleId || !ctx.session.editingScheduleField) {
    return false;
  }
  
  const text = ctx.message.text;
  
  // Обработка ввода времени
  if (ctx.session.editingScheduleField === 'time') {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    const match = text.match(timeRegex);
    
    if (!match) {
      await ctx.reply('❌ Неверный формат времени. Используйте формат ЧЧ:ММ (например, 09:00)');
      return true;
    }
    
    try {
      const { ScheduledOrder } = require('../database/models');
      const schedule = await ScheduledOrder.findByPk(ctx.session.editingScheduleId);
      
      if (!schedule) {
        await ctx.reply('❌ Расписание не найдено');
        delete ctx.session.editingScheduleId;
        delete ctx.session.editingScheduleField;
        return true;
      }
      
      schedule.schedule_time = text;
      await schedule.save();
      
      await ctx.reply('✅ Время обновлено');
      
      // Показываем обновленное расписание с правильными данными
      const scheduleWithRestaurant = await ScheduledOrder.findByPk(ctx.session.editingScheduleId, {
        include: [{
          model: Restaurant,
          as: 'restaurant'
        }]
      });
      
      if (scheduleWithRestaurant) {
        const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        const scheduleDays = JSON.parse(scheduleWithRestaurant.schedule_days || '[]');
        const daysStr = scheduleDays.sort((a, b) => a - b).map(d => days[d - 1]).join(', ');
        
        let message = `⏰ <b>Расписание #${scheduleWithRestaurant.id}</b>\n\n`;
        message += `🏢 <b>Ресторан:</b> ${scheduleWithRestaurant.restaurant.name}\n`;
        message += `⏰ <b>Время:</b> ${scheduleWithRestaurant.schedule_time}\n`;
        message += `📅 <b>Дни:</b> ${daysStr}\n`;
        message += `📊 <b>Статус:</b> ${scheduleWithRestaurant.is_active ? '✅ Активно' : '❌ Неактивно'}\n`;
        
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [
                { 
                  text: scheduleWithRestaurant.is_active ? '⏸️ Приостановить' : '▶️ Активировать', 
                  callback_data: `admin_schedule_toggle_${scheduleWithRestaurant.id}` 
                }
              ],
              [
                { text: '📝 Изменить время', callback_data: `admin_schedule_edit_time_${scheduleWithRestaurant.id}` },
                { text: '📅 Изменить дни', callback_data: `admin_schedule_edit_days_${scheduleWithRestaurant.id}` }
              ],
              [
                { text: '🗑️ Удалить расписание', callback_data: `admin_schedule_delete_${scheduleWithRestaurant.id}` }
              ],
              [
                { text: '🔙 К списку расписаний', callback_data: 'admin_settings_schedule' }
              ]
            ]
          }
        };
        
        await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
      }
      
      // Очищаем сессию
      delete ctx.session.editingScheduleId;
      delete ctx.session.editingScheduleField;
    } catch (error) {
      logger.error('Error updating schedule time:', error);
      await ctx.reply('❌ Ошибка при обновлении времени');
    }
    
    return true;
  }
  
  return false;
};

module.exports = {
  adminPanel,
  usersManagement,
  usersList,
  restaurantsManagement,
  restaurantsList,
  createBackup,
  systemStats,
  systemSettings,
  viewLogs,
  notificationSettings,
  scheduleSettings,
  handleAdminCallbacks,
  handleUserCommand,
  handleRestaurantCommand,
  restaurantManagement,
  handleTextCommands,
  handleScheduleCommand,
  handleScheduleEditCallbacks,
  handleScheduleTextInput,
  handleUserEditTextInput,
  handleUserSearch
};