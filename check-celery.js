require('dotenv').config();
const { initDatabase } = require('./src/database/init');
const { NomenclatureCache, ProductSynonym } = require('./src/database/models');
const productMatcher = require('./src/services/ProductMatcher');
const { Op } = require('sequelize');

async function checkCelery() {
  console.log('🥬 Проверяем наличие сельдерея в базе данных...\n');
  
  try {
    // Инициализируем базу данных
    await initDatabase();
    await productMatcher.initialize();
    
    // 1. Ищем точное совпадение
    console.log('1️⃣ Поиск точного совпадения для "Сельдерей":');
    const exactMatch = await productMatcher.findExactMatch("Сельдерей");
    console.log('Результат:', exactMatch ? `✅ Найден: ${exactMatch.product_name}` : '❌ Не найден');
    
    // 2. Ищем похожие продукты
    console.log('\n2️⃣ Поиск похожих продуктов:');
    const likePattern = '%сельдере%';
    const similarProducts = await NomenclatureCache.findAll({
      where: {
        product_name: {
          [Op.like]: likePattern
        }
      }
    });
    
    if (similarProducts.length > 0) {
      console.log(`Найдено ${similarProducts.length} похожих продуктов:`);
      similarProducts.forEach(p => {
        console.log(`  - ${p.product_name} (${p.unit})`);
      });
    } else {
      console.log('Похожие продукты не найдены');
    }
    
    // 3. Проверяем синонимы
    console.log('\n3️⃣ Проверка синонимов для "сельдерей":');
    const synonyms = await ProductSynonym.findAll({
      where: {
        synonym: {
          [Op.like]: '%сельдере%'
        }
      }
    });
    
    if (synonyms.length > 0) {
      console.log(`Найдено ${synonyms.length} синонимов:`);
      synonyms.forEach(s => {
        console.log(`  - "${s.synonym}" → "${s.product_name}"`);
      });
    } else {
      console.log('Синонимы не найдены');
    }
    
    // 4. Предложения от ProductMatcher
    console.log('\n4️⃣ Предложения от ProductMatcher для "Сельдерей":');
    const suggestions = await productMatcher.suggestProducts("Сельдерей", 10);
    if (suggestions.length > 0) {
      console.log(`Найдено ${suggestions.length} предложений:`);
      suggestions.forEach((s, i) => {
        console.log(`  ${i+1}. ${s.product_name} (${s.unit}) - score: ${s.score}`);
      });
    } else {
      console.log('Предложений не найдено');
    }
    
    // 5. Поиск всех продуктов категории "Овощи" для сравнения
    console.log('\n5️⃣ Все овощи в базе (первые 20):');
    const vegetables = await NomenclatureCache.findAll({
      where: { category: 'Овощи' },
      limit: 20,
      order: [['product_name', 'ASC']]
    });
    
    vegetables.forEach(v => {
      if (v.product_name.toLowerCase().includes('сельд')) {
        console.log(`  ⭐ ${v.product_name} (${v.unit})`);
      } else {
        console.log(`  - ${v.product_name} (${v.unit})`);
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
  
  process.exit(0);
}

checkCelery();