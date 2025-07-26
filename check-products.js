require('dotenv').config();
const { NomenclatureCache } = require('./src/database/models');
const logger = require('./src/utils/logger');

(async () => {
  try {
    // Ищем продукты с картофелем
    const products = await NomenclatureCache.findAll({
      where: {
        product_name: {
          [require('sequelize').Op.like]: '%карто%'
        }
      }
    });
    
    console.log('\n=== Products with "карто" ===');
    products.forEach(p => {
      console.log(`- ${p.product_name} (${p.unit})`);
    });
    
    // Проверяем общее количество
    const total = await NomenclatureCache.count();
    console.log(`\nTotal products in cache: ${total}`);
    
    process.exit(0);
  } catch (error) {
    logger.error('Failed to check products:', error);
    process.exit(1);
  }
})();