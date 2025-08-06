const { Order, User, NomenclatureCache } = require('./src/database/models');
const OrderService = require('./src/services/OrderService');

async function testOrderProcessing() {
  try {
    console.log('=== Тест обработки заказа с ценами ===\n');
    
    // Находим менеджера
    const manager = await User.findOne({ where: { role: 'manager' } });
    console.log(`Менеджер: ${manager.first_name} (ID: ${manager.id})\n`);
    
    // Находим заказ
    const order = await OrderService.getOrderById(1);
    console.log(`Заказ: #${order.order_number} (статус: ${order.status})\n`);
    
    console.log('Позиции заказа:');
    for (const item of order.orderItems) {
      const nomenclature = await NomenclatureCache.findOne({
        where: { product_name: item.product_name }
      });
      
      console.log(`\n${item.product_name}:`);
      console.log(`  Количество: ${item.quantity} ${item.unit}`);
      console.log(`  Текущая цена: ${item.price || 'не указана'}`);
      console.log(`  Цена из номенклатуры: ${nomenclature?.last_sale_price || 'не указана'}`);
      console.log(`  Техническая пометка: ${nomenclature?.technical_note || 'нет'}`);
      
      // Проверяем, какие кнопки должны отображаться
      const suggestedPrice = nomenclature?.last_sale_price;
      const currentPrice = item.price || suggestedPrice;
      
      console.log('\n  Кнопки:');
      console.log('    - [💰 Изменить цену]');
      if (suggestedPrice && currentPrice !== suggestedPrice) {
        console.log(`    - [✅ Применить ${suggestedPrice} ₽]`);
      }
      console.log('    - [⬅️ Назад] [➡️ Далее]');
      console.log('    - [📋 К итогу]');
    }
    
    console.log('\n=====================================\n');
    console.log('Теперь менеджер должен видеть:');
    console.log('1. Кнопку "💰 Изменить цену" - для ручного ввода');
    console.log('2. Кнопку "✅ Применить XXX ₽" - если есть цена в номенклатуре');
    console.log('3. Навигационные кнопки для перехода между позициями');
    
  } catch (error) {
    console.error('Ошибка в тесте:', error);
  } finally {
    process.exit(0);
  }
}

testOrderProcessing();