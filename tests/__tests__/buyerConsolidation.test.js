const ConsolidationService = require('../../src/services/ConsolidationService');
const OrderService = require('../../src/services/OrderService');
const { Order, OrderItem, User, Restaurant, Consolidation, ConsolidationItem } = require('../../src/database/models');
const { 
  testUsers,
  testRestaurants,
  createTestOrder,
  mockNotificationService 
} = require('../fixtures/testData');
const { seedTestData, clearTestData } = require('../fixtures/seedTestData');

// Mock NotificationService
jest.mock('../../src/services/NotificationService', () => ({
  notificationService: mockNotificationService
}));

describe('Консолидация заказов закупщиком', () => {
  let buyer;
  let manager;
  let restaurant1User;
  let restaurant2User;
  let approvedOrders = [];

  beforeEach(async () => {
    await clearTestData();
    await seedTestData();
    
    // Получаем пользователей
    buyer = await User.findByPk(3); // buyer_test
    manager = await User.findByPk(2); // manager_test
    restaurant1User = await User.findByPk(4); // restaurant1_user
    restaurant2User = await User.findByPk(5); // restaurant2_user
    
    // Создаем одобренные заказы от разных ресторанов
    approvedOrders = [];
    
    // Заказ 1 от первого ресторана
    const order1 = await createApprovedOrder(restaurant1User, manager, [
      { product_name: 'Картофель', quantity: 100, unit: 'кг', price: 35.00 },
      { product_name: 'Морковь', quantity: 50, unit: 'кг', price: 40.00 },
      { product_name: 'Говядина', quantity: 30, unit: 'кг', price: 450.00 }
    ]);
    approvedOrders.push(order1);
    
    // Заказ 2 от второго ресторана (с теми же продуктами для консолидации)
    const order2 = await createApprovedOrder(restaurant2User, manager, [
      { product_name: 'Картофель', quantity: 80, unit: 'кг', price: 35.00 },
      { product_name: 'Морковь', quantity: 40, unit: 'кг', price: 40.00 },
      { product_name: 'Молоко 3.2%', quantity: 60, unit: 'л', price: 70.00 }
    ]);
    approvedOrders.push(order2);
    
    // Заказ 3 от первого ресторана (второй заказ)
    const order3 = await createApprovedOrder(restaurant1User, manager, [
      { product_name: 'Курица', quantity: 50, unit: 'кг', price: 150.00 },
      { product_name: 'Молоко 3.2%', quantity: 40, unit: 'л', price: 70.00 }
    ]);
    approvedOrders.push(order3);
  });

  async function createApprovedOrder(user, manager, items) {
    const order = await OrderService.createOrder({
      restaurant_id: user.restaurant_id,
      user_id: user.id
    });
    
    // Добавляем товары
    for (const item of items) {
      await OrderService.addItemToOrder(order.id, item);
    }
    
    // Отправляем и одобряем
    await OrderService.sendOrder(order.id);
    await OrderService.startProcessingOrder(order.id, manager.id);
    
    // Устанавливаем цены
    const orderItems = await OrderItem.findAll({ where: { order_id: order.id } });
    for (const orderItem of orderItems) {
      const itemData = items.find(i => i.product_name === orderItem.product_name);
      await OrderService.updateOrderItemPrice(orderItem.id, { price: itemData.price });
    }
    
    return await OrderService.approveOrder(order.id, manager.id);
  }

  describe('Получение заказов для консолидации', () => {
    test('Закупщик видит все одобренные заказы', async () => {
      const ordersForConsolidation = await ConsolidationService.getOrdersForConsolidation();
      
      expect(ordersForConsolidation).toHaveLength(3);
      expect(ordersForConsolidation.every(o => o.status === 'approved')).toBe(true);
    });

    test('Заказы группируются по дате', async () => {
      const groupedOrders = await ConsolidationService.getOrdersGroupedByDate();
      
      const today = new Date().toISOString().split('T')[0];
      expect(groupedOrders[today]).toBeDefined();
      expect(groupedOrders[today]).toHaveLength(3);
    });

    test('Подсчет общих объемов по продуктам', async () => {
      const productTotals = await ConsolidationService.calculateProductTotals(
        approvedOrders.map(o => o.id)
      );
      
      // Картофель: 100 + 80 = 180 кг
      expect(productTotals['Картофель']).toEqual({
        product_name: 'Картофель',
        total_quantity: 180,
        unit: 'кг',
        avg_price: 35.00,
        restaurants: expect.arrayContaining([
          expect.objectContaining({ restaurant_id: 1, quantity: 100 }),
          expect.objectContaining({ restaurant_id: 2, quantity: 80 })
        ])
      });
      
      // Морковь: 50 + 40 = 90 кг
      expect(productTotals['Морковь'].total_quantity).toBe(90);
      
      // Молоко: 60 + 40 = 100 л
      expect(productTotals['Молоко 3.2%'].total_quantity).toBe(100);
    });
  });

  describe('Создание консолидации', () => {
    test('Успешное создание консолидации заказов', async () => {
      const consolidation = await ConsolidationService.createConsolidation(
        approvedOrders.map(o => o.id),
        buyer.id,
        'Консолидация на понедельник'
      );
      
      expect(consolidation).toBeTruthy();
      expect(consolidation.consolidation_number).toMatch(/^CONS-\d{8}-\d+$/);
      expect(consolidation.status).toBe('draft');
      expect(consolidation.created_by).toBe(buyer.id);
      expect(consolidation.notes).toBe('Консолидация на понедельник');
      
      // Проверяем связанные заказы
      const linkedOrders = await consolidation.getOrders();
      expect(linkedOrders).toHaveLength(3);
    });

    test('Автоматическая группировка товаров при консолидации', async () => {
      const consolidation = await ConsolidationService.createConsolidation(
        approvedOrders.map(o => o.id),
        buyer.id
      );
      
      const items = await ConsolidationItem.findAll({
        where: { consolidation_id: consolidation.id },
        order: [['product_name', 'ASC']]
      });
      
      // Должно быть 5 уникальных товаров
      expect(items).toHaveLength(5);
      
      // Проверяем консолидированные количества
      const kartoshka = items.find(i => i.product_name === 'Картофель');
      expect(kartoshka.total_quantity).toBe(180);
      expect(kartoshka.supplier_price).toBe(35.00);
      
      const milk = items.find(i => i.product_name === 'Молоко 3.2%');
      expect(milk.total_quantity).toBe(100);
    });

    test('Нельзя консолидировать уже консолидированные заказы', async () => {
      const consolidation = await ConsolidationService.createConsolidation(
        [approvedOrders[0].id],
        buyer.id
      );
      
      await expect(ConsolidationService.createConsolidation(
        [approvedOrders[0].id],
        buyer.id
      )).rejects.toThrow('уже включен в консолидацию');
    });
  });

  describe('Работа с консолидацией', () => {
    let consolidation;

    beforeEach(async () => {
      consolidation = await ConsolidationService.createConsolidation(
        approvedOrders.map(o => o.id),
        buyer.id
      );
    });

    test('Установка цен поставщика', async () => {
      const items = await ConsolidationItem.findAll({
        where: { consolidation_id: consolidation.id }
      });
      
      // Устанавливаем новую цену для картофеля
      await ConsolidationService.updateSupplierPrice(
        items[0].id,
        { supplier_price: 32.00 }
      );
      
      const updated = await ConsolidationItem.findByPk(items[0].id);
      expect(updated.supplier_price).toBe(32.00);
      expect(updated.supplier_total).toBe(5760.00); // 180 * 32
    });

    test('Добавление комментариев к позициям', async () => {
      const items = await ConsolidationItem.findAll({
        where: { consolidation_id: consolidation.id }
      });
      
      await ConsolidationService.updateItemComment(
        items[0].id,
        'Поставщик обещал скидку 5%'
      );
      
      const updated = await ConsolidationItem.findByPk(items[0].id);
      expect(updated.comment).toBe('Поставщик обещал скидку 5%');
    });

    test('Отправка консолидации поставщику', async () => {
      // Устанавливаем все цены
      const items = await ConsolidationItem.findAll({
        where: { consolidation_id: consolidation.id }
      });
      
      for (const item of items) {
        await ConsolidationService.updateSupplierPrice(
          item.id,
          { supplier_price: item.supplier_price || 100.00 }
        );
      }
      
      const sent = await ConsolidationService.sendToSupplier(
        consolidation.id,
        buyer.id
      );
      
      expect(sent.status).toBe('sent');
      expect(sent.sent_at).toBeTruthy();
      expect(sent.sent_by).toBe(buyer.id);
      
      // Проверяем обновление статусов заказов
      for (const order of approvedOrders) {
        const updated = await Order.findByPk(order.id);
        expect(updated.status).toBe('consolidated');
      }
    });

    test('Нельзя отправить консолидацию без всех цен', async () => {
      await expect(ConsolidationService.sendToSupplier(
        consolidation.id,
        buyer.id
      )).rejects.toThrow('Не все цены поставщика установлены');
    });
  });

  describe('Ввод фактических цен', () => {
    let sentConsolidation;

    beforeEach(async () => {
      const consolidation = await ConsolidationService.createConsolidation(
        approvedOrders.map(o => o.id),
        buyer.id
      );
      
      // Устанавливаем цены и отправляем
      const items = await ConsolidationItem.findAll({
        where: { consolidation_id: consolidation.id }
      });
      
      for (const item of items) {
        await ConsolidationService.updateSupplierPrice(
          item.id,
          { supplier_price: 100.00 }
        );
      }
      
      sentConsolidation = await ConsolidationService.sendToSupplier(
        consolidation.id,
        buyer.id
      );
    });

    test('Ввод фактических цен после получения товара', async () => {
      const items = await ConsolidationItem.findAll({
        where: { consolidation_id: sentConsolidation.id }
      });
      
      // Вводим фактические цены
      await ConsolidationService.updateActualPrice(
        items[0].id,
        { 
          actual_price: 33.00,
          actual_quantity: 175  // Недопоставка 5 кг
        }
      );
      
      const updated = await ConsolidationItem.findByPk(items[0].id);
      expect(updated.actual_price).toBe(33.00);
      expect(updated.actual_quantity).toBe(175);
      expect(updated.actual_total).toBe(5775.00); // 175 * 33
    });

    test('Завершение консолидации после ввода всех фактических цен', async () => {
      const items = await ConsolidationItem.findAll({
        where: { consolidation_id: sentConsolidation.id }
      });
      
      // Вводим фактические цены для всех позиций
      for (const item of items) {
        await ConsolidationService.updateActualPrice(
          item.id,
          { 
            actual_price: item.supplier_price * 1.02, // +2%
            actual_quantity: item.total_quantity
          }
        );
      }
      
      // Завершаем консолидацию
      const completed = await ConsolidationService.completeConsolidation(
        sentConsolidation.id,
        buyer.id
      );
      
      expect(completed.status).toBe('completed');
      expect(completed.completed_at).toBeTruthy();
      expect(completed.completed_by).toBe(buyer.id);
      
      // Проверяем обновление статусов заказов
      for (const order of approvedOrders) {
        const updated = await Order.findByPk(order.id);
        expect(updated.status).toBe('completed');
      }
    });

    test('Нельзя завершить без всех фактических цен', async () => {
      await expect(ConsolidationService.completeConsolidation(
        sentConsolidation.id,
        buyer.id
      )).rejects.toThrow('Не все фактические цены введены');
    });
  });

  describe('Отчеты и аналитика', () => {
    test('Сравнение плановых и фактических цен', async () => {
      const consolidation = await ConsolidationService.createConsolidation(
        approvedOrders.map(o => o.id),
        buyer.id
      );
      
      const items = await ConsolidationItem.findAll({
        where: { consolidation_id: consolidation.id }
      });
      
      // Устанавливаем цены
      for (const item of items) {
        await ConsolidationService.updateSupplierPrice(
          item.id,
          { supplier_price: 100.00 }
        );
        
        await ConsolidationService.updateActualPrice(
          item.id,
          { 
            actual_price: 105.00,
            actual_quantity: item.total_quantity
          }
        );
      }
      
      const report = await ConsolidationService.generatePriceComparisonReport(
        consolidation.id
      );
      
      expect(report.total_planned).toBeTruthy();
      expect(report.total_actual).toBeTruthy();
      expect(report.difference_amount).toBe(report.total_actual - report.total_planned);
      expect(report.difference_percent).toBeCloseTo(5, 1);
      
      expect(report.items).toHaveLength(items.length);
      expect(report.items[0]).toMatchObject({
        product_name: expect.any(String),
        planned_price: 100.00,
        actual_price: 105.00,
        difference: 5.00,
        difference_percent: 5
      });
    });

    test('История цен по продуктам', async () => {
      // Создаем несколько консолидаций для истории
      for (let i = 0; i < 3; i++) {
        const order = await createApprovedOrder(restaurant1User, manager, [
          { product_name: 'Картофель', quantity: 100, unit: 'кг', price: 35 + i }
        ]);
        
        const cons = await ConsolidationService.createConsolidation(
          [order.id],
          buyer.id
        );
        
        const items = await ConsolidationItem.findAll({
          where: { consolidation_id: cons.id }
        });
        
        await ConsolidationService.updateActualPrice(
          items[0].id,
          { actual_price: 32 + i, actual_quantity: 100 }
        );
      }
      
      const history = await ConsolidationService.getProductPriceHistory('Картофель');
      
      expect(history).toHaveLength(4); // 3 новых + 1 из beforeEach
      expect(history[0].actual_price).toBe(32);
      expect(history[1].actual_price).toBe(33);
      expect(history[2].actual_price).toBe(34);
    });
  });

  describe('Экспорт данных консолидации', () => {
    test('Экспорт консолидации в Excel', async () => {
      const consolidation = await ConsolidationService.createConsolidation(
        approvedOrders.map(o => o.id),
        buyer.id
      );
      
      const exportData = await ConsolidationService.exportToExcel(consolidation.id);
      
      expect(exportData).toBeTruthy();
      expect(exportData.filename).toMatch(/^consolidation_.*\.xlsx$/);
      expect(exportData.sheets).toContain('Сводка');
      expect(exportData.sheets).toContain('Детализация');
      expect(exportData.sheets).toContain('По ресторанам');
    });

    test('Формирование заказа поставщику', async () => {
      const consolidation = await ConsolidationService.createConsolidation(
        approvedOrders.map(o => o.id),
        buyer.id
      );
      
      const supplierOrder = await ConsolidationService.generateSupplierOrder(
        consolidation.id
      );
      
      expect(supplierOrder).toMatchObject({
        order_number: consolidation.consolidation_number,
        date: expect.any(String),
        items: expect.arrayContaining([
          expect.objectContaining({
            product_name: expect.any(String),
            quantity: expect.any(Number),
            unit: expect.any(String)
          })
        ]),
        total_positions: expect.any(Number),
        delivery_addresses: expect.any(Array)
      });
    });
  });
});