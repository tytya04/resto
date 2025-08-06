require('dotenv').config();
const { initDatabase } = require('./src/database/init');
const productMatcher = require('./src/services/ProductMatcher');
const draftOrderService = require('./src/services/DraftOrderService');

async function testSliva() {
  console.log('🍑 Тестируем обработку "Слива 2"...\n');
  
  try {
    await initDatabase();
    await productMatcher.initialize();
    
    console.log('📝 Тестируем parseAndAddProducts(11, "Слива 2", 1):');
    
    const result = await draftOrderService.parseAndAddProducts(11, "Слива 2", 1);
    
    console.log('\n📋 Результат:', JSON.stringify(result, null, 2));
    
    // Проверяем unmatched
    if (result.unmatched && result.unmatched.length > 0) {
      console.log('\n🔍 Детали unmatched:');
      result.unmatched.forEach((item, idx) => {
        console.log(`\n${idx + 1}. Item:`, item.item);
        console.log('   Line:', item.line);
        console.log('   Parsed:', item.parsed);
        console.log('   Suggestions:');
        if (item.suggestions) {
          item.suggestions.forEach((s, i) => {
            console.log(`     ${i + 1}. ${s.product_name} (${s.unit}) - id: ${s.id}`);
          });
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
  
  process.exit(0);
}

testSliva();