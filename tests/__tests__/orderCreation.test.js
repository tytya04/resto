const OrderService = require('../../src/services/OrderService');
const productMatcher = require('../../src/services/ProductMatcher');
const { Order, OrderItem, User, Restaurant, NomenclatureCache } = require('../../src/database/models');
const { 
  testUsers, 
  testProducts, 
  createTestOrder, 
  createTestOrderItem,
  mockGoogleSheetsService 
} = require('../fixtures/testData');
const { seedTestData, clearTestData } = require('../fixtures/seedTestData');

// Mock сервисов
jest.mock('../../src/services/GoogleSheetsService', () => mockGoogleSheetsService);

describe('Создание и отправка заявки', () => {
  let restaurantUser;
  let restaurant;

  beforeEach(async () => {
    await clearTestData();
    await seedTestData();
    
    // Инициализируем ProductMatcher с тестовыми данными
    await productMatcher.initialize();
    
    // Получаем пользователя ресторана
    restaurantUser = await User.findByPk(4, {
      include: [{ model: Restaurant, as: 'restaurant' }]
    });
    restaurant = restaurantUser.restaurant;
  });

  describe('OrderService - Создание заказа', () => {
    test('Создание нового заказа', async () => {
      const orderData = {
        restaurant_id: restaurant.id,
        user_id: restaurantUser.id,
        notes: 'Тестовый заказ'
      };

      const order = await OrderService.createOrder(orderData);

      expect(order).toBeTruthy();
      expect(order.restaurant_id).toBe(restaurant.id);
      expect(order.user_id).toBe(restaurantUser.id);
      expect(order.status).toBe('draft');
      expect(order.order_number).toMatch(/^ORD-\d{8}-\d+$/);
    });

    test('Добавление товаров в заказ', async () => {
      const order = await OrderService.createOrder({
        restaurant_id: restaurant.id,
        user_id: restaurantUser.id
      });

      const itemData = createTestOrderItem({
        product_name: 'Картофель',
        quantity: 50,
        unit: 'кг'
      });

      const item = await OrderService.addItemToOrder(order.id, itemData);

      expect(item).toBeTruthy();
      expect(item.order_id).toBe(order.id);
      expect(item.product_name).toBe('Картофель');
      expect(item.quantity).toBe(50);

      // Проверяем, что товар добавлен к заказу
      const updatedOrder = await Order.findByPk(order.id, {
        include: [{ model: OrderItem, as: 'items' }]
      });
      expect(updatedOrder.items).toHaveLength(1);
    });

    test('Обновление позиции заказа', async () => {
      const order = await OrderService.createOrder({
        restaurant_id: restaurant.id,
        user_id: restaurantUser.id
      });

      const item = await OrderService.addItemToOrder(order.id, {
        product_name: 'Морковь',
        quantity: 20,
        unit: 'кг'
      });

      const updated = await OrderService.updateOrderItem(item.id, {
        quantity: 30
      });

      expect(updated.quantity).toBe(30);
    });

    test('Удаление позиции из заказа', async () => {
      const order = await OrderService.createOrder({
        restaurant_id: restaurant.id,
        user_id: restaurantUser.id
      });

      const item = await OrderService.addItemToOrder(order.id, {
        product_name: 'Лук репчатый',
        quantity: 15,
        unit: 'кг'
      });

      await OrderService.removeItemFromOrder(item.id);

      const deletedItem = await OrderItem.findByPk(item.id);
      expect(deletedItem).toBeNull();
    });

    test('Отправка заказа', async () => {
      const order = await OrderService.createOrder({
        restaurant_id: restaurant.id,
        user_id: restaurantUser.id
      });

      // Добавляем несколько товаров
      await OrderService.addItemToOrder(order.id, {
        product_name: 'Говядина',
        quantity: 20,
        unit: 'кг'
      });

      await OrderService.addItemToOrder(order.id, {
        product_name: 'Молоко 3.2%',
        quantity: 30,
        unit: 'л'
      });

      const sentOrder = await OrderService.sendOrder(order.id);

      expect(sentOrder.status).toBe('sent');
      expect(sentOrder.sent_at).toBeTruthy();
    });

    test('Нельзя отправить пустой заказ', async () => {
      const order = await OrderService.createOrder({
        restaurant_id: restaurant.id,
        user_id: restaurantUser.id
      });

      await expect(OrderService.sendOrder(order.id))
        .rejects.toThrow('Нельзя отправить пустой заказ');
    });

    test('Нельзя редактировать отправленный заказ', async () => {
      const order = await OrderService.createOrder({
        restaurant_id: restaurant.id,
        user_id: restaurantUser.id
      });

      const item = await OrderService.addItemToOrder(order.id, {
        product_name: 'Сахар-песок',
        quantity: 25,
        unit: 'кг'
      });

      await OrderService.sendOrder(order.id);

      await expect(OrderService.updateOrderItem(item.id, { quantity: 50 }))
        .rejects.toThrow('изменить отправленный заказ');
    });
  });

  describe('ProductMatcher - Поиск продуктов', () => {
    test('Поиск продукта по точному названию', async () => {
      const results = await productMatcher.suggestProducts('Картофель');

      expect(results).toHaveLength(5);
      expect(results[0].product_name).toBe('Картофель');
      expect(results[0].score).toBeGreaterThan(0.8);
    });

    test('Поиск продукта с опечаткой', async () => {
      const results = await productMatcher.suggestProducts('картошка');

      expect(results).toHaveLength(5);
      expect(results[0].product_name).toBe('Картофель');
    });

    test('Поиск по категории', async () => {
      const categories = await productMatcher.getCategories();
      expect(categories).toContain('Овощи');
      expect(categories).toContain('Мясо');
      expect(categories).toContain('Молочные продукты');
      expect(categories).toContain('Бакалея');

      const products = await productMatcher.getProductsByCategory('Мясо');
      expect(products).toHaveLength(3);
      expect(products.every(p => p.category === 'Мясо')).toBe(true);
    });

    test('Обучение синонимам', async () => {
      // Обучаем систему, что "картошка" = "Картофель"
      await productMatcher.learnSynonym('картошка', 'Картофель');

      // Теперь поиск должен находить картофель первым
      const results = await productMatcher.suggestProducts('картошка');
      expect(results[0].product_name).toBe('Картофель');
    });
  });

  describe('Сценарий создания заказа пользователем', () => {
    test('Полный процесс создания и отправки заказа', async () => {
      // 1. Создаем заказ
      const order = await OrderService.createOrder({
        restaurant_id: restaurant.id,
        user_id: restaurantUser.id,
        notes: 'Заказ на понедельник'
      });

      // 2. Ищем и добавляем продукты
      const searchResults1 = await productMatcher.suggestProducts('картофель');
      await OrderService.addItemToOrder(order.id, {
        product_name: searchResults1[0].product_name,
        quantity: 100,
        unit: searchResults1[0].unit,
        category: searchResults1[0].category
      });

      const searchResults2 = await productMatcher.suggestProducts('говядина');
      await OrderService.addItemToOrder(order.id, {
        product_name: searchResults2[0].product_name,
        quantity: 25,
        unit: searchResults2[0].unit,
        category: searchResults2[0].category
      });

      const searchResults3 = await productMatcher.suggestProducts('молоко');
      await OrderService.addItemToOrder(order.id, {
        product_name: searchResults3[0].product_name,
        quantity: 50,
        unit: searchResults3[0].unit,
        category: searchResults3[0].category
      });

      // 3. Проверяем текущий заказ
      const currentOrder = await OrderService.getOrderById(order.id);
      expect(currentOrder.items).toHaveLength(3);

      // 4. Отправляем заказ
      const sentOrder = await OrderService.sendOrder(order.id);
      expect(sentOrder.status).toBe('sent');
      expect(sentOrder.sent_at).toBeTruthy();

      // 5. Проверяем, что заказ доступен менеджерам
      const pendingOrders = await OrderService.getPendingOrders();
      expect(pendingOrders).toContainEqual(
        expect.objectContaining({
          id: order.id,
          status: 'sent'
        })
      );
    });

    test('Черновик заказа сохраняется между сессиями', async () => {
      // Создаем черновик
      const order = await OrderService.createOrder({
        restaurant_id: restaurant.id,
        user_id: restaurantUser.id
      });

      await OrderService.addItemToOrder(order.id, {
        product_name: 'Мука пшеничная в/с',
        quantity: 50,
        unit: 'кг'
      });

      // Получаем текущие черновики пользователя
      const drafts = await Order.findAll({
        where: {
          user_id: restaurantUser.id,
          status: 'draft'
        },
        include: [{ model: OrderItem, as: 'items' }]
      });

      expect(drafts).toHaveLength(1);
      expect(drafts[0].items).toHaveLength(1);
      expect(drafts[0].items[0].product_name).toBe('Мука пшеничная в/с');
    });
  });
});