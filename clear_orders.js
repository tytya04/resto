const { Order, OrderItem, PurchaseItem, DraftOrder, DraftOrderItem } = require('./src/database/models');

async function clearOrders() {
  try {
    console.log('Начинаем очистку заказов и связанных данных...\n');
    
    // Удаляем позиции закупок
    const purchaseItemsDeleted = await PurchaseItem.destroy({ where: {} });
    console.log(`✓ Удалено позиций закупок: ${purchaseItemsDeleted}`);
    
    // Удаляем позиции заказов
    const orderItemsDeleted = await OrderItem.destroy({ where: {} });
    console.log(`✓ Удалено позиций заказов: ${orderItemsDeleted}`);
    
    // Удаляем заказы
    const ordersDeleted = await Order.destroy({ where: {} });
    console.log(`✓ Удалено заказов: ${ordersDeleted}`);
    
    // Удаляем позиции черновиков
    const draftItemsDeleted = await DraftOrderItem.destroy({ where: {} });
    console.log(`✓ Удалено позиций черновиков: ${draftItemsDeleted}`);
    
    // Удаляем черновики
    const draftsDeleted = await DraftOrder.destroy({ where: {} });
    console.log(`✓ Удалено черновиков: ${draftsDeleted}`);
    
    console.log('\n✅ Все заказы и связанные данные успешно удалены!');
    
  } catch (error) {
    console.error('❌ Ошибка при очистке заказов:', error);
  } finally {
    process.exit(0);
  }
}

clearOrders();