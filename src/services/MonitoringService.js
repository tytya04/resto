const promClient = require('prom-client');
const logger = require('../utils/logger');
const { sequelize } = require('../database/init');
const { User, Order, Restaurant } = require('../database/models');
const { Op } = require('sequelize');

class MonitoringService {
  constructor() {
    // Создаем реестр метрик
    this.register = new promClient.Registry();
    
    // Добавляем метрики по умолчанию (CPU, память и т.д.)
    promClient.collectDefaultMetrics({ register: this.register });
    
    // Кастомные метрики
    this.metrics = {
      // Счетчик команд
      commandsTotal: new promClient.Counter({
        name: 'bot_commands_total',
        help: 'Total number of bot commands executed',
        labelNames: ['command', 'status', 'user_role'],
        registers: [this.register]
      }),
      
      // Гистограмма времени выполнения команд
      commandDuration: new promClient.Histogram({
        name: 'bot_command_duration_seconds',
        help: 'Duration of bot command execution',
        labelNames: ['command'],
        buckets: [0.1, 0.5, 1, 2, 5, 10],
        registers: [this.register]
      }),
      
      // Счетчик ошибок
      errorsTotal: new promClient.Counter({
        name: 'bot_errors_total',
        help: 'Total number of errors',
        labelNames: ['type', 'command'],
        registers: [this.register]
      }),
      
      // Gauge для активных пользователей
      activeUsers: new promClient.Gauge({
        name: 'bot_active_users',
        help: 'Number of active users in the last 24 hours',
        registers: [this.register]
      }),
      
      // Gauge для количества заказов
      ordersGauge: new promClient.Gauge({
        name: 'bot_orders_current',
        help: 'Current number of orders by status',
        labelNames: ['status'],
        registers: [this.register]
      }),
      
      // Счетчик обработанных сообщений
      messagesProcessed: new promClient.Counter({
        name: 'bot_messages_processed_total',
        help: 'Total number of messages processed',
        labelNames: ['type'],
        registers: [this.register]
      }),
      
      // Гистограмма времени ответа базы данных
      dbQueryDuration: new promClient.Histogram({
        name: 'db_query_duration_seconds',
        help: 'Database query duration',
        labelNames: ['operation'],
        buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
        registers: [this.register]
      }),
      
      // Gauge для размера очереди
      queueSize: new promClient.Gauge({
        name: 'bot_queue_size',
        help: 'Current size of processing queue',
        labelNames: ['queue_name'],
        registers: [this.register]
      })
    };
    
    // Карта для отслеживания производительности
    this.performanceMap = new Map();
    
    // Периодическое обновление метрик
    this.startMetricsCollection();
  }
  
  // Начать отслеживание команды
  startCommand(commandName, userId, userRole) {
    const startTime = Date.now();
    const key = `${commandName}_${userId}_${startTime}`;
    
    this.performanceMap.set(key, {
      command: commandName,
      userId,
      userRole,
      startTime
    });
    
    return key;
  }
  
  // Завершить отслеживание команды
  endCommand(key, status = 'success') {
    const data = this.performanceMap.get(key);
    if (!data) return;
    
    const duration = (Date.now() - data.startTime) / 1000;
    
    // Обновляем метрики
    this.metrics.commandsTotal.inc({
      command: data.command,
      status,
      user_role: data.userRole || 'unknown'
    });
    
    this.metrics.commandDuration.observe(
      { command: data.command },
      duration
    );
    
    // Логируем производительность
    logger.logPerformance(`command_${data.command}`, duration, {
      userId: data.userId,
      status
    });
    
    this.performanceMap.delete(key);
  }
  
  // Записать ошибку
  recordError(errorType, command = 'unknown') {
    this.metrics.errorsTotal.inc({
      type: errorType,
      command
    });
  }
  
  // Записать обработанное сообщение
  recordMessage(type) {
    this.metrics.messagesProcessed.inc({ type });
  }
  
  // Измерить время выполнения запроса к БД
  async measureDbQuery(operation, queryFn) {
    const end = this.metrics.dbQueryDuration.startTimer({ operation });
    
    try {
      const result = await queryFn();
      end();
      return result;
    } catch (error) {
      end();
      throw error;
    }
  }
  
