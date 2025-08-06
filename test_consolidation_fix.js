const { Order, OrderItem, Restaurant } = require('./src/database/models');
const OrderService = require('./src/services/OrderService');

async function testConsolidationFix() {
  try {
    console.log('=== Тестирование исправления консолидации ===\n');
    
    // Получаем все заказы для анализа
    const orders = await Order.findAll({
      where: { status: 'sent' },
      include: [
        { model: OrderItem, as: 'orderItems' },
        { model: Restaurant, as: 'restaurant' }
      ]
    });
    
    console.log(`Найдено ${orders.length} заказов для анализа\n`);
    
    // Анализируем по продуктам
    const productAnalysis = {};
    
    orders.forEach(order => {
      console.log(`Заказ #${order.order_number} от ${order.restaurant.name}:`);
      order.orderItems.forEach(item => {
        const key = `${item.product_name}_${item.unit}`;
        console.log(`  - ${item.product_name}: ${item.quantity} ${item.unit}`);
        
        if (!productAnalysis[key]) {
          productAnalysis[key] = {
            product_name: item.product_name,
            unit: item.unit,
            orders: new Set(),
            total_quantity: 0,
            positions_count: 0
          };
        }
        
        productAnalysis[key].orders.add(order.id);
        productAnalysis[key].total_quantity += parseFloat(item.quantity);
        productAnalysis[key].positions_count++;
      });
      console.log('');
    });
    
    console.log('\n=== Анализ консолидации ===\n');
    
    Object.values(productAnalysis).forEach(item => {
      console.log(`📦 ${item.product_name}:`);
      console.log(`   Общее количество: ${item.total_quantity} ${item.unit}`);
      console.log(`   Из заказов: ${item.orders.size} (уникальных)`);
      console.log(`   Позиций: ${item.positions_count}`);
      console.log('');
    });
    
    // Тестируем исправленный метод
    console.log('=== Результат getConsolidatedOrders ===\n');
    const consolidated = await OrderService.getConsolidatedOrders();
    
    consolidated.forEach(item => {
      console.log(`📦 ${item.product_name}: ${item.total_quantity} ${item.unit} (из ${item.orders_count} заказов)`);
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

testConsolidationFix();