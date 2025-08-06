const { User } = require('./src/database/models');
const managerHandlers = require('./src/handlers/manager');

async function testManagerConsolidation() {
  try {
    console.log('=== Тестирование консолидации для менеджера ===\n');
    
    // Находим менеджера
    const manager = await User.findOne({ 
      where: { role: 'manager', first_name: 'Михаил' }
    });
    
    if (!manager) {
      console.log('❌ Менеджер не найден');
      return;
    }
    
    console.log(`✅ Менеджер найден: ${manager.first_name} (ID: ${manager.id})\n`);
    
    // Создаем mock контекст
    const mockCtx = {
      user: { id: manager.id, role: 'manager' },
      reply: (message, options) => {
        console.log('=== ОТВЕТ БОТА ===');
        console.log(message);
        if (options && options.reply_markup) {
          console.log(`Кнопок: ${options.reply_markup.inline_keyboard?.length || 0}`);
        }
        console.log('==================\n');
        return Promise.resolve();
      }
    };
    
    // Тестируем consolidatedOrders
    console.log('Тестируем consolidatedOrders...');
    try {
      await managerHandlers.consolidatedOrders(mockCtx);
    } catch (error) {
      console.log('❌ Ошибка в consolidatedOrders:');
      console.log('Message:', error.message);
      console.log('Stack:', error.stack);
    }
    
  } catch (error) {
    console.error('Общая ошибка:', error);
  } finally {
    process.exit(0);
  }
}

testManagerConsolidation();