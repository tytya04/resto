require('dotenv').config();
const productMatcher = require('../src/services/ProductMatcher');
const { NomenclatureCache } = require('../src/database/models');

async function test() {
  try {
    // Инициализируем ProductMatcher
    await productMatcher.initialize();
    
    // Тестируем поиск
    const suggestions = await productMatcher.suggestProducts('Арахис', 5);
    
    console.log('Suggestions for "Арахис":');
    suggestions.forEach((s, i) => {
      console.log(`${i + 1}. Product:`, s.product_name);
      console.log('   Unit:', s.unit);
      console.log('   Category:', s.category);
      console.log('   ID:', s.id);
      console.log('   Full object:', s);
      console.log('---');
    });
    
    // Также проверим прямой поиск в базе
    const dbProducts = await NomenclatureCache.findAll({
      where: {},
      limit: 3
    });
    
    console.log('\nSample products from DB:');
    dbProducts.forEach(p => {
      console.log('Product:', p.product_name, 'ID:', p.id);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit();
}

test();