require('dotenv').config();
const { initDatabase } = require('./src/database/init');
const productMatcher = require('./src/services/ProductMatcher');
const draftOrderService = require('./src/services/DraftOrderService');

async function testOnion() {
  console.log('🧅 Тестируем обработку "Лук 2"...\n');
  
  try {
    await initDatabase();
    await productMatcher.initialize();
    
    console.log('📝 Тестируем parseAndAddProducts(1, "Лук 2", 1):');
    
    const result = await draftOrderService.parseAndAddProducts(1, "Лук 2", 1);
    
    console.log('\n📋 Результат:', JSON.stringify(result, null, 2));
    
    // Анализируем результат
    if (result.matched && result.matched.length > 0) {
      console.log('\n❌ ПРОБЛЕМА: Продукт был автоматически выбран!');
      console.log('   Выбран:', result.matched[0].product_name);
    } else if (result.unmatched && result.unmatched.length > 0) {
      console.log('\n✅ ХОРОШО: Продукт в unmatched с вариантами!');
      const unmatched = result.unmatched[0];
      if (unmatched.suggestions && unmatched.suggestions.length > 0) {
        console.log(`   Найдено ${unmatched.suggestions.length} вариантов:`);
        unmatched.suggestions.forEach((s, i) => {
          console.log(`     ${i + 1}. ${s.product_name} (${s.unit})`);
        });
      }
    }
    
    // Тестируем картофель
    console.log('\n\n🥔 Тестируем обработку "Картофель 5"...');
    const result2 = await draftOrderService.parseAndAddProducts(2, "Картофель 5", 1);
    
    if (result2.matched && result2.matched.length > 0) {
      console.log('\n❌ ПРОБЛЕМА: Картофель был автоматически выбран!');
      console.log('   Выбран:', result2.matched[0].product_name);
    } else if (result2.unmatched && result2.unmatched.length > 0) {
      console.log('\n✅ ХОРОШО: Картофель в unmatched с вариантами!');
      const unmatched = result2.unmatched[0];
      if (unmatched.suggestions && unmatched.suggestions.length > 0) {
        console.log(`   Найдено ${unmatched.suggestions.length} вариантов:`);
        unmatched.suggestions.forEach((s, i) => {
          console.log(`     ${i + 1}. ${s.product_name} (${s.unit})`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
  
  process.exit(0);
}

testOnion();