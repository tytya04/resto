require('dotenv').config();
const { ProductSynonym, NomenclatureCache } = require('./src/database/models');
const logger = require('./src/utils/logger');

(async () => {
  try {
    // Сначала добавим продукт "Картофель красный" если его нет
    const [redPotato] = await NomenclatureCache.findOrCreate({
      where: { product_name: 'Картофель красный' },
      defaults: {
        category: 'Овощи',
        unit: 'кг',
        last_purchase_price: 40
      }
    });
    
    console.log('Added/found product:', redPotato.product_name);
    
    // Добавляем синонимы
    const synonymsToAdd = [
      { original: 'Картофель красный', synonym: 'картошка красная', weight: 1.0 },
      { original: 'Картофель красный', synonym: 'картошка красн', weight: 0.95 },
      { original: 'Картофель красный', synonym: 'картофель красн', weight: 0.95 },
      { original: 'Картофель красный', synonym: 'красная картошка', weight: 1.0 },
      { original: 'Картофель красный', synonym: 'красный картофель', weight: 1.0 },
      // Добавим еще синонимы для обычного картофеля
      { original: 'Картофель', synonym: 'картошка белая', weight: 0.9 },
      { original: 'Картофель', synonym: 'белая картошка', weight: 0.9 },
      { original: 'Картофель', synonym: 'картофель белый', weight: 0.9 }
    ];
    
    for (const syn of synonymsToAdd) {
      try {
        await ProductSynonym.findOrCreate({
          where: {
            original: syn.original,
            synonym: syn.synonym
          },
          defaults: {
            weight: syn.weight,
            usage_count: 0
          }
        });
        console.log(`Added synonym: "${syn.synonym}" -> "${syn.original}"`);
      } catch (error) {
        console.log(`Synonym already exists: "${syn.synonym}"`);
      }
    }
    
    // Добавим еще продуктов из категории овощи
    const vegetables = [
      { product_name: 'Капуста белокочанная', category: 'Овощи', unit: 'кг', last_purchase_price: 25 },
      { product_name: 'Капуста цветная', category: 'Овощи', unit: 'кг', last_purchase_price: 85 },
      { product_name: 'Лук зеленый', category: 'Овощи', unit: 'кг', last_purchase_price: 150 },
      { product_name: 'Чеснок', category: 'Овощи', unit: 'кг', last_purchase_price: 200 },
      { product_name: 'Перец болгарский', category: 'Овощи', unit: 'кг', last_purchase_price: 180 }
    ];
    
    for (const veg of vegetables) {
      await NomenclatureCache.findOrCreate({
        where: { product_name: veg.product_name },
        defaults: veg
      });
      console.log(`Added vegetable: ${veg.product_name}`);
    }
    
    console.log('\nDone! Products and synonyms added.');
    
    process.exit(0);
  } catch (error) {
    logger.error('Failed to add synonyms:', error);
    process.exit(1);
  }
})();