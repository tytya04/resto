const { Order, OrderItem, User, Restaurant, Purchase, PriceHistory, NomenclatureCache } = require('../database/models');
const { generateOrderNumber } = require('../database/init');
const logger = require('../utils/logger');
const { notificationService } = require('./NotificationService');
const { Op } = require('sequelize');

class OrderService {
  // Создание нового заказа
  static async createOrder(orderData) {
    const transaction = await Order.sequelize.transaction();
    
    try {
      // Создаем заказ
      const order = await Order.create({
        restaurant_id: orderData.restaurant_id,
        user_id: orderData.user_id,
        status: 'sent',
        total_amount: 0,
        notes: orderData.notes || null,
        sent_at: new Date(),
        order_number: await generateOrderNumber()
      }, { transaction });

      // Добавляем позиции заказа
      let totalAmount = 0;
      const orderItems = [];

      for (const item of orderData.items) {
        const orderItem = await OrderItem.create({
          order_id: order.id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price || null,
          total: item.total || null,
          category: item.category || null
        }, { transaction });

        orderItems.push(orderItem);
        totalAmount += item.total || 0;
      }

      // Обновляем общую сумму заказа
      await order.update({ total_amount: totalAmount }, { transaction });

      await transaction.commit();

      // Возвращаем заказ с позициями
      order.orderItems = orderItems;
      
      // Уведомляем менеджеров о новом заказе
      await this.notifyManagersAboutNewOrder(order);
      
      return order;

    } catch (error) {
      await transaction.rollback();
      logger.error('Error creating order:', error);
      throw error;
    }
  }

  // Получение заказа по ID
  static async getOrderById(orderId, includeDetails = true) {
    const include = includeDetails ? [
      {
        model: OrderItem,
        as: 'orderItems'
      },
      {
        model: User,
        as: 'user',
        attributes: ['id', 'telegram_id', 'first_name', 'last_name', 'username']
      },
      {
        model: Restaurant,
        as: 'restaurant'
      }
    ] : [];

    return Order.findByPk(orderId, { include });
  }

  // Получение заказов пользователя
  static async getUserOrders(userId, status = null, limit = 20) {
    const where = { user_id: userId };
    if (status) {
      where.status = status;
    }

    return Order.findAll({
      where,
      include: [{
        model: OrderItem,
        as: 'orderItems'
      }],
      order: [['created_at', 'DESC']],
      limit
    });
  }

