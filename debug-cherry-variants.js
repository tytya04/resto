const productMatcher = require('./src/services/ProductMatcher');
const { sequelize, NomenclatureCache } = require('./src/database/models');

async function debugCherryVariants() {
  try {
    await productMatcher.initialize();
    
    console.log('=== Отладка вариантов черри ===\n');
    
    // 1. Проверяем все продукты с "черри" в названии
    console.log('1. Все продукты с "черри" в названии:');
    const cherryProducts = await NomenclatureCache.findAll({
      where: {
        product_name: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('product_name')),
          'LIKE',
          '%черри%'
        )
      }
    });
    
    cherryProducts.forEach(p => {
      console.log(`   - ID: ${p.id}, Название: "${p.product_name}", Единица: ${p.unit}`);
    });
    
    // 2. Проверяем findExactMatch для "Черри"
    console.log('\n2. Результат findExactMatch("Черри"):');
    const exactMatch = await productMatcher.findExactMatch('Черри');
    if (exactMatch) {
      console.log(`   Найден: ID ${exactMatch.id} "${exactMatch.product_name}" (${exactMatch.unit})`);
    } else {
      console.log('   Не найден');
    }
    
    // 3. Проверяем suggestProducts для "Черри"
    console.log('\n3. Результат suggestProducts("Черри"):');
    const suggestions = await productMatcher.suggestProducts('Черри', 10);
    suggestions.forEach((s, i) => {
      console.log(`   ${i + 1}. ID: ${s.id}, "${s.product_name}" (${s.unit}), score: ${s.score}, тип: ${s.match_type}`);
    });
    
    // 4. Проверяем что происходит когда есть точное совпадение И похожие продукты
    console.log('\n4. Анализ логики:');
    console.log(`   - findExactMatch находит: "${exactMatch?.product_name}"`);
    console.log(`   - suggestProducts находит ${suggestions.length} вариантов`);
    console.log(`   - Логика: если findExactMatch что-то находит, то suggestProducts не используется`);
    
    // 5. Проверим синонимы
    console.log('\n5. Проверка синонимов для "черри":');
    const { ProductSynonym } = require('./src/database/models');
    const synonyms = await ProductSynonym.findAll({
      where: {
        synonym: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('synonym')),
          'LIKE',
          '%черри%'
        )
      }
    });
    
    synonyms.forEach(syn => {
      console.log(`   - Синоним: "${syn.synonym}" → Оригинал: "${syn.original}"`);
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await sequelize.close();
  }
}

debugCherryVariants();