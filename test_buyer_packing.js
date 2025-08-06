const { User } = require('./src/database/models');
const procurementHandlers = require('./src/handlers/procurement');

async function testBuyerPacking() {
  try {
    console.log('=== Тест интерфейса сборки для закупщика ===\n');
    
    // Находим закупщика
    const buyer = await User.findOne({ where: { role: 'buyer' } });
    if (!buyer) {
      console.log('❌ Закупщик не найден');
      return;
    }
    
    console.log(`✅ Закупщик найден: ${buyer.first_name} (ID: ${buyer.id})\n`);
    
    // Создаем mock контекст
    const mockCtx = {
      user: { id: buyer.id, role: 'buyer' },
      reply: (message, options) => {
        console.log('=== ОТВЕТ БОТА ===');
        console.log(message);
        if (options && options.reply_markup) {
          console.log(`Кнопок: ${options.reply_markup.inline_keyboard?.length || 0}`);
        }
        console.log('==================\n');
        return Promise.resolve();
      },
      answerCbQuery: (text) => Promise.resolve()
    };
    
    // Тестируем activePurchases (должно показать сборку если есть закупка в статусе packing)
    console.log('Тестируем activePurchases (показ сборки)...');
    try {
      await procurementHandlers.activePurchases(mockCtx);
    } catch (error) {
      console.log('❌ Ошибка в activePurchases:');
      console.log('Message:', error.message);
    }
    
  } catch (error) {
    console.error('Общая ошибка:', error);
  } finally {
    process.exit(0);
  }
}

testBuyerPacking();