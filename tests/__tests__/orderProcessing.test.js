const OrderService = require('../../src/services/OrderService');
const { Order, OrderItem, User, Restaurant } = require('../../src/database/models');
const { 
  testUsers, 
  createTestOrder,
  mockNotificationService 
} = require('../fixtures/testData');
const { seedTestData, clearTestData } = require('../fixtures/seedTestData');

// Mock NotificationService
jest.mock('../../src/services/NotificationService', () => ({
  notificationService: mockNotificationService,
  notifyOrderStatusChange: jest.fn().mockResolvedValue(true)
}));

describe('Обработка заявки менеджером', () => {
  let manager;
  let restaurantUser;
  let order;

  beforeEach(async () => {
    await clearTestData();
    await seedTestData();
    
    // Получаем менеджера и пользователя ресторана
    manager = await User.findByPk(2); // manager_test
    restaurantUser = await User.findByPk(4); // restaurant1_user
    
    // Создаем и отправляем заказ
    order = await OrderService.createOrder({
      restaurant_id: 1,
      user_id: restaurantUser.id,
      notes: 'Заказ для тестирования обработки'
    });
    
    // Добавляем товары
    await OrderService.addItemToOrder(order.id, {
      product_name: 'Картофель',
      quantity: 50,
      unit: 'кг',
      category: 'Овощи'
    });
    
    await OrderService.addItemToOrder(order.id, {
      product_name: 'Говядина',
      quantity: 20,
      unit: 'кг',
      category: 'Мясо'
    });
    
    await OrderService.addItemToOrder(order.id, {
      product_name: 'Молоко 3.2%',
      quantity: 30,
      unit: 'л',
      category: 'Молочные продукты'
    });
    
    // Отправляем заказ
    await OrderService.sendOrder(order.id);
  });

  describe('Получение заявок для обработки', () => {
    test('Менеджер видит новые заявки', async () => {
      const pendingOrders = await OrderService.getPendingOrders();
      
      expect(pendingOrders).toHaveLength(1);
      expect(pendingOrders[0].id).toBe(order.id);
      expect(pendingOrders[0].status).toBe('sent');
      expect(pendingOrders[0].items).toHaveLength(3);
    });

    test('Заявки группируются по ресторанам', async () => {
      // Создаем второй заказ от другого ресторана
      const order2 = await OrderService.createOrder({
        restaurant_id: 2,
        user_id: 5,
        notes: 'Заказ от второго ресторана'
      });
      
      await OrderService.addItemToOrder(order2.id, {
        product_name: 'Курица',
        quantity: 15,
        unit: 'кг'
      });
      
      await OrderService.sendOrder(order2.id);
      
      const pendingOrders = await OrderService.getPendingOrders();
      
      expect(pendingOrders).toHaveLength(2);
      
      // Проверяем группировку
      const restaurantIds = [...new Set(pendingOrders.map(o => o.restaurant_id))];
      expect(restaurantIds).toHaveLength(2);
    });
  });

  describe('Процесс обработки заказа', () => {
    test('Начало обработки заказа', async () => {
      const processingOrder = await OrderService.startProcessingOrder(order.id, manager.id);
      
      expect(processingOrder.status).toBe('processing');
      expect(processingOrder.processed_by).toBe(manager.id);
      expect(processingOrder.processed_at).toBeTruthy();
    });

    test('Нельзя обработать уже обрабатываемый заказ', async () => {
      await OrderService.startProcessingOrder(order.id, manager.id);
      
      const anotherManager = await User.findByPk(3);
      await expect(OrderService.startProcessingOrder(order.id, anotherManager.id))
        .rejects.toThrow('уже обрабатывается');
    });

    test('Установка цен на позиции заказа', async () => {
      await OrderService.startProcessingOrder(order.id, manager.id);
      
      const items = await OrderItem.findAll({ where: { order_id: order.id } });
      
      // Устанавливаем цены
      await OrderService.updateOrderItemPrice(items[0].id, {
        price: 35.00 // Картофель
      });
      
      await OrderService.updateOrderItemPrice(items[1].id, {
        price: 450.00 // Говядина
      });
      
      await OrderService.updateOrderItemPrice(items[2].id, {
        price: 70.00 // Молоко
      });
      
      // Проверяем обновленные позиции
      const updatedItems = await OrderItem.findAll({ 
        where: { order_id: order.id },
        order: [['id', 'ASC']]
      });
      
      expect(updatedItems[0].price).toBe(35.00);
      expect(updatedItems[0].total).toBe(1750.00); // 50 * 35
      
      expect(updatedItems[1].price).toBe(450.00);
      expect(updatedItems[1].total).toBe(9000.00); // 20 * 450
      
      expect(updatedItems[2].price).toBe(70.00);
      expect(updatedItems[2].total).toBe(2100.00); // 30 * 70
    });

    test('Одобрение заказа с комментарием', async () => {
      await OrderService.startProcessingOrder(order.id, manager.id);
      
      // Устанавливаем цены
      const items = await OrderItem.findAll({ where: { order_id: order.id } });
      for (const item of items) {
        await OrderService.updateOrderItemPrice(item.id, { price: 100.00 });
      }
      
      const approvedOrder = await OrderService.approveOrder(
        order.id, 
        manager.id,
        'Цены согласованы'
      );
      
      expect(approvedOrder.status).toBe('approved');
      expect(approvedOrder.approved_by).toBe(manager.id);
      expect(approvedOrder.approved_at).toBeTruthy();
      expect(approvedOrder.manager_comment).toBe('Цены согласованы');
      expect(approvedOrder.total_amount).toBe(10000.00); // (50+20+30) * 100
      
      // Проверяем отправку уведомления
      const { notifyOrderStatusChange } = require('../../src/services/NotificationService');
      expect(notifyOrderStatusChange).toHaveBeenCalledWith(
        restaurantUser.id,
        expect.objectContaining({
          order_number: order.order_number,
          status: 'approved',
          comment: 'Цены согласованы'
        })
      );
    });

    test('Отклонение заказа с причиной', async () => {
      await OrderService.startProcessingOrder(order.id, manager.id);
      
      const rejectedOrder = await OrderService.rejectOrder(
        order.id,
        manager.id,
        'Превышен лимит по сумме заказа'
      );
      
      expect(rejectedOrder.status).toBe('rejected');
      expect(rejectedOrder.rejected_by).toBe(manager.id);
      expect(rejectedOrder.rejected_at).toBeTruthy();
      expect(rejectedOrder.rejection_reason).toBe('Превышен лимит по сумме заказа');
    });

    test('Нельзя одобрить заказ без цен', async () => {
      await OrderService.startProcessingOrder(order.id, manager.id);
      
      await expect(OrderService.approveOrder(order.id, manager.id))
        .rejects.toThrow('Необходимо установить цены');
    });
  });

  describe('Статистика обработки', () => {
    test('Подсчет обработанных заказов менеджером', async () => {
      // Обрабатываем первый заказ
      await OrderService.startProcessingOrder(order.id, manager.id);
      const items = await OrderItem.findAll({ where: { order_id: order.id } });
      for (const item of items) {
        await OrderService.updateOrderItemPrice(item.id, { price: 100.00 });
      }
      await OrderService.approveOrder(order.id, manager.id);
      
      // Создаем и обрабатываем второй заказ
      const order2 = await OrderService.createOrder({
        restaurant_id: 1,
        user_id: restaurantUser.id
      });
      await OrderService.addItemToOrder(order2.id, {
        product_name: 'Сахар-песок',
        quantity: 25,
        unit: 'кг'
      });
      await OrderService.sendOrder(order2.id);
      await OrderService.startProcessingOrder(order2.id, manager.id);
      await OrderService.rejectOrder(order2.id, manager.id, 'Нет в наличии');
      
      // Получаем статистику
      const approvedCount = await Order.count({
        where: {
          approved_by: manager.id,
          status: 'approved'
        }
      });
      
      const rejectedCount = await Order.count({
        where: {
          rejected_by: manager.id,
          status: 'rejected'
        }
      });
      
      expect(approvedCount).toBe(1);
      expect(rejectedCount).toBe(1);
    });
  });

  describe('Полный сценарий обработки', () => {
    test('От получения заявки до одобрения', async () => {
      // 1. Менеджер получает список новых заявок
      const pendingOrders = await OrderService.getPendingOrders();
      expect(pendingOrders).toHaveLength(1);
      
      const orderToProcess = pendingOrders[0];
      
      // 2. Начинает обработку
      await OrderService.startProcessingOrder(orderToProcess.id, manager.id);
      
      // 3. Просматривает позиции и устанавливает цены
      const items = await OrderItem.findAll({ 
        where: { order_id: orderToProcess.id },
        order: [['id', 'ASC']]
      });
      
      // Картофель - 35 руб/кг
      await OrderService.updateOrderItemPrice(items[0].id, { price: 35.00 });
      
      // Говядина - 450 руб/кг  
      await OrderService.updateOrderItemPrice(items[1].id, { price: 450.00 });
      
      // Молоко - 70 руб/л
      await OrderService.updateOrderItemPrice(items[2].id, { price: 70.00 });
      
      // 4. Добавляет комментарий и одобряет
      const approvedOrder = await OrderService.approveOrder(
        orderToProcess.id,
        manager.id,
        'Заказ одобрен. Доставка завтра до 10:00'
      );
      
      // 5. Проверяем итоговую сумму
      const expectedTotal = (50 * 35) + (20 * 450) + (30 * 70);
      expect(approvedOrder.total_amount).toBe(expectedTotal);
      
      // 6. Заказ больше не появляется в списке для обработки
      const newPendingOrders = await OrderService.getPendingOrders();
      expect(newPendingOrders).toHaveLength(0);
    });
  });
});