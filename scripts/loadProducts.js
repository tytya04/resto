const { NomenclatureCache, sequelize } = require('../src/database/models');
const logger = require('../src/utils/logger');

const products = [
  // Овощи
  { product_name: 'Картофель', unit: 'кг', category: 'Овощи' },
  { product_name: 'Картошка', unit: 'кг', category: 'Овощи' },
  { product_name: 'Лук репчатый', unit: 'кг', category: 'Овощи' },
  { product_name: 'Лук', unit: 'кг', category: 'Овощи' },
  { product_name: 'Морковь', unit: 'кг', category: 'Овощи' },
  { product_name: 'Морковка', unit: 'кг', category: 'Овощи' },
  { product_name: 'Свекла', unit: 'кг', category: 'Овощи' },
  { product_name: 'Капуста белокочанная', unit: 'кг', category: 'Овощи' },
  { product_name: 'Капуста', unit: 'кг', category: 'Овощи' },
  { product_name: 'Помидоры', unit: 'кг', category: 'Овощи' },
  { product_name: 'Томаты', unit: 'кг', category: 'Овощи' },
  { product_name: 'Огурцы', unit: 'кг', category: 'Овощи' },
  { product_name: 'Перец болгарский', unit: 'кг', category: 'Овощи' },
  { product_name: 'Баклажаны', unit: 'кг', category: 'Овощи' },
  { product_name: 'Кабачки', unit: 'кг', category: 'Овощи' },
  { product_name: 'Чеснок', unit: 'кг', category: 'Овощи' },
  
  // Зелень
  { product_name: 'Укроп', unit: 'кг', category: 'Зелень' },
  { product_name: 'Петрушка', unit: 'кг', category: 'Зелень' },
  { product_name: 'Зеленый лук', unit: 'кг', category: 'Зелень' },
  { product_name: 'Салат', unit: 'кг', category: 'Зелень' },
  { product_name: 'Шпинат', unit: 'кг', category: 'Зелень' },
  { product_name: 'Кинза', unit: 'кг', category: 'Зелень' },
  { product_name: 'Базилик', unit: 'кг', category: 'Зелень' },
  
  // Фрукты
  { product_name: 'Яблоки', unit: 'кг', category: 'Фрукты' },
  { product_name: 'Бананы', unit: 'кг', category: 'Фрукты' },
  { product_name: 'Апельсины', unit: 'кг', category: 'Фрукты' },
  { product_name: 'Лимоны', unit: 'кг', category: 'Фрукты' },
  { product_name: 'Груши', unit: 'кг', category: 'Фрукты' },
  { product_name: 'Виноград', unit: 'кг', category: 'Фрукты' },
  
  // Мясо
  { product_name: 'Говядина', unit: 'кг', category: 'Мясо' },
  { product_name: 'Свинина', unit: 'кг', category: 'Мясо' },
  { product_name: 'Курица', unit: 'кг', category: 'Мясо' },
  { product_name: 'Индейка', unit: 'кг', category: 'Мясо' },
  { product_name: 'Баранина', unit: 'кг', category: 'Мясо' },
  { product_name: 'Фарш говяжий', unit: 'кг', category: 'Мясо' },
  { product_name: 'Фарш свиной', unit: 'кг', category: 'Мясо' },
  { product_name: 'Фарш куриный', unit: 'кг', category: 'Мясо' },
  
  // Рыба
  { product_name: 'Семга', unit: 'кг', category: 'Рыба' },
  { product_name: 'Форель', unit: 'кг', category: 'Рыба' },
  { product_name: 'Минтай', unit: 'кг', category: 'Рыба' },
  { product_name: 'Треска', unit: 'кг', category: 'Рыба' },
  { product_name: 'Скумбрия', unit: 'кг', category: 'Рыба' },
  { product_name: 'Сельдь', unit: 'кг', category: 'Рыба' },
  
  // Молочные продукты
  { product_name: 'Молоко', unit: 'л', category: 'Молочные продукты' },
  { product_name: 'Сметана', unit: 'кг', category: 'Молочные продукты' },
  { product_name: 'Творог', unit: 'кг', category: 'Молочные продукты' },
  { product_name: 'Сыр', unit: 'кг', category: 'Молочные продукты' },
  { product_name: 'Масло сливочное', unit: 'кг', category: 'Молочные продукты' },
  { product_name: 'Кефир', unit: 'л', category: 'Молочные продукты' },
  { product_name: 'Йогурт', unit: 'л', category: 'Молочные продукты' },
  
  // Бакалея
  { product_name: 'Мука', unit: 'кг', category: 'Бакалея' },
  { product_name: 'Сахар', unit: 'кг', category: 'Бакалея' },
  { product_name: 'Соль', unit: 'кг', category: 'Бакалея' },
  { product_name: 'Рис', unit: 'кг', category: 'Бакалея' },
  { product_name: 'Греча', unit: 'кг', category: 'Бакалея' },
  { product_name: 'Макароны', unit: 'кг', category: 'Бакалея' },
  { product_name: 'Масло подсолнечное', unit: 'л', category: 'Бакалея' },
  { product_name: 'Масло оливковое', unit: 'л', category: 'Бакалея' },
  
  // Хлеб
  { product_name: 'Хлеб белый', unit: 'шт', category: 'Хлеб' },
  { product_name: 'Хлеб черный', unit: 'шт', category: 'Хлеб' },
  { product_name: 'Батон', unit: 'шт', category: 'Хлеб' },
  
  // Яйца
  { product_name: 'Яйца куриные', unit: 'шт', category: 'Яйца' },
  { product_name: 'Яйца', unit: 'шт', category: 'Яйца' }
];

async function loadProducts() {
  try {
    logger.info('Starting to load products into database...');
    
    let created = 0;
    let updated = 0;
    
    for (const product of products) {
      const [nomenclature, wasCreated] = await NomenclatureCache.findOrCreate({
        where: { product_name: product.product_name },
        defaults: {
          unit: product.unit,
          category: product.category,
          source: 'manual',
          last_updated: new Date()
        }
      });
      
      if (wasCreated) {
        created++;
        logger.info(`Created product: ${product.product_name}`);
      } else {
        // Update unit and category if they differ
        if (nomenclature.unit !== product.unit || nomenclature.category !== product.category) {
          await nomenclature.update({
            unit: product.unit,
            category: product.category,
            last_updated: new Date()
          });
          updated++;
          logger.info(`Updated product: ${product.product_name}`);
        }
      }
    }
    
    logger.info(`Products loaded successfully. Created: ${created}, Updated: ${updated}`);
    
    // Show total count
    const totalCount = await NomenclatureCache.count();
    logger.info(`Total products in database: ${totalCount}`);
    
  } catch (error) {
    logger.error('Error loading products:', error);
  } finally {
    await sequelize.close();
  }
}

loadProducts();