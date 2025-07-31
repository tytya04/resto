const productMatcher = require('./src/services/ProductMatcher');
const { sequelize } = require('./src/database/models');

async function testFindExactMatch() {
  try {
    // Инициализируем ProductMatcher
    await productMatcher.initialize();
    
    console.log('Тестируем поиск "Черри"...\n');
    
    // Тестируем findExactMatch
    const result = await productMatcher.findExactMatch('Черри');
    
    if (result) {
      console.log('✅ Продукт найден через findExactMatch:');
      console.log(`   Название: ${result.product_name}`);
      console.log(`   ID: ${result.id}`);
      console.log(`   Категория: ${result.category}`);
      console.log(`   Единица: ${result.unit}`);
    } else {
      console.log('❌ Продукт НЕ найден через findExactMatch');
    }
    
    // Тестируем suggestProducts
    console.log('\nТестируем поиск предложений для "Черри"...');
    const suggestions = await productMatcher.suggestProducts('Черри', 5);
    
    if (suggestions.length > 0) {
      console.log(`\n✅ Найдено ${suggestions.length} предложений:`);
      suggestions.forEach((s, i) => {
        console.log(`${i + 1}. ${s.product_name} (${s.unit}) - score: ${s.score}`);
      });
    } else {
      console.log('❌ Предложения не найдены');
    }
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await sequelize.close();
  }
}

testFindExactMatch();