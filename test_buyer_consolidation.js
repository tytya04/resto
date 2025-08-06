const { User } = require('./src/database/models');
const procurementHandlers = require('./src/handlers/procurement');

async function testBuyerConsolidation() {
  try {
    console.log('=== Тестирование консолидации для закупщика ===\n');
    
    // Находим закупщика
    const buyer = await User.findOne({ 
      where: { role: 'buyer', first_name: 'Поля(_)' }
    });
    
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
      answerCbQuery: (text) => {
        console.log(`Callback query: ${text || 'empty'}`);
        return Promise.resolve();
      }
    };
    
    // 1. Тестируем consolidatedList
    console.log('1. Тестируем consolidatedList...');
    try {
      await procurementHandlers.consolidatedList(mockCtx);
    } catch (error) {
      console.log('❌ Ошибка в consolidatedList:');
      console.log('Message:', error.message);
      console.log('Stack:', error.stack);
    }
    
    // 2. Тестируем activePurchases
    console.log('\n2. Тестируем activePurchases...');
    try {
      await procurementHandlers.activePurchases(mockCtx);
    } catch (error) {
      console.log('❌ Ошибка в activePurchases:');
      console.log('Message:', error.message);
      console.log('Stack:', error.stack);
    }
    
    // 3. Тестируем startPurchaseSession
    console.log('\n3. Тестируем startPurchaseSession...');
    try {
      const mockCtxCallback = {
        ...mockCtx,
        answerCbQuery: (text) => {
          console.log(`Callback query: ${text}`);
          return Promise.resolve();
        }
      };
      
      await procurementHandlers.startPurchaseSession(mockCtxCallback);
    } catch (error) {
      console.log('❌ Ошибка в startPurchaseSession:');
      console.log('Message:', error.message);
      console.log('Stack:', error.stack);
    }
    
  } catch (error) {
    console.error('Общая ошибка:', error);
  } finally {
    process.exit(0);
  }
}

testBuyerConsolidation();