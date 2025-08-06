const { Order, User } = require('./src/database/models');
const processOrderScene = require('./src/scenes/processOrderScene');

async function testManagerProcessOrder() {
  try {
    console.log('=== Тест обработки заказа менеджером ===\n');
    
    // Находим менеджера
    const manager = await User.findOne({ 
      where: { role: 'manager' }
    });
    
    if (!manager) {
      console.log('❌ Менеджер не найден');
      return;
    }
    
    console.log(`Менеджер: ${manager.first_name} (ID: ${manager.id})\n`);
    
    // Находим заказ в статусе purchased
    const order = await Order.findOne({
      where: { status: 'purchased' },
      include: [
        { model: require('./src/database/models/OrderItem'), as: 'orderItems' },
        { model: require('./src/database/models/Restaurant'), as: 'restaurant' },
        { model: require('./src/database/models/User'), as: 'user' }
      ]
    });
    
    if (!order) {
      console.log('❌ Нет заказов в статусе purchased');
      return;
    }
    
    console.log(`Заказ: #${order.order_number} (ID: ${order.id})`);
    console.log(`Статус: ${order.status}`);
    console.log(`Позиций: ${order.orderItems.length}\n`);
    
    // Создаем mock контекст
    let replyMessage = null;
    let sceneLeft = false;
    
    const mockCtx = {
      user: { id: manager.id, role: 'manager' },
      scene: {
        state: { orderId: order.id },
        session: {},
        leave: () => {
          sceneLeft = true;
          console.log('Сцена завершена');
          return Promise.resolve();
        }
      },
      reply: (message) => {
        replyMessage = message;
        console.log('Ответ бота:', message);
        return Promise.resolve();
      }
    };
    
    // Создаем экземпляр сцены и вызываем enter
    const scene = processOrderScene;
    
    // Симулируем вход в сцену
    console.log('Симулируем вход в сцену обработки...\n');
    await scene.enter(mockCtx);
    
    // Анализируем результат
    console.log('\n=== РЕЗУЛЬТАТ ===');
    if (sceneLeft) {
      console.log('❌ Сцена завершилась преждевременно');
      console.log('Последнее сообщение:', replyMessage);
    } else {
      console.log('✅ Менеджер может обработать заказ');
      console.log('Заказ загружен в сцену');
    }
    
  } catch (error) {
    console.error('Ошибка в тесте:', error);
  } finally {
    process.exit(0);
  }
}

testManagerProcessOrder();