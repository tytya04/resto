require('dotenv').config();
const { initDatabase } = require('./src/database/init');
const productMatcher = require('./src/services/ProductMatcher');
const { NomenclatureCache } = require('./src/database/models');

async function checkProducts() {
  await initDatabase();
  await productMatcher.initialize();
  
  console.log('=== ПРОВЕРКА ЯБЛОКИ ===');
  // Проверяем яблоки
  const appleExact = await productMatcher.findExactMatch('Яблоки');
  console.log('Точное совпадение "Яблоки":', appleExact ? appleExact.product_name : 'НЕ НАЙДЕНО');
  
  const appleSuggestions = await productMatcher.suggestProducts('Яблоки', 10);
  console.log('\nВарианты для "Яблоки":');
  appleSuggestions.forEach((s, i) => {
    console.log(`${i + 1}. ${s.product_name} (score: ${s.score})`);
  });
  
  // Прямой поиск в БД
  const apples = await NomenclatureCache.findAll({
    where: {
      product_name: {
        [require('sequelize').Op.like]: '%яблок%'
      }
    }
  });
  console.log('\nВсе яблоки в БД:');
  apples.forEach(a => console.log(`- ${a.product_name} (${a.unit})`));
  
  console.log('\n=== ПРОВЕРКА МЯТА ===');
  // Проверяем мяту
  const mintExact = await productMatcher.findExactMatch('Мята');
  console.log('Точное совпадение "Мята":', mintExact ? mintExact.product_name : 'НЕ НАЙДЕНО');
  
  const mintSuggestions = await productMatcher.suggestProducts('Мята', 10);
  console.log('\nВарианты для "Мята":');
  mintSuggestions.forEach((s, i) => {
    console.log(`${i + 1}. ${s.product_name} (score: ${s.score})`);
  });
  
  // Прямой поиск в БД
  const mints = await NomenclatureCache.findAll({
    where: {
      product_name: {
        [require('sequelize').Op.like]: '%мят%'
      }
    }
  });
  console.log('\nВся мята в БД:');
  mints.forEach(m => console.log(`- ${m.product_name} (${m.unit})`));
  
  console.log('\n=== ПРОВЕРКА ПЕРЕЦ ===');
  const pepperSuggestions = await productMatcher.suggestProducts('Перец', 20);
  console.log('\nВсе варианты для "Перец":');
  pepperSuggestions.forEach((s, i) => {
    console.log(`${i + 1}. ${s.product_name} (score: ${s.score})`);
  });
  
  process.exit(0);
}

checkProducts().catch(console.error);