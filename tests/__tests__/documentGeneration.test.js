const DocumentService = require('../../src/services/DocumentService');
const OrderService = require('../../src/services/OrderService');
const { Order, OrderItem, User, Restaurant } = require('../../src/database/models');
const { 
  testUsers, 
  testRestaurants,
  mockEmailService 
} = require('../fixtures/testData');
const { seedTestData, clearTestData } = require('../fixtures/seedTestData');
const fs = require('fs').promises;
const path = require('path');

// Mock EmailService
jest.mock('../../src/services/EmailService', () => mockEmailService);

// Mock file system для проверки генерации файлов
jest.mock('fs').promises = {
  writeFile: jest.fn().mockResolvedValue(true),
  readFile: jest.fn().mockResolvedValue(Buffer.from('PDF content')),
  unlink: jest.fn().mockResolvedValue(true),
  mkdir: jest.fn().mockResolvedValue(true)
};

describe('Генерация документов ТОРГ-12', () => {
  let manager;
  let restaurantUser;
  let restaurant;
  let approvedOrder;

  beforeEach(async () => {
    await clearTestData();
    await seedTestData();
    
    // Получаем пользователей
    manager = await User.findByPk(2);
    restaurantUser = await User.findByPk(4);
    restaurant = await Restaurant.findByPk(1);
    
    // Создаем и одобряем заказ
    const order = await OrderService.createOrder({
      restaurant_id: restaurant.id,
      user_id: restaurantUser.id,
      notes: 'Заказ для тестирования документов'
    });
    
    // Добавляем товары с разными категориями
    await OrderService.addItemToOrder(order.id, {
      product_name: 'Картофель',
      quantity: 100,
      unit: 'кг',
      category: 'Овощи'
    });
    
    await OrderService.addItemToOrder(order.id, {
      product_name: 'Морковь',
      quantity: 50,
      unit: 'кг',
      category: 'Овощи'
    });
    
    await OrderService.addItemToOrder(order.id, {
      product_name: 'Говядина',
      quantity: 30,
      unit: 'кг',
      category: 'Мясо'
    });
    
    await OrderService.addItemToOrder(order.id, {
      product_name: 'Молоко 3.2%',
      quantity: 40,
      unit: 'л',
      category: 'Молочные продукты'
    });
    
    await OrderService.addItemToOrder(order.id, {
      product_name: 'Мука пшеничная в/с',
      quantity: 25,
      unit: 'кг',
      category: 'Бакалея'
    });
    
    // Отправляем и одобряем заказ
    await OrderService.sendOrder(order.id);
    await OrderService.startProcessingOrder(order.id, manager.id);
    
    // Устанавливаем цены
    const items = await OrderItem.findAll({ where: { order_id: order.id } });
    const prices = {
      'Картофель': 35.00,
      'Морковь': 40.00,
      'Говядина': 450.00,
      'Молоко 3.2%': 70.00,
      'Мука пшеничная в/с': 45.00
    };
    
    for (const item of items) {
      await OrderService.updateOrderItemPrice(item.id, { 
        price: prices[item.product_name] 
      });
    }
    
    approvedOrder = await OrderService.approveOrder(
      order.id, 
      manager.id,
      'Заказ одобрен для тестирования'
    );
  });

  describe('Генерация накладной ТОРГ-12', () => {
    test('Успешная генерация документа', async () => {
      const result = await DocumentService.generateTorg12(approvedOrder.id);
      
      expect(result).toBeTruthy();
      expect(result.filename).toMatch(/^TORG12_.*\.pdf$/);
      expect(result.filepath).toContain('temp');
      expect(result.success).toBe(true);
    });

    test('Документ содержит все необходимые данные', async () => {
      const documentData = await DocumentService.prepareTorg12Data(approvedOrder.id);
      
      // Проверяем данные поставщика
      expect(documentData.supplier).toMatchObject({
        name: 'ООО "Поставщик Продуктов"',
        inn: '7701234567890',
        kpp: '770101001',
        address: expect.stringContaining('Москва')
      });
      
      // Проверяем данные покупателя
      expect(documentData.buyer).toMatchObject({
        name: restaurant.legal_name,
        inn: restaurant.inn,
        kpp: restaurant.kpp,
        address: restaurant.address
      });
      
      // Проверяем номер и дату
      expect(documentData.documentNumber).toBe(approvedOrder.order_number);
      expect(documentData.documentDate).toBeTruthy();
      
      // Проверяем позиции
      expect(documentData.items).toHaveLength(5);
      expect(documentData.items[0]).toMatchObject({
        name: 'Картофель',
        unit: 'кг',
        quantity: 100,
        price: 35.00,
        total: 3500.00
      });
      
      // Проверяем итоговые суммы
      const expectedTotal = 3500 + 2000 + 13500 + 2800 + 1125; // 22925
      expect(documentData.totalAmount).toBe(expectedTotal);
      expect(documentData.totalAmountVAT).toBeCloseTo(expectedTotal * 0.1, 2);
      expect(documentData.totalAmountWithVAT).toBeCloseTo(expectedTotal * 1.1, 2);
    });

    test('Нельзя создать документ для неодобренного заказа', async () => {
      const draftOrder = await OrderService.createOrder({
        restaurant_id: restaurant.id,
        user_id: restaurantUser.id
      });
      
      await expect(DocumentService.generateTorg12(draftOrder.id))
        .rejects.toThrow('одобрен');
    });

    test('Группировка товаров по категориям', async () => {
      const documentData = await DocumentService.prepareTorg12Data(approvedOrder.id);
      
      // Проверяем, что товары упорядочены по категориям
      const categories = documentData.items.map(item => item.category);
      
      // Овощи должны быть первыми
      expect(categories[0]).toBe('Овощи');
      expect(categories[1]).toBe('Овощи');
      
      // Проверяем, что категории идут группами
      const uniqueCategories = [...new Set(categories)];
      expect(uniqueCategories).toEqual(['Овощи', 'Мясо', 'Молочные продукты', 'Бакалея']);
    });
  });

  describe('Отправка документов по email', () => {
    test('Отправка ТОРГ-12 на email ресторана', async () => {
      const result = await DocumentService.generateAndSendTorg12(
        approvedOrder.id,
        restaurant.email
      );
      
      expect(result.success).toBe(true);
      expect(mockEmailService.sendTorg12).toHaveBeenCalledWith(
        restaurant.email,
        expect.objectContaining({
          orderNumber: approvedOrder.order_number,
          restaurantName: restaurant.name,
          attachmentPath: expect.stringContaining('.pdf')
        })
      );
    });

    test('Автоматическая отправка бухгалтеру при генерации', async () => {
      // Устанавливаем email бухгалтера в настройках
      const { Settings } = require('../../src/database/models');
      await Settings.create({
        key: 'accountant_email',
        value: 'accountant@test.com',
        value_type: 'string'
      });
      
      await DocumentService.generateTorg12(approvedOrder.id, true);
      
      expect(mockEmailService.sendTorg12).toHaveBeenCalledWith(
        'accountant@test.com',
        expect.any(Object)
      );
    });

    test('Обработка ошибок при отправке', async () => {
      mockEmailService.sendTorg12.mockRejectedValueOnce(new Error('SMTP error'));
      
      const result = await DocumentService.generateAndSendTorg12(
        approvedOrder.id,
        'invalid@email.com'
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('SMTP error');
    });
  });

  describe('Массовая генерация документов', () => {
    test('Генерация ТОРГ-12 для нескольких заказов', async () => {
      // Создаем второй одобренный заказ
      const order2 = await OrderService.createOrder({
        restaurant_id: restaurant.id,
        user_id: restaurantUser.id
      });
      
      await OrderService.addItemToOrder(order2.id, {
        product_name: 'Сахар-песок',
        quantity: 50,
        unit: 'кг'
      });
      
      await OrderService.sendOrder(order2.id);
      await OrderService.startProcessingOrder(order2.id, manager.id);
      
      const items = await OrderItem.findAll({ where: { order_id: order2.id } });
      await OrderService.updateOrderItemPrice(items[0].id, { price: 65.00 });
      
      const approvedOrder2 = await OrderService.approveOrder(order2.id, manager.id);
      
      // Генерируем документы для обоих заказов
      const results = await DocumentService.generateBatchTorg12([
        approvedOrder.id,
        approvedOrder2.id
      ]);
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[0].orderId).toBe(approvedOrder.id);
      expect(results[1].orderId).toBe(approvedOrder2.id);
    });
  });

  describe('Форматирование данных для печати', () => {
    test('Правильное форматирование денежных сумм', async () => {
      const documentData = await DocumentService.prepareTorg12Data(approvedOrder.id);
      
      // Проверяем форматирование
      expect(documentData.totalAmountFormatted).toMatch(/^\d{1,3}( \d{3})*,\d{2}$/);
      expect(documentData.totalAmountWords).toBeTruthy();
      expect(documentData.totalAmountWords).toContain('рублей');
    });

    test('Форматирование дат', async () => {
      const documentData = await DocumentService.prepareTorg12Data(approvedOrder.id);
      
      // Дата должна быть в формате ДД.ММ.ГГГГ
      expect(documentData.documentDate).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    });

    test('Нумерация позиций в документе', async () => {
      const documentData = await DocumentService.prepareTorg12Data(approvedOrder.id);
      
      // Проверяем последовательную нумерацию
      documentData.items.forEach((item, index) => {
        expect(item.position).toBe(index + 1);
      });
    });
  });

  describe('Кэширование и очистка временных файлов', () => {
    test('Удаление временных файлов после отправки', async () => {
      const result = await DocumentService.generateAndSendTorg12(
        approvedOrder.id,
        restaurant.email
      );
      
      // Проверяем, что файл был удален
      expect(fs.promises.unlink).toHaveBeenCalledWith(
        expect.stringContaining('.pdf')
      );
    });

    test('Очистка старых временных файлов', async () => {
      await DocumentService.cleanupTempFiles();
      
      // В реальной реализации это удалит файлы старше 24 часов
      expect(fs.promises.unlink).toHaveBeenCalled();
    });
  });
});