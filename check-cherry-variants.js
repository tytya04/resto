require('dotenv').config();
const { initDatabase } = require('./src/database/init');
const productMatcher = require('./src/services/ProductMatcher');

async function testCherryVariants() {
  console.log('🍒 Проверяем варианты "черри" в базе данных...\n');
  
  try {
    // Инициализируем базу данных
    await initDatabase();
    console.log('✅ База данных инициализирована');
    
    // Инициализируем ProductMatcher
    await productMatcher.initialize();
    console.log('✅ ProductMatcher инициализирован');
    
    // 1. Поиск точного совпадения
    console.log('\n🔍 1. Поиск точного совпадения для "Черри":');
    const exactMatch = await productMatcher.findExactMatch("Черри");
    console.log('   Результат:', exactMatch);
    
    // 2. Поиск предложений
    console.log('\n🔍 2. Поиск предложений для "Черри":');
    const suggestions = await productMatcher.suggestProducts("Черри", 10);
    console.log(`   Найдено ${suggestions.length} предложений:`);
    suggestions.forEach((s, i) => {
      console.log(`     ${i + 1}. ${s.product_name} (ID: ${s.id}, единица: ${s.unit})`);
    });
    
    // 3. Проверим все продукты содержащие "черри"
    console.log('\n🔍 3. Все продукты содержащие "черри":');
    const { NomenclatureCache } = require('./src/database/models');
    const allCherry = await NomenclatureCache.findAll({
      where: {
        product_name: {
          [require('sequelize').Op.iLike]: '%черри%'
        }
      }
    });
    
    console.log(`   Найдено ${allCherry.length} продуктов:`);
    allCherry.forEach((product, i) => {
      console.log(`     ${i + 1}. ${product.product_name} (ID: ${product.id}, единица: ${product.unit})`);
    });
    
    // 4. Проверим логику поиска альтернативных вариантов
    console.log('\n🔍 4. Проверка логики альтернативных вариантов:');
    if (exactMatch) {
      const matchedProductName = exactMatch.product_name.toLowerCase();
      console.log(`   Точное совпадение: "${exactMatch.product_name}"`);
      
      const alternativeVariants = suggestions.filter(s => 
        s.id !== exactMatch.id && 
        s.product_name.toLowerCase().includes("черри") &&
        (s.product_name.includes('стандарт') || s.product_name.includes('отбор') || 
         s.product_name.includes('премиум') || s.product_name.includes('эконом'))
      );
      
      console.log(`   Альтернативные варианты качества (${alternativeVariants.length}):`);
      alternativeVariants.forEach((variant, i) => {
        console.log(`     ${i + 1}. ${variant.product_name} (ID: ${variant.id}, единица: ${variant.unit})`);
      });
    }
    
    console.log('\n✅ Проверка завершена!');
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
  
  process.exit(0);
}

testCherryVariants();