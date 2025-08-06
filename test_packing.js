const { Order, Purchase, User } = require('./src/database/models');
const procurementHandlers = require('./src/handlers/procurement');

async function testPackingInterface() {
  try {
    console.log('=== Тест интерфейса сборки ===\n');
    
    // Находим закупщика
    const buyer = await User.findOne({ 
      where: { role: 'buyer', first_name: 'Поля(_)' }
    });
    
    console.log(`Закупщик: ${buyer.first_name} (ID: ${buyer.id})\n`);
    
    // Находим закупку в статусе packing
    const purchase = await Purchase.findOne({
      where: {
        buyer_id: buyer.id,
        status: 'packing',
        product_name: 'Закупочная сессия'
      }
    });
    
    console.log('Закупка:', purchase ? `ID: ${purchase.id}, статус: ${purchase.status}` : 'НЕ НАЙДЕНА');
    
    // Получаем заказы
    const orders = await Order.findAll({
      where: { status: 'purchased' },
      include: [
        { model: require('./src/database/models/OrderItem'), as: 'orderItems' },
        { model: require('./src/database/models/Restaurant'), as: 'restaurant' }
      ]
    });
    
    console.log(`\nЗаказы (${orders.length}):`);
    orders.forEach(order => {
      console.log(`  - #${order.order_number}: статус=${order.status}, packing_status=${order.packing_status || 'null'}`);
    });
    
    // Создаем mock контекст
    let replyMessage = null;
    let replyOptions = null;
    
    const mockCtx = {
      user: { id: buyer.id, role: 'buyer' },
      reply: (message, options) => {
        replyMessage = message;
        replyOptions = options;
        console.log('\n=== ИНТЕРФЕЙС СБОРКИ ===');
        console.log(message);
        if (options && options.reply_markup && options.reply_markup.inline_keyboard) {
          console.log('\nКнопки:');
          options.reply_markup.inline_keyboard.forEach((row, i) => {
            row.forEach(button => {
              console.log(`  ${i + 1}. "${button.text}" -> ${button.callback_data}`);
            });
          });
        }
        console.log('========================\n');
        return Promise.resolve();
      }
    };
    
    // Вызываем функцию showPackingInterface
    if (purchase && orders.length > 0) {
      await procurementHandlers.showPackingInterface(mockCtx, purchase, orders);
      
      // Анализируем кнопки
      if (replyOptions && replyOptions.reply_markup) {
        const buttons = replyOptions.reply_markup.inline_keyboard;
        const packButtons = buttons.filter(row => 
          row.some(btn => btn.callback_data && btn.callback_data.startsWith('start_packing:'))
        );
        
        console.log('\n=== АНАЛИЗ ===');
        console.log('Кнопок для сборки:', packButtons.length);
        console.log('Несобранных заказов:', orders.filter(o => o.packing_status !== 'ready').length);
        
        if (packButtons.length !== orders.filter(o => o.packing_status !== 'ready').length) {
          console.log('❌ ПРОБЛЕМА: Количество кнопок не соответствует количеству несобранных заказов!');
        } else {
          console.log('✅ Кнопки отображаются правильно');
        }
      }
    }
    
  } catch (error) {
    console.error('Ошибка в тесте:', error);
  } finally {
    process.exit(0);
  }
}

testPackingInterface();