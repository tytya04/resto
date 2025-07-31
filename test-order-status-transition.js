const { Order, OrderItem, Restaurant, User, NomenclatureCache } = require('./src/database/models');
const sequelize = require('./src/database/config');

async function testOrderStatusTransition() {
  try {
    console.log('🔍 Проверка перехода статусов заказов...\n');

    // 1. Проверяем заказы со статусом 'sent'
    const sentOrders = await Order.findAll({
      where: { status: 'sent' },
      include: [
        { model: Restaurant, as: 'restaurant' },
        { model: OrderItem, as: 'orderItems' }
      ],
      limit: 5
    });

    console.log(`📤 Найдено заказов со статусом 'sent': ${sentOrders.length}`);
    if (sentOrders.length > 0) {
      console.log('Примеры:');
      sentOrders.forEach(order => {
        console.log(`  - #${order.order_number} от ${order.restaurant.name} (${order.orderItems.length} позиций)`);
      });
    }

    // 2. Проверяем заказы со статусом 'processing'
    const processingOrders = await Order.findAll({
      where: { status: 'processing' },
      include: [
        { model: Restaurant, as: 'restaurant' }
      ],
      limit: 5
    });

    console.log(`\n⏳ Найдено заказов со статусом 'processing': ${processingOrders.length}`);
    if (processingOrders.length > 0) {
      console.log('Примеры:');
      processingOrders.forEach(order => {
        console.log(`  - #${order.order_number} от ${order.restaurant.name}`);
        if (order.processed_at) {
          console.log(`    Начата обработка: ${order.processed_at.toLocaleString('ru-RU')}`);
        }
      });
    }

    // 3. Проверяем заказы со статусом 'completed'
    const completedOrders = await Order.findAll({
      where: { status: 'completed' },
      include: [
        { model: Restaurant, as: 'restaurant' }
      ],
      order: [['completed_at', 'DESC']],
      limit: 5
    });

    console.log(`\n✅ Найдено заказов со статусом 'completed': ${completedOrders.length}`);
    if (completedOrders.length > 0) {
      console.log('Последние завершенные:');
      completedOrders.forEach(order => {
        console.log(`  - #${order.order_number} от ${order.restaurant.name}`);
        if (order.completed_at) {
          console.log(`    Завершен: ${order.completed_at.toLocaleString('ru-RU')}`);
        }
      });
    }

    // 4. Проверяем продукты с технической пометкой "Сенной"
    console.log('\n🌿 Проверка продуктов с пометкой "Сенной":');
    const sennoyProducts = await NomenclatureCache.findAll({
      where: { technical_note: 'Сенной' }
    });

    console.log(`Найдено продуктов: ${sennoyProducts.length}`);
    sennoyProducts.forEach(product => {
      console.log(`  - ${product.product_name} (${product.unit})`);
    });

    // 5. Проверяем заказы с продуктами "Сенной"
    if (sennoyProducts.length > 0) {
      const sennoyProductNames = sennoyProducts.map(p => p.product_name);
      const ordersWithSennoy = await OrderItem.findAll({
        where: {
          product_name: sennoyProductNames
        },
        include: [
          {
            model: Order,
            as: 'order',
            where: { status: ['sent', 'processing'] },
            include: [
              { model: Restaurant, as: 'restaurant' }
            ]
          }
        ],
        limit: 5
      });

      console.log(`\n📋 Найдено заказов с продуктами "Сенной": ${ordersWithSennoy.length}`);
      if (ordersWithSennoy.length > 0) {
        ordersWithSennoy.forEach(item => {
          console.log(`  - ${item.product_name} в заказе #${item.order.order_number} от ${item.order.restaurant.name}`);
        });
      }
    }

    console.log('\n✨ Проверка завершена!');
    
  } catch (error) {
    console.error('❌ Ошибка при проверке:', error);
  }
  
  process.exit(0);
}

testOrderStatusTransition();