  // Получение заказов ресторана
  static async getRestaurantOrders(restaurantId, status = null, limit = 20) {
    const where = { restaurant_id: restaurantId };
    if (status) {
      where.status = status;
    }

    return Order.findAll({
      where,
      include: [
        {
          model: OrderItem,
          as: 'orderItems'
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'first_name', 'last_name', 'username']
        }
      ],
      order: [['created_at', 'DESC']],
      limit
    });
  }

  // Обновление статуса заказа
  static async updateOrderStatus(orderId, newStatus, userId = null, reason = null) {
    const order = await Order.findByPk(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }

    const updateData = { status: newStatus };

    // Добавляем дополнительную информацию в зависимости от статуса
    switch (newStatus) {
      case 'processing':
        updateData.processed_by = userId;
        updateData.processed_at = new Date();
        break;
      case 'approved':
        updateData.approved_by = userId;
        updateData.approved_at = new Date();
        break;
      case 'rejected':
        updateData.rejected_by = userId;
        updateData.rejected_at = new Date();
        updateData.rejection_reason = reason;
        break;
      case 'completed':
        updateData.completed_at = new Date();
        break;
    }

    await order.update(updateData);
    return order;
  }

  // Добавление позиции в существующий заказ
  static async addItemToOrder(orderId, itemData) {
    const order = await Order.findByPk(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }

    if (!order.canEdit()) {
      throw new Error('Заказ нельзя редактировать после отправки');
    }

    const orderItem = await OrderItem.create({
      order_id: orderId,
      product_name: itemData.product_name,
      quantity: itemData.quantity,
      unit: itemData.unit,
      price: itemData.price || null,
      total: itemData.total || null,
      category: itemData.category || null
    });

    // Пересчитываем общую сумму
    await this.recalculateOrderTotal(orderId);

    return orderItem;
  }

  // Удаление позиции из заказа
  static async removeItemFromOrder(orderId, itemId) {
    const order = await Order.findByPk(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    if (!order.canEdit()) {
      throw new Error('Заказ нельзя редактировать после отправки');
    }
    
    const orderItem = await OrderItem.findOne({
      where: {
        id: itemId,
        order_id: orderId
      }
    });

    if (!orderItem) {
      throw new Error('Order item not found');
    }

    await orderItem.destroy();

    // Пересчитываем общую сумму
    await this.recalculateOrderTotal(orderId);

    return true;
  }

  // Обновление позиции заказа
  static async updateOrderItem(orderId, itemId, updateData) {
    const order = await Order.findByPk(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    if (!order.canEdit()) {
      throw new Error('Заказ нельзя редактировать после отправки');
    }
    
    const orderItem = await OrderItem.findOne({
      where: {
        id: itemId,
        order_id: orderId
      }
    });

    if (!orderItem) {
      throw new Error('Order item not found');
    }

    // Обновляем данные
    if (updateData.quantity !== undefined) {
      orderItem.quantity = updateData.quantity;
      if (orderItem.price) {
        orderItem.total = orderItem.quantity * orderItem.price;
      }
    }

    if (updateData.price !== undefined) {
      orderItem.price = updateData.price;
      orderItem.total = orderItem.quantity * orderItem.price;
    }

    await orderItem.save();

    // Пересчитываем общую сумму
    await this.recalculateOrderTotal(orderId);

    return orderItem;
  }

  // Обновление цен после закупки (для менеджеров)
  static async updateOrderItemPrice(orderId, itemId, price) {
    const order = await Order.findByPk(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    // Разрешаем обновление цен для статусов purchased и processing
    if (order.status !== 'purchased' && order.status !== 'processing') {
      throw new Error('Цены можно устанавливать только для заказов после закупки');
    }
    
    const orderItem = await OrderItem.findOne({
      where: {
        id: itemId,
        order_id: orderId
      }
    });

    if (!orderItem) {
      throw new Error('Order item not found');
    }

    // Обновляем цену и пересчитываем сумму
    orderItem.price = price;
    orderItem.total = orderItem.quantity * price;
    await orderItem.save();

    // Пересчитываем общую сумму заказа
    await this.recalculateOrderTotal(orderId);

    return orderItem;
  }

  // Пересчет общей суммы заказа
  static async recalculateOrderTotal(orderId) {
    const items = await OrderItem.findAll({
      where: { order_id: orderId }
    });

    const totalAmount = items.reduce((sum, item) => sum + (item.total || 0), 0);

    await Order.update(
      { total_amount: totalAmount },
      { where: { id: orderId } }
    );

    return totalAmount;
  }

  // Получение заказов для обработки (для менеджеров)
  static async getPendingOrders(limit = 20, userId = null, userRole = null) {
    const { Op } = require('sequelize');
    const whereCondition = { 
      status: {
        [Op.in]: ['sent', 'purchased']
      }
    };
    
    // Если это менеджер, показываем только заказы из его ресторанов
    if (userRole === 'manager' && userId) {
      const { Restaurant } = require('../database/models');
      const managerRestaurants = await Restaurant.findAll({
        where: { created_by: userId },
        attributes: ['id']
      });
      
      const restaurantIds = managerRestaurants.map(r => r.id);
      if (restaurantIds.length > 0) {
        whereCondition.restaurant_id = restaurantIds;
      } else {
        // Если у менеджера нет ресторанов, возвращаем пустой список
        return [];
      }
    }
    
    return Order.findAll({
      where: whereCondition,
      include: [
        {
          model: OrderItem,
          as: 'orderItems'
        },
        {
          model: Restaurant,
          as: 'restaurant'
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'first_name', 'last_name', 'username', 'phone']
        }
      ],
      order: [['sent_at', 'ASC']],
      limit
    });
  }

  // Получение консолидированных заказов (для закупщиков)
  static async getConsolidatedOrders(dateFrom = null, dateTo = null, includeInProgress = false) {
    // Закупщик видит все отправленные заказы сразу
    const statusConditions = ['sent'];
    if (includeInProgress) {
      statusConditions.push('processing', 'approved');
    }
    
    const where = { 
      status: {
        [Op.in]: statusConditions
      }
    };
    
    if (dateFrom && dateTo) {
      where.approved_at = {
        [Op.between]: [dateFrom, dateTo]
      };
    } else if (!dateFrom && !dateTo) {
      // По умолчанию - заказы за последние 7 дней
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      where.created_at = {
        [Op.gte]: weekAgo
      };
    }

    const orders = await Order.findAll({
      where,
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

    // Получаем все уникальные продукты для запроса technical_note
    const uniqueProductNames = new Set();
    orders.forEach(order => {
      order.orderItems.forEach(item => {
        uniqueProductNames.add(item.product_name);
      });
    });

    // Получаем technical_note для всех продуктов
    const productNotes = {};
    if (uniqueProductNames.size > 0) {
      const products = await NomenclatureCache.findAll({
        where: {
          product_name: Array.from(uniqueProductNames)
        },
        attributes: ['product_name', 'technical_note']
      });
      
      products.forEach(product => {
        if (product.technical_note) {
          productNotes[product.product_name] = product.technical_note;
        }
      });
    }

    // Группируем по продуктам
    const consolidated = {};
    
    orders.forEach(order => {
      order.orderItems.forEach(item => {
        const key = `${item.product_name}_${item.unit}`;
        // Создаем короткий безопасный ID для Telegram callback_data (максимум 64 байта)
        const crypto = require('crypto');
        const safeId = crypto.createHash('md5').update(key).digest('hex').substring(0, 30);
        
        if (!consolidated[key]) {
          consolidated[key] = {
            consolidated_product_id: safeId,
            original_key: key,
            product_name: item.product_name,
            unit: item.unit,
            category: item.category,
            technical_note: productNotes[item.product_name] || null,
            total_quantity: 0,
            restaurants: new Set(),
            orders: [],
            total_amount: 0,
            average_price: 0
          };
        }
        
        const quantity = parseFloat(item.quantity);
        const price = parseFloat(item.price || 0);
        const total = parseFloat(item.total || 0);
        
        consolidated[key].total_quantity += quantity;
        consolidated[key].restaurants.add(order.restaurant.name);
        consolidated[key].total_amount += total;
        
        consolidated[key].orders.push({
          order_id: order.id,
          order_item_id: item.id,
          order_number: order.order_number,
          restaurant_id: order.restaurant_id,
          restaurant: order.restaurant.name,
          quantity: quantity,
          price: price,
          total: total
        });
        
        // Добавляем Set для отслеживания уникальных заказов
        if (!consolidated[key].unique_orders) {
          consolidated[key].unique_orders = new Set();
        }
        consolidated[key].unique_orders.add(order.id);
      });
    });

    // Преобразуем в массив и рассчитываем среднюю цену
    const result = Object.values(consolidated).map(item => {
      // Рассчитываем среднюю цену за единицу
      if (item.total_quantity > 0) {
        item.average_price = (item.total_amount / item.total_quantity).toFixed(2);
      }
      
      // Проверяем, есть ли уже закупка для этого продукта
      return {
        ...item,
        restaurants: Array.from(item.restaurants),
        orders_count: item.unique_orders ? item.unique_orders.size : item.orders.length, // Считаем уникальные заказы
        restaurants_count: item.restaurants.size
      };
    });

    // Сортируем по общему количеству (от большего к меньшему)
    result.sort((a, b) => b.total_quantity - a.total_quantity);

    return result;
  }

  // Получение активных закупок
  static async getActivePurchases() {
    const { PurchaseItem } = require('../database/models');
    return PurchaseItem.findAll({
      where: {
        status: 'pending'
      },
      order: [['created_at', 'DESC']]
    });
  }

  // Создание закупки из консолидированного списка
  static async createPurchaseFromConsolidated(consolidatedProduct, buyerId) {
    const transaction = await Purchase.sequelize.transaction();
    
    try {
      const purchase = await Purchase.create({
        consolidated_product_id: consolidatedProduct.consolidated_product_id,
        product_name: consolidatedProduct.product_name,
        unit: consolidatedProduct.unit,
        total_quantity: consolidatedProduct.total_quantity,
        buyer_id: buyerId,
        orders_data: consolidatedProduct.orders,
        status: 'pending'
      }, { transaction });

      // Создаем PurchaseItem для отслеживания активных закупок
      const { PurchaseItem } = require('../database/models');
      await PurchaseItem.create({
        purchase_id: purchase.id,
        product_name: consolidatedProduct.product_name,
        unit: consolidatedProduct.unit,
        quantity: consolidatedProduct.total_quantity,
        required_quantity: consolidatedProduct.total_quantity,
        consolidated_product_id: consolidatedProduct.consolidated_product_id,
        status: 'pending'
      }, { transaction });

      await transaction.commit();
      
      logger.info(`Purchase created for ${consolidatedProduct.product_name}: ${consolidatedProduct.total_quantity} ${consolidatedProduct.unit}`);
      
      return purchase;
    } catch (error) {
      await transaction.rollback();
      logger.error('Error creating purchase:', error);
      throw error;
    }
  }

  // Отметка закупки как выполненной
  static async completePurchase(purchaseId, actualData) {
    const transaction = await Purchase.sequelize.transaction();
    
    try {
      const purchase = await Purchase.findByPk(purchaseId);
      
      if (!purchase) {
        throw new Error('Purchase not found');
      }

      // Обновляем данные закупки
      purchase.purchased_quantity = actualData.quantity;
      purchase.total_price = actualData.totalPrice;
      purchase.unit_price = purchase.calculateUnitPrice();
      purchase.status = 'completed';
      purchase.notes = actualData.notes;
      
      await purchase.save({ transaction });

      // Обновляем соответствующий PurchaseItem
      const { PurchaseItem } = require('../database/models');
      await PurchaseItem.update(
        {
          purchased_quantity: actualData.quantity,
          purchase_price: actualData.totalPrice,
          status: 'completed',
          purchased_at: new Date()
        },
        {
          where: { purchase_id: purchaseId },
          transaction
        }
      );

      // Распределяем цены по заказам
      const allocations = purchase.allocatePriceToOrders();
      
      if (allocations) {
        // Обновляем цены в позициях заказов
        for (const allocation of allocations) {
          await OrderItem.update(
            {
              price: purchase.unit_price,
              total: allocation.allocated_price
            },
            {
              where: { id: allocation.order_item_id },
              transaction
            }
          );
        }

        // Пересчитываем суммы заказов
        const uniqueOrderIds = [...new Set(allocations.map(a => a.order_id))];
        for (const orderId of uniqueOrderIds) {
          await this.recalculateOrderTotal(orderId, transaction);
        }
      }

      await transaction.commit();
      
      // Создаем запись в истории цен
      await PriceHistory.createFromPurchase(purchase);
      
      logger.info(`Purchase ${purchaseId} completed. Unit price: ${purchase.unit_price}`);
      
      return purchase;
      
    } catch (error) {
      await transaction.rollback();
      logger.error('Error completing purchase:', error);
      throw error;
    }
  }

  // Пересчет общей суммы заказа с поддержкой транзакций
  static async recalculateOrderTotal(orderId, transaction = null) {
    const items = await OrderItem.findAll({
      where: { order_id: orderId },
      transaction
    });

    const totalAmount = items.reduce((sum, item) => sum + (parseFloat(item.total || 0)), 0);

    await Order.update(
      { total_amount: totalAmount },
      { 
        where: { id: orderId },
        transaction
      }
    );

    return totalAmount;
  }

  // Уведомление менеджеров о новом заказе
  static async notifyManagersAboutNewOrder(order) {
    try {
      const managers = await User.findAll({
        where: { role: 'manager' }
      });
      
      if (managers.length === 0) return;
      
      // Получаем информацию о ресторане
      const restaurant = await Restaurant.findByPk(order.restaurant_id);
      const user = await User.findByPk(order.user_id);
      
      const message = `📥 <b>Новый заказ!</b>\n\n` +
        `🏢 Ресторан: ${restaurant?.name || 'Не указан'}\n` +
        `📋 Номер: #${order.order_number}\n` +
        `👤 От: ${user?.first_name || user?.username || 'Неизвестно'}\n` +
        `📦 Позиций: ${order.orderItems.length}\n` +
        `💰 Сумма: ${order.total_amount || 'не указана'} ₽\n\n` +
        `💡 Используйте /pending_orders для просмотра`;
      
      // Отправляем уведомление каждому менеджеру
      for (const manager of managers) {
        await notificationService.sendNotification(manager.telegram_id, message);
      }
      
    } catch (error) {
      logger.error('Error notifying managers about new order:', error);
    }
  }

  // Клонирование заказа (для шаблонов)
  static async cloneOrder(orderId, userId) {
    const sourceOrder = await this.getOrderById(orderId);
    
    if (!sourceOrder) {
      throw new Error('Source order not found');
    }

    const transaction = await Order.sequelize.transaction();
    
    try {
      // Создаем новый заказ
      const newOrder = await Order.create({
        restaurant_id: sourceOrder.restaurant_id,
        user_id: userId,
        status: 'draft',
        total_amount: sourceOrder.total_amount,
        notes: `Скопировано из заказа #${sourceOrder.order_number}`,
        order_number: await generateOrderNumber()
      }, { transaction });

      // Копируем позиции
      for (const item of sourceOrder.items) {
        await OrderItem.create({
          order_id: newOrder.id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price,
          total: item.total,
          category: item.category
        }, { transaction });
      }

      await transaction.commit();
      return newOrder;

    } catch (error) {
      await transaction.rollback();
      logger.error('Error cloning order:', error);
      throw error;
    }
  }
}

module.exports = OrderService;