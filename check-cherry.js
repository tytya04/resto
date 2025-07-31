const { sequelize, NomenclatureCache, ProductSynonym } = require('./src/database/models');

async function checkCherryProduct() {
  try {
    // Проверяем прямое название
    const directProduct = await NomenclatureCache.findOne({
      where: { product_name: 'Черри' }
    });
    
    if (directProduct) {
      console.log('Найден продукт с точным названием "Черри":', directProduct.toJSON());
    } else {
      console.log('Продукт с точным названием "Черри" НЕ найден');
    }

    // Ищем продукты содержащие "черри"
    const cherryProducts = await NomenclatureCache.findAll({
      where: {
        product_name: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('product_name')),
          'LIKE',
          '%черри%'
        )
      }
    });

    console.log('\nПродукты, содержащие "черри" в названии:');
    cherryProducts.forEach(product => {
      console.log(`- ${product.product_name} (${product.unit})`);
    });

    // Ищем в синонимах
    const cherrySynonyms = await ProductSynonym.findAll({
      where: {
        synonym: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('synonym')),
          'LIKE',
          '%черри%'
        )
      }
    });

    console.log('\nСинонимы, содержащие "черри":');
    cherrySynonyms.forEach(syn => {
      console.log(`- Синоним: "${syn.synonym}" → Оригинал: "${syn.original}"`);
    });

    // Проверяем категории томатов
    const tomatoCategory = await NomenclatureCache.findAll({
      where: {
        category: 'Овощи',
        product_name: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('product_name')),
          'LIKE',
          '%помидор%'
        )
      }
    });

    console.log('\nВсе помидоры в категории Овощи:');
    tomatoCategory.forEach(product => {
      console.log(`- ${product.product_name} (${product.unit})`);
    });

  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await sequelize.close();
  }
}

checkCherryProduct();