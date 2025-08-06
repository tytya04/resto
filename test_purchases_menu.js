const { User } = require('./src/database/models');
const procurementHandlers = require('./src/handlers/procurement');

async function testPurchasesMenu() {
  try {
    console.log('=== Тест меню закупок ===\n');
    
    // Находим закупщика
    const buyer = await User.findOne({ 
      where: { role: 'buyer', first_name: 'Поля(_)' }
    });
    
    if (!buyer) {
      console.log('❌ Закупщик не найден');
      return;
    }
    
    console.log(`Закупщик: ${buyer.first_name} (ID: ${buyer.id})\n`);
    
    // Создаем mock контекст
    let replyMessage = null;
    let replyOptions = null;
    
    const mockCtx = {
      user: { id: buyer.id, role: 'buyer' },
      callbackQuery: true, // Симулируем callback query
      answerCbQuery: () => Promise.resolve(),
      reply: (message, options) => {
        replyMessage = message;
        replyOptions = options;
        console.log('=== ОТВЕТ БОТА ===');
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
    
    // Вызываем функцию purchases
    console.log('Вызываем функцию purchases...\n');
    await procurementHandlers.purchases(mockCtx);
    
    // Проверяем результат
    if (replyOptions && replyOptions.reply_markup && replyOptions.reply_markup.inline_keyboard) {
      const buttons = replyOptions.reply_markup.inline_keyboard;
      const activeButton = buttons[0][0];
      const completedButton = buttons[1][0];
      
      console.log('\n=== АНАЛИЗ КНОПОК ===');
      console.log('Кнопка активных закупок:', activeButton.text);
      console.log('Есть ли счетчик в активных:', activeButton.text.includes('(') ? 'ДА' : 'НЕТ');
      
      console.log('Кнопка завершенных закупок:', completedButton.text);
      console.log('Есть ли счетчик в завершенных:', completedButton.text.includes('(') ? 'ДА' : 'НЕТ');
    }
    
  } catch (error) {
    console.error('Ошибка в тесте:', error);
  } finally {
    process.exit(0);
  }
}

testPurchasesMenu();