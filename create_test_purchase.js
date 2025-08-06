const { Purchase, PurchaseItem, User } = require('./src/database/models');
const OrderService = require('./src/services/OrderService');

async function createTestPurchase() {
  try {
    // Находим закупщика
    const buyer = await User.findOne({ where: { role: 'buyer' } });
    if (!buyer) {
      console.log('❌ Закупщик не найден');
      return;
    }
    
    console.log(`Закупщик: ${buyer.first_name} (ID: ${buyer.id})`);
    
    // Получаем консолидированные заказы
    const consolidated = await OrderService.getConsolidatedOrders();
    
    if (consolidated.length === 0) {
      console.log('❌ Нет заказов для закупки');
      return;
    }
    
    console.log(`Найдено ${consolidated.length} консолидированных товаров`);
    
    // Создаем закупочную сессию
    const purchase = await Purchase.create({
      consolidated_product_id: `session_${Date.now()}`,
      product_name: 'Закупочная сессия',
      unit: 'шт',
      total_quantity: consolidated.length,
      purchased_quantity: 0,
      buyer_id: buyer.id,
      purchase_date: new Date(),
      status: 'in_progress', // Сразу делаем в процессе
      total_items: consolidated.length,
      completed_items: 0,
      orders_data: consolidated.map(item => ({
        consolidated_product_id: item.consolidated_product_id,
        product_name: item.product_name,
        quantity: item.total_quantity,
        unit: item.unit
      }))
    });
    
    console.log(`✅ Создана закупочная сессия ID: ${purchase.id}`);
    
    // Создаем элементы закупки
    for (const item of consolidated) {
      const purchaseItem = await PurchaseItem.create({
        purchase_id: purchase.id,
        product_name: item.product_name,
        unit: item.unit,
        quantity: item.total_quantity,
        required_quantity: item.total_quantity,
        purchased_quantity: 0,
        purchase_price: 0,
        status: 'pending',
        consolidated_product_id: item.consolidated_product_id
      });
      console.log(`  - Добавлен товар: ${item.product_name} (${item.total_quantity} ${item.unit})`);
    }
    
    console.log('\n✅ Тестовая закупочная сессия создана успешно!');
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

createTestPurchase();