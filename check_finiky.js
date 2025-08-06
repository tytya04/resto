const { OrderItem, Order } = require('./src/database/models');

async function checkFiniky() {
  try {
    console.log('=== Проверяем финики ===\n');
    
    const finikItems = await OrderItem.findAll({
      where: {
        product_name: {
          [require('sequelize').Op.like]: 'Финик%кг%'
        }
      },
      include: [{
        model: Order,
        as: 'order',
        attributes: ['id', 'order_number']
      }]
    });
    
    console.log('Найденные финики:');
    finikItems.forEach(item => {
      console.log(`- ${item.product_name}: ${item.quantity} ${item.unit} (Заказ #${item.order.order_number})`);
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

checkFiniky();