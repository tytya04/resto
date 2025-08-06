require('dotenv').config();
const { initDatabase } = require('./src/database/init');
const productMatcher = require('./src/services/ProductMatcher');
const draftOrderService = require('./src/services/DraftOrderService');

async function testParseError() {
  try {
    await initDatabase();
    await productMatcher.initialize();
    
    console.log('=== ТЕСТИРУЕМ "Яблоки 2" ===');
    
    // Создаем тестовый черновик
    const testDraftId = 999999; // фиктивный ID для теста
    
    try {
      const result = await draftOrderService.parseAndAddProducts(testDraftId, "Яблоки 2", 1);
      console.log('Результат:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('ОШИБКА при парсинге:', error);
      console.error('Stack:', error.stack);
    }
    
  } catch (error) {
    console.error('Ошибка инициализации:', error);
  }
  
  process.exit(0);
}

testParseError();