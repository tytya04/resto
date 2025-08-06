const { Order, OrderItem, Purchase, PurchaseItem, DraftOrder, DraftOrderItem } = require('./src/database/models');

async function deleteAllOrders() {
  try {
    console.log('=== Удаление всех заказов из базы данных ===\n');
    
    // 1. Удаляем позиции заказов
    console.log('1. Удаляем позиции заказов (order_items)...');
    const deletedOrderItems = await OrderItem.destroy({
      where: {},
      truncate: true
    });
    console.log(`✅ Удалено позиций заказов: ${deletedOrderItems}`);
    
    // 2. Удаляем заказы
    console.log('\n2. Удаляем заказы (orders)...');
    const deletedOrders = await Order.destroy({
      where: {},
      truncate: true
    });
    console.log(`✅ Удалено заказов: ${deletedOrders}`);
    
    // 3. Удаляем позиции закупок
    console.log('\n3. Удаляем позиции закупок (purchase_items)...');
    const deletedPurchaseItems = await PurchaseItem.destroy({
      where: {},
      truncate: true
    });
    console.log(`✅ Удалено позиций закупок: ${deletedPurchaseItems}`);
    
    // 4. Удаляем закупки
    console.log('\n4. Удаляем закупки (purchases)...');
    const deletedPurchases = await Purchase.destroy({
      where: {},
      truncate: true
    });
    console.log(`✅ Удалено закупок: ${deletedPurchases}`);
    
    // 5. Удаляем черновики заказов
    console.log('\n5. Удаляем позиции черновиков (draft_order_items)...');
    const deletedDraftItems = await DraftOrderItem.destroy({
      where: {},
      truncate: true
    });
    console.log(`✅ Удалено позиций черновиков: ${deletedDraftItems}`);
    
    console.log('\n6. Удаляем черновики заказов (draft_orders)...');
    const deletedDrafts = await DraftOrder.destroy({
      where: {},
      truncate: true
    });
    console.log(`✅ Удалено черновиков: ${deletedDrafts}`);
    
    console.log('\n=== ВСЕ ЗАКАЗЫ И ЗАКУПКИ УСПЕШНО УДАЛЕНЫ ===');
    
  } catch (error) {
    console.error('❌ Ошибка при удалении:', error);
  } finally {
    process.exit(0);
  }
}

// Запрашиваем подтверждение
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('⚠️  ВНИМАНИЕ! Эта операция удалит ВСЕ заказы, закупки и черновики из базы данных!');
console.log('⚠️  Это действие необратимо!\n');

rl.question('Вы уверены? Введите YES для подтверждения: ', (answer) => {
  if (answer === 'YES') {
    rl.close();
    deleteAllOrders();
  } else {
    console.log('❌ Операция отменена');
    rl.close();
    process.exit(0);
  }
});