const { User } = require('../database/models');
const logger = require('../utils/logger');

class NotificationService {
  constructor() {
    this.bot = null;
  }

  // Инициализация с ботом
  init(bot) {
    this.bot = bot;
    logger.info('NotificationService initialized');
  }

  // Отправка уведомления конкретному пользователю
  async sendToUser(userId, message, options = {}) {
    try {
      if (!this.bot) {
        logger.error('Bot not initialized in NotificationService');
        return false;
      }

      const user = await User.findOne({ where: { id: userId } });
      if (!user) {
        logger.error(`User not found: ${userId}`);
        return false;
      }

      await this.bot.telegram.sendMessage(user.telegram_id, message, options);
      logger.info(`Notification sent to user ${userId}`);
      return true;
    } catch (error) {
      logger.error(`Error sending notification to user ${userId}:`, error);
      return false;
    }
  }

  // Отправка уведомления по telegram_id
  async sendToTelegramId(telegramId, message, options = {}) {
    try {
      if (!this.bot) {
        logger.error('Bot not initialized in NotificationService');
        return false;
      }

      await this.bot.telegram.sendMessage(telegramId, message, options);
      logger.info(`Notification sent to telegram_id ${telegramId}`);
      return true;
    } catch (error) {
      logger.error(`Error sending notification to telegram_id ${telegramId}:`, error);
      return false;
    }
  }

  // Уведомление всех менеджеров
  async notifyManagers(order, draftOrder) {
    try {
      // Если передан заказ, формируем сообщение о новом заказе
      if (order && draftOrder) {
        const { Restaurant } = require('../database/models');
        const restaurant = await Restaurant.findByPk(order.restaurant_id);
        
        // Парсим items
        const items = order.items_json ? JSON.parse(order.items_json) : [];
        let itemsList = '';
        items.forEach((item, index) => {
          itemsList += `${index + 1}. ${item.name} - ${item.quantity} ${item.unit}\n`;
        });
        
        const message = `🆕 <b>Новый заказ #${order.id}</b>\n\n` +
          `🏪 Ресторан: ${restaurant ? restaurant.name : 'Неизвестно'}\n` +
          `📅 Время создания: ${new Date().toLocaleString('ru-RU')}\n\n` +
          `📋 <b>Позиции заказа:</b>\n${itemsList}\n` +
          `📦 Всего позиций: ${items.length}`;
        
        const options = {
          parse_mode: 'HTML'
        };
        
        // Уведомляем менеджеров
        const managersNotified = await this.notifyManagersWithMessage(message, options);
        
        // Также уведомляем закупщиков
        const buyersNotified = await this.notifyBuyers(message, options);
        
        logger.info(`Order notification sent to ${managersNotified} managers and ${buyersNotified} buyers`);
        
        return managersNotified + buyersNotified;
      } else if (typeof order === 'string') {
        // Если передана строка, используем как сообщение
        return await this.notifyManagersWithMessage(order, draftOrder || {});
      }
      
      return 0;
    } catch (error) {
      logger.error('Error notifying managers about order:', error);
      return 0;
    }
  }
  
  // Базовый метод для отправки сообщения менеджерам
  async notifyManagersWithMessage(message, options = {}) {
    try {
      const managers = await User.findAll({
        where: {
          role: 'manager',
          is_active: true
        }
      });

      const results = await Promise.all(
        managers.map(manager => 
          this.sendToTelegramId(manager.telegram_id, message, options)
        )
      );

      const successCount = results.filter(r => r).length;
      logger.info(`Notified ${successCount}/${managers.length} managers`);
      
      return successCount;
    } catch (error) {
      logger.error('Error notifying managers:', error);
      return 0;
    }
  }

  // Уведомление всех закупщиков
  async notifyBuyers(message, options = {}) {
    try {
      const buyers = await User.findAll({
        where: {
          role: 'buyer',
          is_active: true
        }
      });

      const results = await Promise.all(
        buyers.map(buyer => 
          this.sendToTelegramId(buyer.telegram_id, message, options)
        )
      );

      const successCount = results.filter(r => r).length;
      logger.info(`Notified ${successCount}/${buyers.length} buyers`);
      
      return successCount;
    } catch (error) {
      logger.error('Error notifying buyers:', error);
      return 0;
    }
  }

