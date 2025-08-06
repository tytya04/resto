const cron = require('node-cron');
const { Order, Restaurant, Settings, User } = require('../database/models');
const OrderService = require('./OrderService');
const { notificationService } = require('./NotificationService');
const logger = require('../utils/logger');
const moment = require('moment');
const { formatInTimezone, momentInTimezone } = require('../utils/timezone');

class OrderSchedulerService {
  constructor() {
    this.scheduledJobs = new Map(); // Хранение запланированных задач по restaurant_id
  }

  // Инициализация планировщика
  async initialize() {
    try {
      logger.info('Initializing OrderSchedulerService...');
      
      // Получаем все рестораны
      const restaurants = await Restaurant.findAll({ where: { is_active: true } });
      
      for (const restaurant of restaurants) {
        await this.scheduleRestaurantOrders(restaurant.id);
      }
      
      logger.info(`OrderSchedulerService initialized with ${this.scheduledJobs.size} scheduled jobs`);
    } catch (error) {
      logger.error('Error initializing OrderSchedulerService:', error);
    }
  }

  // Планирование отправки заказов для конкретного ресторана
  async scheduleRestaurantOrders(restaurantId) {
    try {
      const { ScheduledOrder } = require('../database/models');
      
      // Получаем активные расписания для ресторана
      const schedules = await ScheduledOrder.findAll({
        where: { 
          restaurant_id: restaurantId,
          is_active: true
        }
      });
      
      // Удаляем старые задачи
      this.removeScheduledJob(restaurantId);
      
      if (schedules.length === 0) {
        logger.info(`No active schedules found for restaurant ${restaurantId}`);
        return;
      }
      
      // Создаем задачи для каждого расписания
      for (const schedule of schedules) {
        const [hours, minutes] = schedule.schedule_time.split(':');
        const scheduleDays = JSON.parse(schedule.schedule_days || '[]');
        
        // Если дни недели не указаны, используем ежедневно
        const daysOfWeek = scheduleDays.length > 0 ? scheduleDays.join(',') : '*';
        
        // Преобразуем дни недели (в БД: 1=Пн, 7=Вс; в cron: 0=Вс, 6=Сб)
        const cronDays = scheduleDays.length > 0 ? 
          scheduleDays.map(day => day === 7 ? 0 : day).join(',') : '*';
        
        // Формируем cron выражение (минуты часы * * дни_недели)
        const cronExpression = `${minutes} ${hours} * * ${cronDays}`;
        
        // Создаем задачу
        const task = cron.schedule(cronExpression, async () => {
          logger.info(`Cron task triggered for restaurant ${restaurantId} at ${new Date().toISOString()}`);
          await this.processRestaurantOrders(restaurantId);
        }, {
          timezone: "Europe/Samara" // Используем Самарское время (UTC+4)
        });
        
        // Сохраняем задачу (используем составной ключ для множественных расписаний)
        const jobKey = `${restaurantId}_${schedule.id}`;
        this.scheduledJobs.set(jobKey, task);
        
        const daysText = scheduleDays.length > 0 ? 
          scheduleDays.map(d => ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][d-1]).join(',') : 
          'ежедневно';
        
        logger.info(`Scheduled automatic order submission for restaurant ${restaurantId} at ${schedule.schedule_time} (${daysText})`);
      }
      
    } catch (error) {
      logger.error(`Error scheduling orders for restaurant ${restaurantId}:`, error);
    }
  }

  // Обработка и отправка заказов ресторана
  async processRestaurantOrders(restaurantId) {
    const { DraftOrder, DraftOrderItem, Order, OrderItem } = require('../database/models');
    
    try {
      logger.info(`Processing automatic order submission for restaurant ${restaurantId}`);
      
      // Находим все черновики заказов для ресторана
      const draftOrders = await DraftOrder.findAll({
        where: {
          restaurant_id: restaurantId,
          status: 'draft'
        },
        include: [
          {
            model: User,
            as: 'user'
          },
          {
            model: Restaurant,
            as: 'restaurant'
          },
          {
            model: DraftOrderItem,
            as: 'draftOrderItems'
          }
        ]
      });
      
      if (draftOrders.length === 0) {
        logger.info(`No draft orders found for restaurant ${restaurantId}`);
        return;
      }
      
      const sentOrders = [];
      const currentTime = new Date();
      
      // Обрабатываем каждый черновик отдельно в своей транзакции
      for (const draftOrder of draftOrders) {
        const transaction = await DraftOrder.sequelize.transaction();
        
        try {
          // Проверяем, что в черновике есть позиции
          if (!draftOrder.draftOrderItems || draftOrder.draftOrderItems.length === 0) {
            logger.info(`Draft order ${draftOrder.id} has no items, skipping`);
            await transaction.rollback();
            continue;
          }
          
          // Создаем новый заказ на основе черновика
          const newOrder = await Order.create({
            restaurant_id: draftOrder.restaurant_id,
            user_id: draftOrder.user_id,
            status: 'sent',
            sent_at: currentTime,
            scheduled_for: draftOrder.scheduled_for
          }, { transaction });
          
          // Копируем позиции из черновика в заказ
          let totalAmount = 0;
          for (const draftItem of draftOrder.draftOrderItems) {
            // Для черновиков у нас нет цены, поэтому total будет 0
            // Цена будет добавлена позже менеджером
            const itemTotal = 0;
            totalAmount += itemTotal;
            
            await OrderItem.create({
              order_id: newOrder.id,
              product_name: draftItem.product_name,
              quantity: draftItem.quantity,
              unit: draftItem.unit,
              status: draftItem.status,
              matched_product_id: draftItem.matched_product_id,
              total: itemTotal,
              created_at: currentTime,
              updated_at: currentTime
            }, { 
              transaction,
              hooks: false // Отключаем хуки для избежания блокировок
            });
          }
          
          // Обновляем общую сумму заказа
          await newOrder.update({
            total_amount: totalAmount
          }, { transaction });
          
          // Обновляем статус черновика
          await draftOrder.update({
            status: 'sent',
            sent_at: currentTime
          }, { transaction });
          
          await transaction.commit();
          
          // Добавляем заказ в список отправленных
          sentOrders.push({
            ...newOrder.toJSON(),
            user: draftOrder.user,
            restaurant: draftOrder.restaurant,
            order_number: newOrder.order_number
          });
          
          logger.info(`Successfully processed draft order ${draftOrder.id} -> order ${newOrder.order_number}`);
          
        } catch (error) {
          await transaction.rollback();
          logger.error(`Error processing draft order ${draftOrder.id}:`, error);
          throw error; // Re-throw to be caught by outer try-catch
        }
      }
      
      // Отправляем уведомления
      await this.sendNotifications(restaurantId, sentOrders);
      
      // Уведомляем менеджеров о новых заказах
      await this.notifyManagersAboutNewOrders(sentOrders);
      
      // Уведомляем закупщиков о новых заказах для консолидации
      await this.notifyBuyersAboutNewOrders(sentOrders);
      
      logger.info(`Successfully sent ${sentOrders.length} orders for restaurant ${restaurantId}`);
      
    } catch (error) {
      logger.error(`Error processing orders for restaurant ${restaurantId}:`, error);
      
      // Уведомляем менеджеров об ошибке
      await this.notifyError(restaurantId, error);
    }
  }

  // Отправка уведомлений о отправленных заказах
  async sendNotifications(restaurantId, sentOrders) {
    try {
      // Получаем менеджеров
      const managers = await User.findAll({
        where: { role: 'manager' }
      });
      
      // Получаем информацию о ресторане
      const restaurant = await Restaurant.findByPk(restaurantId);
      
      // Формируем сообщение
      let message = `🚀 <b>Автоматическая отправка заказов</b>\n\n`;
      message += `🏢 Ресторан: ${restaurant.name}\n`;
      message += `📅 Время: ${formatInTimezone(new Date())}\n`;
      message += `📋 Отправлено заказов: ${sentOrders.length}\n\n`;
      
      sentOrders.forEach(order => {
        message += `• Заказ #${order.order_number} от ${order.user.first_name || order.user.username}\n`;
      });
      
      message += `\n✅ Все заказы успешно отправлены на обработку`;
      
      // Отправляем уведомления менеджерам
      for (const manager of managers) {
        await notificationService.sendToTelegramId(manager.telegram_id, message, { parse_mode: 'HTML' });
      }
      
      // Уведомляем всех сотрудников ресторана
      const restaurantUsers = await User.findAll({
        where: {
          restaurant_id: restaurantId,
          role: 'restaurant',
          is_active: true
        }
      });
      
      // Для каждого пользователя ресторана отправляем персонализированное сообщение
      for (const user of restaurantUsers) {
        const userOrders = sentOrders.filter(o => o.user_id === user.id);
        
        let userMessage = `📤 <b>Автоматическая отправка заказов</b>\n\n`;
        userMessage += `🏢 Ресторан: ${restaurant.name}\n`;
        userMessage += `⏰ Время отправки: ${formatInTimezone(new Date(), 'HH:mm')}\n`;
        userMessage += `📅 Дата: ${formatInTimezone(new Date(), 'DD.MM.YYYY')}\n\n`;
        
        if (userOrders.length > 0) {
          userMessage += `✅ <b>Ваши заказы отправлены (${userOrders.length}):</b>\n`;
          userOrders.forEach(order => {
            userMessage += `• Заказ #${order.order_number}\n`;
          });
          userMessage += `\n⚠️ Отправленные заказы больше нельзя редактировать`;
        } else if (sentOrders.length > 0) {
          userMessage += `📊 Всего отправлено заказов: ${sentOrders.length}\n`;
          userMessage += `ℹ️ У вас не было черновиков для отправки`;
        } else {
          userMessage += `ℹ️ Не было черновиков для отправки`;
        }
        
        await notificationService.sendToTelegramId(user.telegram_id, userMessage, { parse_mode: 'HTML' });
      }
      
    } catch (error) {
      logger.error('Error sending notifications:', error);
    }
  }

  // Уведомление об ошибке
  async notifyError(restaurantId, error) {
    try {
      const managers = await User.findAll({
        where: { role: 'manager' }
      });
      
      const restaurant = await Restaurant.findByPk(restaurantId);
      
      const message = `⚠️ <b>Ошибка автоматической отправки</b>\n\n` +
        `🏢 Ресторан: ${restaurant?.name || restaurantId}\n` +
        `🕐 Время: ${formatInTimezone(new Date())}\n` +
        `❌ Ошибка: ${error.message}\n\n` +
        `Требуется ручная отправка заказов`;
      
      for (const manager of managers) {
        await notificationService.sendToTelegramId(manager.telegram_id, message, { parse_mode: 'HTML' });
      }
    } catch (notifyError) {
      logger.error('Error sending error notification:', notifyError);
    }
  }

  // Уведомление менеджеров о новых заказах
  async notifyManagersAboutNewOrders(orders) {
    try {
      const managers = await User.findAll({
        where: { role: 'manager' }
      });
      
      if (managers.length === 0) return;
      
      // Получаем детальную информацию о заказах
      const { Order, OrderItem } = require('../database/models');
      const detailedOrders = await Order.findAll({
        where: {
          id: orders.map(o => o.id)
        },
        include: [
          {
            model: OrderItem,
            as: 'orderItems'
          },
          {
            model: User,
            as: 'user'
          },
          {
            model: Restaurant,
            as: 'restaurant'
          }
        ]
      });
      
      // Группируем заказы по ресторанам
      const ordersByRestaurant = {};
      detailedOrders.forEach(order => {
        const restaurantName = order.restaurant.name;
        if (!ordersByRestaurant[restaurantName]) {
          ordersByRestaurant[restaurantName] = [];
        }
        ordersByRestaurant[restaurantName].push(order);
      });
      
      let message = '📥 <b>Новые заявки:</b>\n\n';
      
      Object.entries(ordersByRestaurant).forEach(([restaurantName, restaurantOrders]) => {
        message += `\n🏢 <b>${restaurantName}</b>\n`;
        restaurantOrders.forEach(order => {
          const orderTime = formatInTimezone(order.created_at, 'HH:mm');
          message += `\n📋 Заказ #${order.order_number} (${orderTime})\n`;
          message += `👤 ${order.user.first_name || order.user.username}\n`;
          message += `📦 Позиций: ${order.orderItems.length}\n`;
          
          // Показываем первые 3 позиции
          const itemsToShow = order.orderItems.slice(0, 3);
          itemsToShow.forEach(item => {
            message += `  • ${item.product_name} - ${item.quantity} ${item.unit}\n`;
          });
          if (order.orderItems.length > 3) {
            message += `  • ...и еще ${order.orderItems.length - 3} позиций\n`;
          }
          
          message += `💰 Сумма: ${order.total_amount || 'не указана'} ₽\n`;
        });
      });
      
      message += '\n\n📊 Заказы отправлены закупщикам для консолидации\n';
      message += '💡 Вы сможете обработать заказы после завершения закупки';
      
      // Добавляем кнопки для просмотра
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 Просмотреть заказы', callback_data: 'pending_orders' }],
            [{ text: '📊 Консолидированный список', callback_data: 'manager_consolidated' }]
          ]
        }
      };
      
      // Отправляем уведомление каждому менеджеру
      for (const manager of managers) {
        await notificationService.sendToTelegramId(manager.telegram_id, message, { 
          parse_mode: 'HTML',
          ...keyboard 
        });
      }
      
    } catch (error) {
      logger.error('Error notifying managers about new orders:', error);
    }
  }
  
  // Уведомление закупщиков о новых заказах
  async notifyBuyersAboutNewOrders(orders) {
    try {
      const buyers = await User.findAll({
        where: { role: 'buyer' }
      });
      
      if (buyers.length === 0) return;
      
      // Получаем детальную информацию о заказах
      const { Order, OrderItem } = require('../database/models');
      const detailedOrders = await Order.findAll({
        where: {
          id: orders.map(o => o.id)
        },
        include: [
          {
            model: OrderItem,
            as: 'orderItems'
          },
          {
            model: Restaurant,
            as: 'restaurant'
          }
        ]
      });
      
      let message = '📦 <b>Новые заказы для консолидации!</b>\n\n';
      message += `📅 Дата: ${formatInTimezone(new Date(), 'DD.MM.YYYY')}\n`;
      message += `🔢 Количество заказов: ${detailedOrders.length}\n\n`;
      
      // Группируем по ресторанам
      const ordersByRestaurant = {};
      detailedOrders.forEach(order => {
        const restaurantName = order.restaurant.name;
        if (!ordersByRestaurant[restaurantName]) {
          ordersByRestaurant[restaurantName] = [];
        }
        ordersByRestaurant[restaurantName].push(order);
      });
      
      Object.entries(ordersByRestaurant).forEach(([restaurantName, restaurantOrders]) => {
        message += `🏢 <b>${restaurantName}</b>: ${restaurantOrders.length} заказов\n`;
      });
      
      message += '\n💡 Используйте /consolidate для просмотра и консолидации';
      
      // Отправляем уведомление каждому закупщику
      for (const buyer of buyers) {
        await notificationService.sendToTelegramId(buyer.telegram_id, message, { parse_mode: 'HTML' });
      }
      
      logger.info(`Notified ${buyers.length} buyers about ${orders.length} new orders`);
      
    } catch (error) {
      logger.error('Error notifying buyers about new orders:', error);
    }
  }

  // Немедленная отправка заказов (по команде)
  async sendOrdersNow(restaurantId) {
    logger.info(`Manual order submission triggered for restaurant ${restaurantId}`);
    return await this.processRestaurantOrders(restaurantId);
  }

  // Обновление расписания для ресторана
  async updateRestaurantSchedule(restaurantId) {
    await this.scheduleRestaurantOrders(restaurantId);
  }

  // Удаление запланированной задачи
  removeScheduledJob(restaurantId) {
    // Находим все задачи для данного ресторана
    const keysToRemove = [];
    for (const [key, job] of this.scheduledJobs) {
      if (key.startsWith(`${restaurantId}_`)) {
        job.stop();
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => this.scheduledJobs.delete(key));
    
    if (keysToRemove.length > 0) {
      logger.info(`Removed ${keysToRemove.length} scheduled jobs for restaurant ${restaurantId}`);
    }
  }

  // Остановка всех задач
  destroy() {
    logger.info('Stopping all scheduled jobs...');
    for (const [restaurantId, job] of this.scheduledJobs) {
      job.stop();
    }
    this.scheduledJobs.clear();
  }


  // Получение информации о расписании
  getScheduleInfo(restaurantId = null) {
    if (restaurantId) {
      // Проверяем, есть ли задачи для данного ресторана
      const hasJobs = Array.from(this.scheduledJobs.keys()).some(key => key.startsWith(`${restaurantId}_`));
      return { scheduled: hasJobs };
    }
    
    const info = [];
    const processedRestaurants = new Set();
    
    for (const [key, job] of this.scheduledJobs) {
      const restaurantId = key.split('_')[0];
      if (!processedRestaurants.has(restaurantId)) {
        info.push({ restaurant_id: parseInt(restaurantId), scheduled: true });
        processedRestaurants.add(restaurantId);
      }
    }
    return info;
  }
}

// Создаем singleton экземпляр
const orderSchedulerService = new OrderSchedulerService();

module.exports = orderSchedulerService;