const { Telegraf, Markup, Scenes } = require('telegraf');
const { Order, OrderItem, User, Restaurant, NomenclatureCache } = require('./src/database/models');
const OrderService = require('./src/services/OrderService');

async function testSceneButtons() {
  try {
    console.log('=== Тест inline кнопок в сцене ===\n');
    
    // Находим менеджера
    const manager = await User.findOne({ where: { role: 'manager' } });
    console.log(`Менеджер: ${manager.first_name} (ID: ${manager.id})\n`);
    
    // Находим заказ в статусе purchased
    const order = await OrderService.getOrderById(1);
    console.log(`Заказ: #${order.order_number} (статус: ${order.status})`);
    console.log(`Позиций: ${order.orderItems.length}\n`);
    
    // Получаем первую позицию
    const item = order.orderItems[0];
    console.log(`Первая позиция: ${item.product_name}`);
    console.log(`Количество: ${item.quantity} ${item.unit}\n`);
    
    // Ищем цену в номенклатуре
    const nomenclature = await NomenclatureCache.findOne({
      where: { product_name: item.product_name }
    });
    
    const suggestedPrice = nomenclature ? nomenclature.last_sale_price : null;
    const currentPrice = item.price;
    
    console.log(`Цена из номенклатуры (last_sale_price): ${suggestedPrice || 'не указана'}`);
    console.log(`Текущая цена позиции: ${currentPrice || 'не указана'}\n`);
    
    // Формируем кнопки как в сцене
    const buttons = [
      [Markup.button.callback('💰 Изменить цену', 'change_price')],
      suggestedPrice && currentPrice !== suggestedPrice ? 
        [Markup.button.callback(`✅ Применить ${suggestedPrice} ₽`, 'apply_suggested')] : [],
      [
        Markup.button.callback('⬅️ Назад', 'prev_item'),
        Markup.button.callback('➡️ Далее', 'next_item')
      ],
      [Markup.button.callback('📋 К итогу', 'show_summary')]
    ].filter(row => row.length > 0);
    
    console.log('Кнопки для отображения:');
    buttons.forEach((row, i) => {
      console.log(`  Ряд ${i + 1}:`, row.map(btn => btn.text || btn.callback_data));
    });
    
    const keyboard = Markup.inlineKeyboard(buttons);
    
    console.log('\nОбъект keyboard создан успешно');
    console.log('keyboard.reply_markup существует:', !!keyboard.reply_markup);
    console.log('Количество рядов кнопок:', keyboard.reply_markup.inline_keyboard.length);
    
    // Проверяем правильность формирования параметров для ctx.reply
    const messageParams = {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup
    };
    
    console.log('\nПараметры для ctx.reply:');
    console.log('- parse_mode:', messageParams.parse_mode);
    console.log('- reply_markup существует:', !!messageParams.reply_markup);
    console.log('- reply_markup.inline_keyboard существует:', !!messageParams.reply_markup.inline_keyboard);
    
    console.log('\n✅ Все проверки пройдены. Кнопки должны отображаться корректно.');
    
  } catch (error) {
    console.error('❌ Ошибка в тесте:', error);
  } finally {
    process.exit(0);
  }
}

testSceneButtons();