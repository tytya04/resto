require('dotenv').config();
const { initDatabase } = require('./src/database/init');
const { NomenclatureCache, ProductSynonym } = require('./src/database/models');
const productMatcher = require('./src/services/ProductMatcher');
const { Op } = require('sequelize');

async function checkOnion() {
  console.log('🧅 Проверяем варианты лука в базе данных...\n');
  
  try {
    await initDatabase();
    await productMatcher.initialize();
    
    // 1. Все продукты с "лук"
    console.log('1️⃣ Все продукты содержащие "лук":');
    const onionProducts = await NomenclatureCache.findAll({
      where: {
        product_name: {
          [Op.or]: [
            { [Op.like]: '%лук%' },
            { [Op.like]: '%Лук%' }
          ]
        }
      }
    });
    
    console.log(`Найдено ${onionProducts.length} продуктов:`);
    onionProducts.forEach(p => {
      console.log(`  ${p.id}. ${p.product_name} (${p.unit})`);
    });
    
    // 2. Точное совпадение для "Лук"
    console.log('\n2️⃣ Точное совпадение для "Лук":');
    const exactMatch = await productMatcher.findExactMatch("Лук");
    if (exactMatch) {
      console.log(`  ✅ Найден: ${exactMatch.product_name} (ID: ${exactMatch.id})`);
    } else {
      console.log('  ❌ Не найден');
    }
    
    // 3. Предложения для "Лук"
    console.log('\n3️⃣ Предложения для "Лук":');
    const suggestions = await productMatcher.suggestProducts("Лук", 10);
    suggestions.forEach((s, i) => {
      console.log(`  ${i+1}. ${s.product_name} (${s.unit}) - score: ${s.score}`);
    });
    
    // 4. Проверяем все картофель
    console.log('\n\n🥔 Проверяем варианты картофеля:');
    const potatoProducts = await NomenclatureCache.findAll({
      where: {
        product_name: {
          [Op.or]: [
            { [Op.like]: '%картоф%' },
            { [Op.like]: '%Картоф%' }
          ]
        }
      }
    });
    
    console.log(`Найдено ${potatoProducts.length} продуктов:`);
    potatoProducts.forEach(p => {
      console.log(`  ${p.id}. ${p.product_name} (${p.unit})`);
    });
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
  
  process.exit(0);
}

checkOnion();