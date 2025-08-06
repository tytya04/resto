const { Order, OrderItem, DraftOrder, DraftOrderItem } = require('./src/database/models');

async function cleanOrders() {
  try {
    console.log('Удаление всех заказов и черновиков...');
    
    // Удаляем позиции заказов
    const deletedOrderItems = await OrderItem.destroy({ where: {} });
    console.log(`Удалено позиций заказов: ${deletedOrderItems}`);
    
    // Удаляем заказы
    const deletedOrders = await Order.destroy({ where: {} });
    console.log(`Удалено заказов: ${deletedOrders}`);
    
    // Удаляем позиции черновиков
    const deletedDraftItems = await DraftOrderItem.destroy({ where: {} });
    console.log(`Удалено позиций черновиков: ${deletedDraftItems}`);
    
    // Удаляем черновики
    const deletedDrafts = await DraftOrder.destroy({ where: {} });
    console.log(`Удалено черновиков: ${deletedDrafts}`);
    
    console.log('\nВсе заказы и черновики успешно удалены!');
    
  } catch (error) {
    console.error('Ошибка при удалении:', error);
  } finally {
    process.exit(0);
  }
}

cleanOrders();