  // Уведомление пользователей конкретного ресторана
  async notifyRestaurantUsers(restaurantId, message, options = {}) {
    try {
      const users = await User.findAll({
        where: {
          restaurant_id: restaurantId,
          role: 'restaurant',
          is_active: true
        }
      });

      const results = await Promise.all(
        users.map(user => 
          this.sendToTelegramId(user.telegram_id, message, options)
        )
      );

      const successCount = results.filter(r => r).length;
      logger.info(`Notified ${successCount}/${users.length} restaurant users`);
      
      return successCount;
    } catch (error) {
      logger.error('Error notifying restaurant users:', error);
      return 0;
    }
  }

  // Уведомление об одобрении регистрации
  async notifyRegistrationApproved(telegramId, userData) {
    const message = 
      '✅ Ваша заявка на регистрацию одобрена!\n\n' +
      `🏷 Роль: ${userData.role}\n` +
      (userData.restaurant_name ? `🏢 Ресторан: ${userData.restaurant_name}\n` : '') +
      '\nТеперь вы можете использовать все функции системы.\n' +
      'Используйте /start для начала работы.';

    return this.sendToTelegramId(telegramId, message);
  }

  // Уведомление об отклонении регистрации
  async notifyRegistrationRejected(telegramId, reason) {
    const message = 
      '❌ Ваша заявка на регистрацию отклонена.\n\n' +
      (reason ? `Причина: ${reason}\n\n` : '') +
      'Вы можете подать новую заявку через /start';

    return this.sendToTelegramId(telegramId, message);
  }

  // Уведомление о новом заказе для менеджеров
  async notifyNewOrder(orderData) {
    const message = 
      '📋 Новый заказ!\n\n' +
      `🏢 Ресторан: ${orderData.restaurant_name}\n` +
      `📦 Позиций: ${orderData.items_count}\n` +
      `💰 Сумма: ${orderData.total_amount}₽\n` +
      `🔢 Номер: #${orderData.order_number}\n\n` +
      `Используйте /pending_orders для просмотра`;

    return this.notifyManagers(message);
  }

  // Уведомление об изменении статуса заказа
  async notifyOrderStatusChange(userId, orderData) {
    const statusTexts = {
      'approved': '✅ одобрен',
      'rejected': '❌ отклонен',
      'processing': '⏳ в обработке',
      'completed': '✅ выполнен'
    };

    const message = 
      `📋 Изменение статуса заказа #${orderData.order_number}\n\n` +
      `Новый статус: ${statusTexts[orderData.status] || orderData.status}\n` +
      (orderData.comment ? `Комментарий: ${orderData.comment}\n` : '') +
      '\nИспользуйте /my_orders для просмотра деталей';

    return this.sendToUser(userId, message);
  }

  // Массовая рассылка (только для администраторов)
  async broadcast(message, filter = {}) {
    try {
      const where = { is_active: true, ...filter };
      const users = await User.findAll({ where });

      const results = await Promise.all(
        users.map(user => 
          this.sendToTelegramId(user.telegram_id, message)
        )
      );

      const successCount = results.filter(r => r).length;
      logger.info(`Broadcast sent to ${successCount}/${users.length} users`);
      
      return {
        total: users.length,
        success: successCount,
        failed: users.length - successCount
      };
    } catch (error) {
      logger.error('Error in broadcast:', error);
      return { total: 0, success: 0, failed: 0 };
    }
  }

  // Уведомление администраторов о критической ошибке
  async notifyAdminsAboutError(error, context) {
    try {
      const admins = await User.findAll({
        where: {
          role: 'admin',
          is_active: true
        }
      });

      if (admins.length === 0) {
        logger.warn('No active admins to notify about error');
        return 0;
      }

      const errorMessage = this.formatErrorNotification(error, context);
      
      const results = await Promise.all(
        admins.map(admin => 
          this.sendToTelegramId(admin.telegram_id, errorMessage, {
            parse_mode: 'HTML',
            disable_notification: false
          })
        )
      );

      const successCount = results.filter(r => r).length;
      logger.info(`Notified ${successCount}/${admins.length} admins about critical error`);
      
      return successCount;
    } catch (notifyError) {
      logger.error('Error notifying admins about error:', notifyError);
      return 0;
    }
  }

