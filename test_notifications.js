const orderSchedulerService = require('./src/services/OrderSchedulerService');

async function testNotifications() {
  try {
    console.log('Запуск тестовой отправки заказов для ресторана 1...');
    await orderSchedulerService.processRestaurantOrders(1);
    console.log('Тестовая отправка завершена');
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

testNotifications();