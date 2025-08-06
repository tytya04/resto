const { Purchase, Order, OrderItem, User, Restaurant } = require('./src/database/models');

async function testPackingFlow() {
  try {
    console.log('=== Тестирование процесса сборки корзин ===\n');
    
    // 1. Создаем тестовую закупку в статусе 'packing'
    console.log('1. Создаем тестовую закупку в статусе packing...');
    
    const buyer = await User.findOne({ where: { role: 'buyer' } });
    if (!buyer) {
      console.log('❌ Закупщик не найден');
      return;
    }
    
    const testPurchase = await Purchase.create({
      buyer_id: buyer.id,
      consolidated_product_id: `packing_test_${Date.now()}`,
      product_name: 'Закупочная сессия',
      unit: 'шт',
      total_quantity: 5,
      purchased_quantity: 5,
      total_price: 1000,
      status: 'packing',
      orders_data: JSON.stringify([]),
      created_at: new Date(),
      completed_at: new Date()
    });
    
    console.log(`✅ Создана тестовая закупка ID: ${testPurchase.id}`);
    
    // 2. Проверяем заказы со статусом 'purchased'
    console.log('\n2. Проверяем заказы для сборки...');
    
    const purchasedOrders = await Order.findAll({
      where: { status: 'purchased' },
      include: [
        { model: OrderItem, as: 'orderItems' },
        { model: Restaurant, as: 'restaurant' }
      ]
    });
    
    console.log(`Найдено заказов для сборки: ${purchasedOrders.length}`);
    
    purchasedOrders.forEach((order, index) => {
      console.log(`${index + 1}. Заказ #${order.order_number} - ${order.restaurant.name}`);
      console.log(`   Статус сборки: ${order.packing_status || 'не задан'}`);
      console.log(`   Позиций: ${order.orderItems.length}`);
    });
    
    // 3. Отмечаем первый заказ как собранный
    if (purchasedOrders.length > 0) {
      console.log('\n3. Отмечаем первый заказ как собранный...');
      const firstOrder = purchasedOrders[0];
      
      await Order.update(
        { packing_status: 'ready' },
        { where: { id: firstOrder.id } }
      );
      
      console.log(`✅ Заказ #${firstOrder.order_number} отмечен как собранный`);
    }
    
    // 4. Проверяем статус сборки
    console.log('\n4. Проверяем общий статус сборки...');
    
    const unpackedCount = await Order.count({
      where: { 
        status: 'purchased',
        packing_status: { [require('sequelize').Op.ne]: 'ready' }
      }
    });
    
    const packedCount = await Order.count({
      where: { 
        status: 'purchased',
        packing_status: 'ready'
      }
    });
    
    console.log(`Собрано: ${packedCount}, Не собрано: ${unpackedCount}`);
    console.log(`Все собрано: ${unpackedCount === 0 ? 'Да ✅' : 'Нет ❌'}`);
    
    console.log('\n=== Тест завершен ===');
    
  } catch (error) {
    console.error('Ошибка в тесте:', error);
  } finally {
    process.exit(0);
  }
}

testPackingFlow();