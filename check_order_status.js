const { Order, OrderItem } = require('./src/database/models');

async function checkOrderStatus() {
  try {
    // Получаем все заказы и их статусы
    const orders = await Order.findAll({
      attributes: ['id', 'order_number', 'status', 'created_at'],
      include: [{
        model: OrderItem,
        as: 'orderItems',
        attributes: ['product_name', 'quantity', 'unit']
      }],
      order: [['created_at', 'DESC']],
      limit: 10
    });
    
    console.log('Последние 10 заказов:\n');
    
    orders.forEach(order => {
      console.log(`Заказ #${order.order_number}:`);
      console.log(`  ID: ${order.id}`);
      console.log(`  Статус: ${order.status}`);
      console.log(`  Создан: ${order.created_at}`);
      console.log(`  Позиций: ${order.orderItems.length}`);
      console.log('');
    });
    
    // Подсчитываем заказы по статусам
    const statusCounts = await Order.findAll({
      attributes: [
        'status',
        [Order.sequelize.fn('COUNT', 'id'), 'count']
      ],
      group: ['status']
    });
    
    console.log('\nСтатистика по статусам:');
    statusCounts.forEach(row => {
      console.log(`- ${row.status}: ${row.get('count')} заказов`);
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

checkOrderStatus();