const { Order, OrderItem, User } = require('./src/database/models');
const OrderService = require('./src/services/OrderService');

async function debugBuyerErrors() {
  try {
    console.log('=== Диагностика ошибок закупщика ===\n');
    
    // 1. Проверяем пользователя
    const buyer = await User.findOne({ where: { role: 'buyer', first_name: 'Поля(_)' } });
    if (buyer) {
      console.log(`✅ Закупщик найден: ${buyer.first_name} (ID: ${buyer.id})`);
    } else {
      console.log('❌ Закупщик не найден');
      return;
    }
    
    // 2. Проверяем заказы в разных статусах
    console.log('\n=== Заказы по статусам ===');
    const statusCounts = await Order.findAll({
      attributes: [
        'status',
        [Order.sequelize.fn('COUNT', 'id'), 'count']
      ],
      group: ['status']
    });
    
    statusCounts.forEach(row => {
      console.log(`- ${row.status}: ${row.get('count')} заказов`);
    });
    
    // 3. Проверяем последние заказы
    console.log('\n=== Последние 5 заказов ===');
    const recentOrders = await Order.findAll({
      limit: 5,
      order: [['created_at', 'DESC']],
      include: [
        { model: OrderItem, as: 'orderItems' }
      ]
    });
    
    recentOrders.forEach(order => {
      console.log(`Заказ #${order.order_number} - статус: ${order.status}, позиций: ${order.orderItems.length}`);
    });
    
    // 4. Тестируем getConsolidatedOrders напрямую
    console.log('\n=== Тест getConsolidatedOrders ===');
    try {
      const consolidated = await OrderService.getConsolidatedOrders();
      console.log(`✅ Получено ${consolidated.length} консолидированных товаров`);
      
      if (consolidated.length > 0) {
        consolidated.forEach((item, index) => {
          console.log(`${index + 1}. ${item.product_name}: ${item.total_quantity} ${item.unit}`);
        });
      }
    } catch (error) {
      console.log('❌ Ошибка в getConsolidatedOrders:', error.message);
      console.log('Stack trace:', error.stack);
    }
    
    // 5. Проверяем метод consolidatedList напрямую
    console.log('\n=== Тест consolidatedList функции ===');
    try {
      const procurementHandlers = require('./src/handlers/procurement');
      
      // Создаем mock контекст
      const mockCtx = {
        user: { id: buyer.id, role: 'buyer' },
        reply: (message, options) => {
          console.log('Reply:', message.substring(0, 100) + (message.length > 100 ? '...' : ''));
          if (options && options.reply_markup) {
            console.log('Keyboard buttons:', options.reply_markup.inline_keyboard?.length || 0);
          }
          return Promise.resolve();
        },
        answerCbQuery: () => Promise.resolve()
      };
      
      await procurementHandlers.consolidatedList(mockCtx);
      
    } catch (error) {
      console.log('❌ Ошибка в consolidatedList:', error.message);
      console.log('Stack trace:', error.stack);
    }
    
  } catch (error) {
    console.error('Общая ошибка:', error);
  } finally {
    process.exit(0);
  }
}

debugBuyerErrors();