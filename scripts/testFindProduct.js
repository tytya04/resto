require('dotenv').config();
const { NomenclatureCache, sequelize } = require('../src/database/models');

async function test() {
  try {
    // Пробуем найти продукт разными способами
    console.log('1. Поиск по точному имени:');
    const p1 = await NomenclatureCache.findOne({
      where: { product_name: 'Картофель любой' }
    });
    console.log('Результат:', p1 ? p1.product_name : 'НЕ НАЙДЕН');
    
    console.log('\n2. Поиск с LOWER:');
    const p2 = await NomenclatureCache.findOne({
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('product_name')),
        'картофель любой'
      )
    });
    console.log('Результат:', p2 ? p2.product_name : 'НЕ НАЙДЕН');
    
    console.log('\n3. Первые 5 продуктов категории Овощи:');
    const vegetables = await NomenclatureCache.findAll({
      where: { category: 'Овощи' },
      limit: 5
    });
    vegetables.forEach(v => console.log(`- "${v.product_name}"`));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

test();