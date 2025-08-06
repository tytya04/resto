const { Order, OrderItem } = require('./src/database/models');

async function checkDatesOrder() {
  try {
    const items = await OrderItem.findAll({
      where: {
        product_name: 'Финик Алжирский 0,5 кг'
      },
      include: [{
        model: Order,
        as: 'order',
        attributes: ['id', 'order_number', 'created_at']
      }]
    });
    
    console.log('Позиции "Финик Алжирский 0,5 кг":');
    items.forEach(item => {
      console.log(`- Заказ #${item.order.order_number}: ${item.quantity} ${item.unit} (ID: ${item.order.id})`);
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

checkDatesOrder();