  // Форматирование сообщения об ошибке для администраторов
  formatErrorNotification(error, context) {
    const timestamp = new Date().toLocaleString('ru-RU');
    let message = `🚨 <b>КРИТИЧЕСКАЯ ОШИБКА</b>\n\n`;
    message += `⏰ Время: ${timestamp}\n`;
    
    if (context.errorId) {
      message += `🆔 ID ошибки: <code>${context.errorId}</code>\n`;
    }
    
    message += `\n📍 <b>Контекст:</b>\n`;
    
    if (context.userId) {
      message += `👤 Пользователь: ${context.userId}`;
      if (context.username) {
        message += ` (@${context.username})`;
      }
      message += '\n';
    }
    
    if (context.updateType) {
      message += `📨 Тип: ${context.updateType}\n`;
    }
    
    message += `\n❌ <b>Ошибка:</b>\n`;
    message += `<code>${this.escapeHtml(error.message)}</code>\n`;
    
    if (error.type) {
      message += `\n🏷 Тип: ${error.type}\n`;
    }
    
    if (process.env.NODE_ENV !== 'production' && error.stack) {
      const stackLines = error.stack.split('\n').slice(0, 5).join('\n');
      message += `\n📋 <b>Stack trace:</b>\n<pre>${this.escapeHtml(stackLines)}</pre>\n`;
    }
    
    message += `\n💡 Используйте /logs для просмотра подробных логов`;
    
    return message;
  }

  // Экранирование HTML для Telegram
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  // Периодическая отправка сводки критических ошибок
  async sendCriticalErrorsSummary() {
    try {
      const criticalErrors = logger.getCriticalErrors();
      
      if (criticalErrors.length === 0) {
        return;
      }

      const admins = await User.findAll({
        where: {
          role: 'admin',
          is_active: true
        }
      });

      if (admins.length === 0) {
        return;
      }

      let message = `📊 <b>Сводка критических ошибок</b>\n`;
      message += `За последние 5 минут: ${criticalErrors.length} ошибок\n\n`;

      // Группируем ошибки по типу
      const errorsByType = {};
      criticalErrors.forEach(error => {
        const type = error.metadata?.context?.type || 'unknown';
        if (!errorsByType[type]) {
          errorsByType[type] = [];
        }
        errorsByType[type].push(error);
      });

      // Формируем сводку
      Object.entries(errorsByType).forEach(([type, errors]) => {
        message += `\n🔸 <b>${type}:</b> ${errors.length} ошибок\n`;
        errors.slice(0, 3).forEach(error => {
          const time = new Date(error.timestamp).toLocaleTimeString('ru-RU');
          message += `  • ${time} - ${this.escapeHtml(error.message.substring(0, 50))}...\n`;
        });
      });

      message += `\n🔍 Подробности: /logs`;

      // Отправляем всем администраторам
      await Promise.all(
        admins.map(admin => 
          this.sendToTelegramId(admin.telegram_id, message, {
            parse_mode: 'HTML'
          })
        )
      );

    } catch (error) {
      logger.error('Error sending critical errors summary:', error);
    }
  }

  // Запуск периодической отправки сводок об ошибках
  startErrorSummarySchedule() {
    // Отправляем сводку каждые 5 минут, если есть критические ошибки
    setInterval(() => {
      this.sendCriticalErrorsSummary();
    }, 5 * 60 * 1000);
  }
}

// Создаем синглтон
const notificationService = new NotificationService();

// Экспортируем методы для удобства использования
module.exports = {
  notificationService,
  notifyManagers: (message, options) => notificationService.notifyManagers(message, options),
  notifyBuyers: (message, options) => notificationService.notifyBuyers(message, options),
  notifyRestaurantUsers: (restaurantId, message, options) => notificationService.notifyRestaurantUsers(restaurantId, message, options),
  notifyRegistrationApproved: (telegramId, userData) => notificationService.notifyRegistrationApproved(telegramId, userData),
  notifyRegistrationRejected: (telegramId, reason) => notificationService.notifyRegistrationRejected(telegramId, reason),
  notifyNewOrder: (orderData) => notificationService.notifyNewOrder(orderData),
  notifyOrderStatusChange: (userId, orderData) => notificationService.notifyOrderStatusChange(userId, orderData),
  notifyAdminsAboutError: (error, context) => notificationService.notifyAdminsAboutError(error, context)
};