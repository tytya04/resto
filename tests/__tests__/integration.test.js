const { Telegraf } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { 
  User, 
  Restaurant, 
  Order, 
  OrderItem, 
  Consolidation,
  ConsolidationItem,
  Settings 
} = require('../../src/database/models');
const OrderService = require('../../src/services/OrderService');
const ConsolidationService = require('../../src/services/ConsolidationService');
const DocumentService = require('../../src/services/DocumentService');
const registrationHandlers = require('../../src/handlers/registration');
const orderHandlers = require('../../src/handlers/orderHandlers');
const managerHandlers = require('../../src/handlers/managerHandlers');
const buyerHandlers = require('../../src/handlers/buyerHandlers');
const { seedTestData, clearTestData } = require('../fixtures/seedTestData');

// Создаем тестовый бот
const bot = new Telegraf('test_token');
const session = new LocalSession({ database: 'test_session.json' });
bot.use(session.middleware());

describe('Интеграционные тесты - полный цикл работы', () => {
  beforeAll(async () => {
    await clearTestData();
    await seedTestData();
  });

  afterAll(async () => {
    await clearTestData();
  });

  describe('Сценарий 1: От регистрации до получения товара', () => {
    let restaurantCtx;
    let managerCtx;
    let buyerCtx;
    let newUser;
    let order;
    let consolidation;

    test('Шаг 1: Регистрация нового пользователя ресторана', async () => {
      restaurantCtx = global.mockCtx({
        from: { 
          id: 999999999, 
          username: 'new_restaurant_user',
          first_name: 'Новый',
          last_name: 'Пользователь'
        }
      });

      // Начинаем регистрацию
      await registrationHandlers.startCommand(restaurantCtx);
      expect(restaurantCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Добро пожаловать'),
        expect.any(Object)
      );

      // Выбираем роль "Ресторан"
      restaurantCtx.callbackQuery = { data: 'reg_role:restaurant' };
      await registrationHandlers.handleRoleSelection(restaurantCtx);

      // Выбираем ресторан
      restaurantCtx.callbackQuery = { data: 'reg_restaurant:1' };
      await registrationHandlers.handleRestaurantSelection(restaurantCtx);

      // Вводим телефон
      restaurantCtx.message = { text: '+7 (999) 888-77-66' };
      await registrationHandlers.handleRegistrationText(restaurantCtx);

      // Вводим контактное лицо
      restaurantCtx.message = { text: 'Новый Пользователь' };
      await registrationHandlers.handleRegistrationText(restaurantCtx);

      // Для тестов сразу одобряем регистрацию
      newUser = await User.create({
        telegram_id: '999999999',
        username: 'new_restaurant_user',
        first_name: 'Новый',
        last_name: 'Пользователь',
        phone: '+7 (999) 888-77-66',
        role: 'restaurant',
        restaurant_id: 1,
        is_active: true
      });

      expect(newUser).toBeTruthy();
    });

    test('Шаг 2: Создание и отправка заказа', async () => {
      restaurantCtx.user = newUser;
      restaurantCtx.session = {};

      // Создаем новый заказ
      order = await OrderService.createOrder({
        restaurant_id: newUser.restaurant_id,
        user_id: newUser.id,
        notes: 'Интеграционный тест - заказ'
      });

      restaurantCtx.session.currentOrderId = order.id;

      // Добавляем товары
      const products = [
        { product_name: 'Картофель', quantity: 150, unit: 'кг', category: 'Овощи' },
        { product_name: 'Говядина', quantity: 50, unit: 'кг', category: 'Мясо' },
        { product_name: 'Молоко 3.2%', quantity: 80, unit: 'л', category: 'Молочные продукты' }
      ];

      for (const product of products) {
        await OrderService.addItemToOrder(order.id, product);
      }

      // Отправляем заказ
      const sentOrder = await OrderService.sendOrder(order.id);
      expect(sentOrder.status).toBe('sent');
      expect(sentOrder.sent_at).toBeTruthy();

      // Проверяем, что заказ содержит все товары
      const orderWithItems = await Order.findByPk(order.id, {
        include: [{ model: OrderItem, as: 'items' }]
      });
      expect(orderWithItems.items).toHaveLength(3);
    });

    test('Шаг 3: Обработка заказа менеджером', async () => {
      const manager = await User.findOne({ where: { role: 'manager' } });
      managerCtx = global.mockCtx({
        from: { id: parseInt(manager.telegram_id) },
        user: manager
      });

      // Получаем список заказов для обработки
      const pendingOrders = await OrderService.getPendingOrders();
      expect(pendingOrders).toContainEqual(
        expect.objectContaining({ id: order.id })
      );

      // Начинаем обработку
      await OrderService.startProcessingOrder(order.id, manager.id);

      // Устанавливаем цены
      const items = await OrderItem.findAll({ 
        where: { order_id: order.id },
        order: [['id', 'ASC']]
      });

      const prices = [35.00, 450.00, 70.00]; // Картофель, Говядина, Молоко
      for (let i = 0; i < items.length; i++) {
        await OrderService.updateOrderItemPrice(items[i].id, { price: prices[i] });
      }

      // Одобряем заказ
      const approvedOrder = await OrderService.approveOrder(
        order.id,
        manager.id,
        'Заказ проверен и одобрен'
      );

      expect(approvedOrder.status).toBe('approved');
      expect(approvedOrder.total_amount).toBe(15750.00); // 150*35 + 50*450 + 80*70
    });

    test('Шаг 4: Генерация ТОРГ-12 для ресторана', async () => {
      const torg12 = await DocumentService.generateTorg12(order.id);
      
      expect(torg12).toBeTruthy();
      expect(torg12.success).toBe(true);
      expect(torg12.filename).toMatch(/^TORG12_.*\.pdf$/);

      // Проверяем данные документа
      const documentData = await DocumentService.prepareTorg12Data(order.id);
      expect(documentData.items).toHaveLength(3);
      expect(documentData.totalAmount).toBe(15750.00);
    });

    test('Шаг 5: Консолидация заказов закупщиком', async () => {
      const buyer = await User.findOne({ where: { role: 'buyer' } });
      buyerCtx = global.mockCtx({
        from: { id: parseInt(buyer.telegram_id) },
        user: buyer
      });

      // Создаем еще один заказ для консолидации
      const restaurant2 = await Restaurant.findByPk(2);
      const restaurant2User = await User.findOne({ 
        where: { restaurant_id: 2, role: 'restaurant' } 
      });

      const order2 = await OrderService.createOrder({
        restaurant_id: restaurant2.id,
        user_id: restaurant2User.id
      });

      await OrderService.addItemToOrder(order2.id, {
        product_name: 'Картофель',
        quantity: 100,
        unit: 'кг'
      });

      await OrderService.addItemToOrder(order2.id, {
        product_name: 'Молоко 3.2%',
        quantity: 50,
        unit: 'л'
      });

      await OrderService.sendOrder(order2.id);
      await OrderService.startProcessingOrder(order2.id, buyer.id);

      const order2Items = await OrderItem.findAll({ where: { order_id: order2.id } });
      await OrderService.updateOrderItemPrice(order2Items[0].id, { price: 35.00 });
      await OrderService.updateOrderItemPrice(order2Items[1].id, { price: 70.00 });
      await OrderService.approveOrder(order2.id, buyer.id);

      // Создаем консолидацию
      consolidation = await ConsolidationService.createConsolidation(
        [order.id, order2.id],
        buyer.id,
        'Консолидация для интеграционного теста'
      );

      expect(consolidation).toBeTruthy();
      expect(consolidation.status).toBe('draft');

      // Проверяем объединение товаров
      const consolidationItems = await ConsolidationItem.findAll({
        where: { consolidation_id: consolidation.id }
      });

      const kartoshka = consolidationItems.find(i => i.product_name === 'Картофель');
      expect(kartoshka.total_quantity).toBe(250); // 150 + 100

      const milk = consolidationItems.find(i => i.product_name === 'Молоко 3.2%');
      expect(milk.total_quantity).toBe(130); // 80 + 50
    });

    test('Шаг 6: Отправка консолидации поставщику', async () => {
      // Устанавливаем цены поставщика
      const items = await ConsolidationItem.findAll({
        where: { consolidation_id: consolidation.id }
      });

      for (const item of items) {
        // Цены поставщика чуть ниже
        const supplierPrice = item.supplier_price * 0.95;
        await ConsolidationService.updateSupplierPrice(
          item.id,
          { supplier_price: supplierPrice }
        );
      }

      // Отправляем поставщику
      const buyer = await User.findOne({ where: { role: 'buyer' } });
      const sentConsolidation = await ConsolidationService.sendToSupplier(
        consolidation.id,
        buyer.id
      );

      expect(sentConsolidation.status).toBe('sent');
      expect(sentConsolidation.sent_at).toBeTruthy();

      // Проверяем обновление статусов заказов
      const updatedOrder1 = await Order.findByPk(order.id);
      expect(updatedOrder1.status).toBe('consolidated');
    });

    test('Шаг 7: Ввод фактических цен и завершение', async () => {
      // Имитируем получение товара с небольшими отклонениями
      const items = await ConsolidationItem.findAll({
        where: { consolidation_id: consolidation.id }
      });

      for (const item of items) {
        // Фактические цены немного выше, количество может отличаться
        const actualPrice = item.supplier_price * 1.02;
        const actualQuantity = item.total_quantity * 0.98; // 2% недопоставка

        await ConsolidationService.updateActualPrice(
          item.id,
          { 
            actual_price: actualPrice,
            actual_quantity: Math.floor(actualQuantity)
          }
        );
      }

      // Завершаем консолидацию
      const buyer = await User.findOne({ where: { role: 'buyer' } });
      const completed = await ConsolidationService.completeConsolidation(
        consolidation.id,
        buyer.id
      );

      expect(completed.status).toBe('completed');
      expect(completed.completed_at).toBeTruthy();

      // Проверяем финальные статусы заказов
      const finalOrder = await Order.findByPk(order.id);
      expect(finalOrder.status).toBe('completed');
    });

    test('Шаг 8: Проверка полной истории заказа', async () => {
      // Получаем полную информацию о заказе
      const fullOrder = await Order.findByPk(order.id, {
        include: [
          { model: OrderItem, as: 'items' },
          { model: User, as: 'user' },
          { model: User, as: 'approvedBy' },
          { model: Restaurant, as: 'restaurant' },
          { model: Consolidation, as: 'consolidations' }
        ]
      });

      expect(fullOrder.status).toBe('completed');
      expect(fullOrder.user.id).toBe(newUser.id);
      expect(fullOrder.approvedBy).toBeTruthy();
      expect(fullOrder.consolidations).toHaveLength(1);

      // Проверяем timeline заказа
      expect(fullOrder.created_at).toBeTruthy();
      expect(fullOrder.sent_at).toBeTruthy();
      expect(fullOrder.approved_at).toBeTruthy();
      expect(fullOrder.sent_at < fullOrder.approved_at).toBe(true);
    });
  });

  describe('Сценарий 2: Автоматическая отправка заказов', () => {
    test('Настройка автоматической отправки', async () => {
      // Устанавливаем время автоотправки для ресторана
      await Settings.upsert({
        key: 'auto_send_enabled',
        value: 'true',
        restaurant_id: 1,
        value_type: 'boolean'
      });

      await Settings.upsert({
        key: 'auto_send_time',
        value: '10:00',
        restaurant_id: 1,
        value_type: 'time'
      });

      const settings = await Settings.findAll({
        where: { restaurant_id: 1 }
      });

      expect(settings).toContainEqual(
        expect.objectContaining({
          key: 'auto_send_enabled',
          value: 'true'
        })
      );
    });

    test('Проверка черновиков для автоотправки', async () => {
      const user = await User.findOne({ 
        where: { restaurant_id: 1, role: 'restaurant' } 
      });

      // Создаем черновик заказа
      const draftOrder = await OrderService.createOrder({
        restaurant_id: 1,
        user_id: user.id,
        notes: 'Заказ для автоотправки'
      });

      await OrderService.addItemToOrder(draftOrder.id, {
        product_name: 'Сахар-песок',
        quantity: 100,
        unit: 'кг'
      });

      // Проверяем, что заказ в статусе draft
      expect(draftOrder.status).toBe('draft');

      // В реальной системе OrderSchedulerService отправит этот заказ в 10:00
      // Здесь мы просто проверяем, что заказ готов к автоотправке
      const drafts = await Order.findAll({
        where: { 
          restaurant_id: 1, 
          status: 'draft' 
        },
        include: [{ model: OrderItem, as: 'items' }]
      });

      expect(drafts).toContainEqual(
        expect.objectContaining({
          id: draftOrder.id,
          items: expect.arrayContaining([
            expect.objectContaining({ product_name: 'Сахар-песок' })
          ])
        })
      );
    });
  });

  describe('Сценарий 3: Обработка ошибок и восстановление', () => {
    test('Откат транзакции при ошибке создания заказа', async () => {
      const user = await User.findOne({ where: { role: 'restaurant' } });
      
      // Пытаемся создать заказ с невалидными данными
      await expect(OrderService.createOrder({
        restaurant_id: 9999, // Несуществующий ресторан
        user_id: user.id
      })).rejects.toThrow();

      // Проверяем, что заказ не создан
      const orders = await Order.findAll({
        where: { user_id: user.id }
      });
      
      const invalidOrder = orders.find(o => o.restaurant_id === 9999);
      expect(invalidOrder).toBeUndefined();
    });

    test('Восстановление после сбоя при консолидации', async () => {
      // Создаем заказ для консолидации
      const user = await User.findOne({ where: { role: 'restaurant' } });
      const manager = await User.findOne({ where: { role: 'manager' } });
      
      const order = await OrderService.createOrder({
        restaurant_id: user.restaurant_id,
        user_id: user.id
      });

      await OrderService.addItemToOrder(order.id, {
        product_name: 'Тестовый продукт',
        quantity: 10,
        unit: 'шт'
      });

      await OrderService.sendOrder(order.id);
      await OrderService.startProcessingOrder(order.id, manager.id);
      
      const items = await OrderItem.findAll({ where: { order_id: order.id } });
      await OrderService.updateOrderItemPrice(items[0].id, { price: 100 });
      
      await OrderService.approveOrder(order.id, manager.id);

      // Пытаемся создать консолидацию с ошибкой
      const buyer = await User.findOne({ where: { role: 'buyer' } });
      
      // Первая попытка - успешная
      const consolidation = await ConsolidationService.createConsolidation(
        [order.id],
        buyer.id
      );

      // Вторая попытка с тем же заказом должна вернуть ошибку
      await expect(ConsolidationService.createConsolidation(
        [order.id],
        buyer.id
      )).rejects.toThrow('уже включен в консолидацию');

      // Проверяем, что первая консолидация осталась
      const existingConsolidation = await Consolidation.findByPk(consolidation.id);
      expect(existingConsolidation).toBeTruthy();
    });
  });
});