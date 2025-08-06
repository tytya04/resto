const { Order, OrderItem, Restaurant, Purchase, PurchaseItem, User } = require('./src/database/models');
const OrderService = require('./src/services/OrderService');

async function testPurchaseErrors() {
  try {
    console.log('=== Тестирование закупочных функций ===\n');
    
    // 1. Тестируем getConsolidatedOrders
    console.log('1. Тестируем getConsolidatedOrders...');
    try {
      const consolidated = await OrderService.getConsolidatedOrders();
      console.log(`   ✅ Успешно. Найдено ${consolidated.length} товаров`);
      if (consolidated.length > 0) {
        console.log(`   Пример: ${consolidated[0].product_name} - ${consolidated[0].total_quantity} ${consolidated[0].unit}`);
      }
    } catch (error) {
      console.log(`   ❌ Ошибка в getConsolidatedOrders:`, error.message);
    }
    
    // 2. Проверяем модель Purchase
    console.log('\n2. Проверяем модель Purchase...');
    try {
      const existingPurchase = await Purchase.findOne({
        where: { status: ['pending', 'in_progress'] }
      });
      console.log(`   ✅ Запрос к Purchase выполнен. Найдено: ${existingPurchase ? 'Да' : 'Нет'}`);
    } catch (error) {
      console.log(`   ❌ Ошибка в Purchase.findOne:`, error.message);
    }
    
    // 3. Проверяем модель PurchaseItem
    console.log('\n3. Проверяем модель PurchaseItem...');
    try {
      const itemsCount = await PurchaseItem.count();
      console.log(`   ✅ Запрос к PurchaseItem выполнен. Количество записей: ${itemsCount}`);
    } catch (error) {
      console.log(`   ❌ Ошибка в PurchaseItem.count:`, error.message);
    }
    
    // 4. Проверяем структуру таблицы purchases
    console.log('\n4. Проверяем структуру таблицы purchases...');
    try {
      const purchases = await Purchase.findAll({ limit: 1 });
      if (purchases.length > 0) {
        const purchase = purchases[0];
        console.log('   ✅ Поля в Purchase:');
        console.log(`     - total_items: ${purchase.total_items !== undefined ? 'есть' : 'НЕТ'}`);
        console.log(`     - completed_items: ${purchase.completed_items !== undefined ? 'есть' : 'НЕТ'}`);
        console.log(`     - completed_at: ${purchase.completed_at !== undefined ? 'есть' : 'НЕТ'}`);
      } else {
        console.log('   📋 Нет записей в таблице purchases для проверки');
      }
    } catch (error) {
      console.log(`   ❌ Ошибка при проверке структуры Purchase:`, error.message);
    }
    
    // 5. Проверяем создание тестовой закупки
    console.log('\n5. Тестируем создание закупки...');
    try {
      // Создаем тестовую закупку
      const testPurchase = await Purchase.create({
        consolidated_product_id: 'test_product_кг',
        product_name: 'Тестовый продукт',
        unit: 'кг',
        total_quantity: 10,
        buyer_id: 4, // ID закупщика
        status: 'pending',
        total_items: 1,
        completed_items: 0,
        orders_data: [{ order_id: 1, restaurant_id: 1, quantity: 10 }]
      });
      
      console.log(`   ✅ Тестовая закупка создана с ID: ${testPurchase.id}`);
      
      // Удаляем тестовую закупку
      await testPurchase.destroy();
      console.log(`   ✅ Тестовая закупка удалена`);
      
    } catch (error) {
      console.log(`   ❌ Ошибка при создании тестовой закупки:`, error.message);
      console.log('   Детали:', error);
    }
    
  } catch (error) {
    console.error('Общая ошибка:', error);
  } finally {
    process.exit(0);
  }
}

testPurchaseErrors();