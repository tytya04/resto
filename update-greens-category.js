const { NomenclatureCache, ProductSynonym } = require('./src/database/models');
const sequelize = require('./src/database/config');

async function updateGreensCategory() {
  try {
    // Продукты категории "Зелень" с обновленными единицами измерения
    const products = [
      { name: 'Базилик красный', units: ['кг', 'шт'], defaultUnit: 'шт' },
      { name: 'Дайкон', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Имбирь корень', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Кинза весовая', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Кинза пучки', units: ['шт'], defaultUnit: 'шт' },
      { name: 'Лист салата', units: ['шт'], defaultUnit: 'шт' },
      { name: 'Лист салата побольше', units: ['шт'], defaultUnit: 'шт' },
      { name: 'Лук зелёный', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Мята свежая', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Огурцы гладкие', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Перец стручковый зелёный острый', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Перец стручковый красный острый', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Петрушка весовая', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Петрушка пучки', units: ['шт'], defaultUnit: 'шт' },
      { name: 'Редис', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Тархун свежий', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Укроп пучки', units: ['шт'], defaultUnit: 'шт' },
      { name: 'Укроп весовой', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Чеснок крупный', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Шпинат весовой', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Щавель', units: ['кг'], defaultUnit: 'кг' }
    ];

    // Новые продукты для добавления
    const newProducts = [
      'Лист салата побольше',
      'Огурцы гладкие',
      'Петрушка весовая',
      'Петрушка пучки',
      'Тархун свежий',
      'Укроп пучки',
      'Укроп весовой',
      'Чеснок крупный',
      'Шпинат весовой'
    ];

    // Синонимы для добавления
    const synonymsToAdd = [
      // Синонимы для петрушки
      { original: 'Петрушка весовая', synonym: 'Петрушка', weight: 1.0 },
      { original: 'Петрушка весовая', synonym: 'петрушка', weight: 1.0 },
      { original: 'Петрушка пучки', synonym: 'Петрушка пучок', weight: 1.0 },
      { original: 'Петрушка пучки', synonym: 'петрушка пучок', weight: 1.0 },
      
      // Синонимы для укропа
      { original: 'Укроп весовой', synonym: 'Укроп', weight: 1.0 },
      { original: 'Укроп весовой', synonym: 'укроп', weight: 1.0 },
      { original: 'Укроп пучки', synonym: 'Укроп пучок', weight: 1.0 },
      { original: 'Укроп пучки', synonym: 'укроп пучок', weight: 1.0 },
      
      // Синонимы для кинзы
      { original: 'Кинза весовая', synonym: 'Кинза', weight: 1.0 },
      { original: 'Кинза весовая', synonym: 'кинза', weight: 1.0 },
      { original: 'Кинза пучки', synonym: 'Кинза пучок', weight: 1.0 },
      { original: 'Кинза пучки', synonym: 'кинза пучок', weight: 1.0 },
      
      // Синонимы для огурцов
      { original: 'Огурцы гладкие', synonym: 'Огурцы', weight: 0.9 },
      { original: 'Огурцы гладкие', synonym: 'огурцы', weight: 0.9 },
      
      // Синонимы для чеснока
      { original: 'Чеснок крупный', synonym: 'Чеснок', weight: 1.0 },
      { original: 'Чеснок крупный', synonym: 'чеснок', weight: 1.0 },
      
      // Синонимы для шпината
      { original: 'Шпинат весовой', synonym: 'Шпинат', weight: 1.0 },
      { original: 'Шпинат весовой', synonym: 'шпинат', weight: 1.0 },
      
      // Синонимы для тархуна
      { original: 'Тархун свежий', synonym: 'Тархун', weight: 1.0 },
      { original: 'Тархун свежий', synonym: 'тархун', weight: 1.0 },
      { original: 'Тархун свежий', synonym: 'Эстрагон', weight: 0.9 },
      { original: 'Тархун свежий', synonym: 'эстрагон', weight: 0.9 }
    ];

    const t = await sequelize.transaction();
    
    try {
      // 1. Сначала добавим новые продукты
      for (const productName of newProducts) {
        const product = products.find(p => p.name === productName);
        if (!product) continue;
        
        const existing = await NomenclatureCache.findOne({
          where: { product_name: productName },
          transaction: t
        });
        
        if (!existing) {
          await NomenclatureCache.create({
            product_name: productName,
            category: 'Зелень',
            unit: product.defaultUnit,
            created_at: new Date(),
            updated_at: new Date()
          }, { transaction: t });
          console.log(`✅ Добавлен новый продукт: ${productName} (${product.defaultUnit})`);
        }
      }
      
      // 2. Обновим единицы измерения для существующих продуктов
      for (const product of products) {
        const existing = await NomenclatureCache.findOne({
          where: { product_name: product.name },
          transaction: t
        });
        
        if (existing && existing.unit !== product.defaultUnit) {
          existing.unit = product.defaultUnit;
          await existing.save({ transaction: t });
          console.log(`✅ Обновлена единица измерения для ${product.name}: ${product.defaultUnit}`);
        }
        
        // Для продуктов с двумя единицами измерения создадим дубликаты
        if (product.units.length > 1 && existing) {
          for (const unit of product.units) {
            if (unit === product.defaultUnit) continue;
            
            const variantName = `${product.name} (${unit})`;
            const variant = await NomenclatureCache.findOne({
              where: { product_name: variantName },
              transaction: t
            });
            
            if (!variant) {
              await NomenclatureCache.create({
                product_name: variantName,
                category: 'Зелень',
                unit: unit,
                created_at: new Date(),
                updated_at: new Date()
              }, { transaction: t });
              console.log(`✅ Добавлен вариант: ${variantName}`);
              
              // Добавим синоним для варианта
              await ProductSynonym.create({
                original: variantName,
                synonym: product.name,
                weight: 0.8
              }, { transaction: t }).catch(() => {});
            }
          }
        }
      }
      
      // 3. Добавим синонимы
      for (const syn of synonymsToAdd) {
        try {
          await ProductSynonym.create(syn, { transaction: t });
          console.log(`✅ Добавлен синоним: ${syn.synonym} → ${syn.original}`);
        } catch (error) {
          if (error.name === 'SequelizeUniqueConstraintError') {
            // Синоним уже существует
          } else {
            throw error;
          }
        }
      }
      
      await t.commit();
      console.log('✨ Обновление категории "Зелень" завершено успешно!');
      
    } catch (error) {
      await t.rollback();
      throw error;
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при обновлении:', error);
    process.exit(1);
  }
}

updateGreensCategory();