// Функция для заполнения БД тестовыми данными

const { 
  User, 
  Restaurant, 
  Order, 
  OrderItem, 
  NomenclatureCache,
  Settings 
} = require('../../src/database/models');

const {
  testRestaurants,
  testUsers,
  testProducts,
  testOrders
} = require('./testData');

async function seedTestData() {
  try {
    // Создаем рестораны
    await Restaurant.bulkCreate(testRestaurants);
    
    // Создаем пользователей
    await User.bulkCreate(testUsers);
    
    // Заполняем кэш номенклатуры
    await NomenclatureCache.bulkCreate(testProducts);
    
    // Создаем настройки по умолчанию
    await Settings.bulkCreate([
      { key: 'auto_send_time', value: '10:00', restaurant_id: 1, value_type: 'time' },
      { key: 'auto_send_enabled', value: 'true', restaurant_id: 1, value_type: 'boolean' },
      { key: 'auto_send_time', value: '11:00', restaurant_id: 2, value_type: 'time' },
      { key: 'auto_send_enabled', value: 'false', restaurant_id: 2, value_type: 'boolean' },
      { key: 'smtp_host', value: 'smtp.gmail.com', value_type: 'string' },
      { key: 'smtp_port', value: '587', value_type: 'number' },
      { key: 'smtp_user', value: 'test@gmail.com', value_type: 'string' },
      { key: 'accountant_email', value: 'accountant@test.com', value_type: 'string' },
      { key: 'manager_emails', value: 'manager1@test.com,manager2@test.com', value_type: 'string' }
    ]);
    
    // Создаем тестовые заказы
    for (const orderData of testOrders) {
      const { items, ...orderFields } = orderData;
      const order = await Order.create(orderFields);
      
      if (items && items.length > 0) {
        const itemsWithOrderId = items.map(item => ({
          ...item,
          order_id: order.id
        }));
        await OrderItem.bulkCreate(itemsWithOrderId);
      }
    }
    
    console.log('Test data seeded successfully');
  } catch (error) {
    console.error('Error seeding test data:', error);
    throw error;
  }
}

async function clearTestData() {
  try {
    // Очищаем все таблицы в правильном порядке
    await OrderItem.destroy({ where: {} });
    await Order.destroy({ where: {} });
    await User.destroy({ where: {} });
    await Restaurant.destroy({ where: {} });
    await NomenclatureCache.destroy({ where: {} });
    await Settings.destroy({ where: {} });
    
    console.log('Test data cleared successfully');
  } catch (error) {
    console.error('Error clearing test data:', error);
    throw error;
  }
}

module.exports = {
  seedTestData,
  clearTestData
};