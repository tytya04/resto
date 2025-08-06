const { Order, OrderItem, Restaurant, User } = require('./src/database/models');
const OrderService = require('./src/services/OrderService');
const procurementHandlers = require('./src/handlers/procurement');

async function testConsolidation() {
  try {
    console.log('Тестирование консолидации заказов...\n');
    
    // Получаем консолидированные заказы
    const consolidated = await OrderService.getConsolidatedOrders();
    
    console.log(`Найдено ${consolidated.length} уникальных продуктов для консолидации:\n`);
    
    // Группируем по категориям
    const byCategory = {};
    consolidated.forEach(item => {
      const category = item.category || 'Без категории';
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(item);
    });
    
    // Выводим по категориям
    Object.entries(byCategory).forEach(([category, items]) => {
      console.log(`\n📂 ${category}:`);
      
      items.forEach(item => {
        console.log(`\n  📦 ${item.product_name}`);
        console.log(`     Количество: ${item.total_quantity} ${item.unit}`);
        console.log(`     Заказов: ${item.orders_count}`);
        if (item.average_price > 0) {
          console.log(`     Средняя цена: ${item.average_price} ₽/${item.unit}`);
        }
      });
    });
    
    // Проверяем количество активных заказов
    const activeOrders = await Order.findAll({
      where: { status: 'sent' },
      include: [
        { model: OrderItem, as: 'orderItems' },
        { model: Restaurant, as: 'restaurant' },
        { model: User, as: 'user' }
      ]
    });
    
    console.log(`\n\n📊 Статистика:`);
    console.log(`- Активных заказов: ${activeOrders.length}`);
    console.log(`- Уникальных продуктов: ${consolidated.length}`);
    
    // Группируем по ресторанам
    const ordersByRestaurant = {};
    activeOrders.forEach(order => {
      const name = order.restaurant.name;
      if (!ordersByRestaurant[name]) {
        ordersByRestaurant[name] = 0;
      }
      ordersByRestaurant[name]++;
    });
    
    console.log(`\n🏢 По ресторанам:`);
    Object.entries(ordersByRestaurant).forEach(([name, count]) => {
      console.log(`- ${name}: ${count} заказов`);
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

testConsolidation();