  // Обновить размер очереди
  updateQueueSize(queueName, size) {
    this.metrics.queueSize.set({ queue_name: queueName }, size);
  }
  
  // Периодический сбор метрик
  startMetricsCollection() {
    // Обновляем метрики каждые 30 секунд
    setInterval(async () => {
      try {
        // Активные пользователи за последние 24 часа
        const { User } = require('../database/models');
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const activeUsersCount = await this.measureDbQuery('count_active_users', async () => {
          return await User.count({
            where: {
              updated_at: {
                [Op.gte]: oneDayAgo
              },
              is_active: true
            }
          });
        });
        
        this.metrics.activeUsers.set(activeUsersCount);
        
        // Количество заказов по статусам
        const { Order } = require('../database/models');
        const orderStats = await this.measureDbQuery('order_stats', async () => {
          return await Order.findAll({
            attributes: [
              'status',
              [Order.sequelize.fn('COUNT', Order.sequelize.col('id')), 'count']
            ],
            group: ['status']
          });
        });
        
        // Сбрасываем все статусы
        ['draft', 'sent', 'processing', 'approved', 'rejected', 'completed'].forEach(status => {
          this.metrics.ordersGauge.set({ status }, 0);
        });
        
        // Устанавливаем актуальные значения
        orderStats.forEach(stat => {
          this.metrics.ordersGauge.set(
            { status: stat.status },
            parseInt(stat.dataValues.count)
          );
        });
        
      } catch (error) {
        logger.logError(error, { context: 'metrics_collection' });
      }
    }, 30000);
  }
  
  // Получить метрики в формате Prometheus
  async getMetrics() {
    return await this.register.metrics();
  }
  
  // Получить статистику системы
  async getSystemStats() {
    const { User, Restaurant, Order, Purchase } = require('../database/models');
    
    try {
      const [
        totalUsers,
        activeUsers,
        totalRestaurants,
        totalOrders,
        todayOrders,
        totalPurchases,
        pendingPurchases
      ] = await Promise.all([
        User.count(),
        User.count({ where: { is_active: true } }),
        Restaurant.count(),
        Order.count(),
        Order.count({
          where: {
            created_at: {
              [sequelize.Op.gte]: new Date().setHours(0, 0, 0, 0)
            }
          }
        }),
        Purchase.count(),
        Purchase.count({ where: { status: 'pending' } })
      ]);
      
      // Статистика по ролям пользователей
      const usersByRole = await User.findAll({
        attributes: [
          'role',
          [User.sequelize.fn('COUNT', User.sequelize.col('id')), 'count']
        ],
        group: ['role']
      });
      
      // Топ активных ресторанов
      const topRestaurants = await Order.findAll({
        attributes: [
          'restaurant_id',
          [Order.sequelize.fn('COUNT', Order.sequelize.col('id')), 'order_count'],
          [Order.sequelize.fn('SUM', Order.sequelize.col('total_amount')), 'total_amount']
        ],
        include: [{
          model: Restaurant,
          as: 'restaurant',
          attributes: ['name']
        }],
        group: ['restaurant_id', 'restaurant.id'],
        order: [[Order.sequelize.fn('COUNT', Order.sequelize.col('id')), 'DESC']],
        limit: 5
      });
      
      return {
        users: {
          total: totalUsers,
          active: activeUsers,
          byRole: usersByRole.map(r => ({
            role: r.role,
            count: parseInt(r.dataValues.count)
          }))
        },
        restaurants: {
          total: totalRestaurants,
          top: topRestaurants.map(r => ({
            name: r.restaurant.name,
            orders: parseInt(r.dataValues.order_count),
            amount: parseFloat(r.dataValues.total_amount || 0)
          }))
        },
        orders: {
          total: totalOrders,
          today: todayOrders
        },
        purchases: {
          total: totalPurchases,
          pending: pendingPurchases
        },
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: process.version
        }
      };
    } catch (error) {
      logger.logError(error, { context: 'get_system_stats' });
      throw error;
    }
  }
  
  // Middleware для Express
  metricsMiddleware() {
    return async (req, res) => {
      res.set('Content-Type', this.register.contentType);
      res.end(await this.getMetrics());
    };
  }
}

// Создаем синглтон
const monitoringService = new MonitoringService();

module.exports = monitoringService;