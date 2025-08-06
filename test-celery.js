require('dotenv').config();
const { initDatabase } = require('./src/database/init');
const productMatcher = require('./src/services/ProductMatcher');
const draftOrderService = require('./src/services/DraftOrderService');

async function testCelery() {
  console.log('🥬 Тестируем обработку "Сельдерей 1"...\n');
  
  try {
    await initDatabase();
    await productMatcher.initialize();
    
    console.log('📝 Тестируем parseAndAddProducts(1, "Сельдерей 1", 1):');
    
    const result = await draftOrderService.parseAndAddProducts(1, "Сельдерей 1", 1);
    
    console.log('\n📋 Результат:', JSON.stringify(result, null, 2));
    
    // Анализируем результат
    if (result.unmatched && result.unmatched.length > 0) {
      console.log('\n🎯 Продукт в unmatched с предложениями:');
      const unmatched = result.unmatched[0];
      if (unmatched.suggestions && unmatched.suggestions.length > 0) {
        console.log(`   Найдено ${unmatched.suggestions.length} предложений:`);
        unmatched.suggestions.forEach((s, i) => {
          console.log(`     ${i + 1}. ${s.product_name} (${s.unit}) - score: ${s.score}`);
        });
      } else {
        console.log('   ❌ Нет предложений');
      }
    } else if (result.needsUnitClarification && result.needsUnitClarification.length > 0) {
      console.log('\n⚠️  Продукт в needsUnitClarification');
    } else if (result.matched && result.matched.length > 0) {
      console.log('\n✅ Продукт был распознан');
    } else {
      console.log('\n❓ Неожиданный результат');
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
  
  process.exit(0);
}

testCelery();