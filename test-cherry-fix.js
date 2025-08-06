require('dotenv').config();
const { initDatabase } = require('./src/database/init');
const productMatcher = require('./src/services/ProductMatcher');
const draftOrderService = require('./src/services/DraftOrderService');

async function testCherryFix() {
  console.log('🍒 Тестируем исправления для "Черри"...\n');
  
  try {
    // Инициализируем базу данных
    await initDatabase();
    console.log('✅ База данных инициализирована');
    
    // Инициализируем ProductMatcher
    await productMatcher.initialize();
    console.log('✅ ProductMatcher инициализирован');
    
    // Тестируем парсинг "Черри 2"
    console.log('\n🔍 Тестируем parseAndAddProducts(draftOrderId: 1, text: "Черри 2", userId: 1):');
    
    const result = await draftOrderService.parseAndAddProducts(1, "Черри 2", 1);
    
    console.log('\n📋 Результат:', JSON.stringify(result, null, 2));
    
    // Проверяем что получили
    if (result.unmatched && result.unmatched.length > 0) {
      console.log('\n🎯 Найдены нераспознанные продукты с вариантами!');
      const unmatched = result.unmatched[0];
      console.log(`   Продукт: ${unmatched.name}`);
      console.log(`   Количество: ${unmatched.quantity}`);
      console.log(`   Единица: ${unmatched.unit}`);
      
      if (unmatched.suggestions && unmatched.suggestions.length > 0) {
        console.log(`   Предлагаемые варианты (${unmatched.suggestions.length}):`);
        unmatched.suggestions.forEach((suggestion, index) => {
          console.log(`     ${index + 1}. ${suggestion.product_name} (${suggestion.unit})`);
        });
      }
    } else if (result.matched && result.matched.length > 0) {
      console.log('\n⚠️  Продукт был распознан как точное совпадение (старая логика)');
      console.log('   Matched:', result.matched[0]);
    }
    
    console.log('\n✅ Тест завершен успешно!');
    
  } catch (error) {
    console.error('❌ Ошибка тестирования:', error);
  }
  
  process.exit(0);
}

testCherryFix();