require('dotenv').config();
const { NomenclatureCache, sequelize } = require('../src/database/models');
const { Op } = require('sequelize');

async function check() {
  try {
    // Ищем продукты с картофелем
    const potatoes = await NomenclatureCache.findAll({
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('product_name')),
        { [Op.like]: '%картоф%' }
      )
    });
    
    console.log('Картофель в базе:');
    potatoes.forEach(p => console.log(`- ${p.product_name} (${p.category})`));
    
    // Ищем морковь
    const carrots = await NomenclatureCache.findAll({
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('product_name')),
        { [Op.like]: '%морков%' }
      )
    });
    
    console.log('\nМорковь в базе:');
    carrots.forEach(p => console.log(`- ${p.product_name} (${p.category})`));
    
    // Ищем лук
    const onions = await NomenclatureCache.findAll({
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('product_name')),
        { [Op.like]: '%лук%' }
      )
    });
    
    console.log('\nЛук в базе:');
    onions.forEach(p => console.log(`- ${p.product_name} (${p.category})`));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

check();