const { Purchase, User } = require('./src/database/models');
const procurementHandlers = require('./src/handlers/procurement');

async function testActivePurchases() {
  try {
    console.log('=== Тест активных закупок ===\n');
    
    // Находим закупщика
    const buyer = await User.findOne({ 
      where: { role: 'buyer', first_name: 'Поля(_)' }
    });
    
    if (!buyer) {
      console.log('❌ Закупщик не найден');
      return;
    }
    
    console.log(`Закупщик: ${buyer.first_name} (ID: ${buyer.id})\n`);
    
    // Проверяем активные закупки в базе
    const activePurchase = await Purchase.findOne({
      where: {
        buyer_id: buyer.id,
        status: ['pending', 'in_progress', 'packing'],
        product_name: 'Закупочная сессия'
      }
    });
    
    console.log('Активная закупка в базе:', activePurchase ? `ID: ${activePurchase.id}, статус: ${activePurchase.status}` : 'НЕТ');
    
    // Создаем mock контекст
    let replyMessage = null;
    
    const mockCtx = {
      user: { id: buyer.id, role: 'buyer' },
      callbackQuery: true,
      answerCbQuery: () => Promise.resolve(),
      reply: (message, options) => {
        replyMessage = message;
        console.log('\n=== ОТВЕТ БОТА ===');
        console.log('Сообщение:', message);
        if (options && options.reply_markup && options.reply_markup.inline_keyboard) {
          console.log('\nКнопки:');
          options.reply_markup.inline_keyboard.forEach((row, i) => {
            row.forEach(button => {
              console.log(`  ${i + 1}. "${button.text}" -> ${button.callback_data}`);
            });
          });
        }
        console.log('==================\n');
        return Promise.resolve();
      }
    };
    
    // Вызываем функцию activePurchases
    console.log('\nВызываем функцию activePurchases...\n');
    await procurementHandlers.activePurchases(mockCtx);
    
    // Анализируем результат
    if (activePurchase) {
      if (replyMessage.includes('нет активной закупки')) {
        console.log('❌ ПРОБЛЕМА: Закупка есть в базе, но функция её не видит!');
        console.log('   buyer_id в базе:', activePurchase.buyer_id);
        console.log('   ctx.user.id:', mockCtx.user.id);
      } else {
        console.log('✅ Закупка найдена и отображена');
      }
    }
    
  } catch (error) {
    console.error('Ошибка в тесте:', error);
  } finally {
    process.exit(0);
  }
}

testActivePurchases();