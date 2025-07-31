const { NomenclatureCache, ProductSynonym } = require('./src/database/models');
const sequelize = require('./src/database/config');

async function updateVegetablesCategory() {
  try {
    // Продукты категории "Овощи" с единицами измерения
    const products = [
      { name: 'Баклажан местный', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Брокколи', units: ['кг', 'шт'], defaultUnit: 'кг' },
      { name: 'Кабачки', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Капуста белокочанная', units: ['кг', 'шт'], defaultUnit: 'кг' },
      { name: 'Капуста красная', units: ['кг', 'шт'], defaultUnit: 'кг' },
      { name: 'Капуста пекинская', units: ['кг', 'шт'], defaultUnit: 'кг' },
      { name: 'Капуста цветная', units: ['кг', 'шт'], defaultUnit: 'кг' },
      { name: 'Картофель любой', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Картофель белый', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Картофель красный', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Картофель мелкий 100 грамм', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Кукуруза', units: ['шт'], defaultUnit: 'шт' },
      { name: 'Лук красный', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Лук репчатый', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Морковь', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Морковь крупная', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Перец местный', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Свекла', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Тыква', units: ['кг', 'шт'], defaultUnit: 'кг' }
    ];

    // Синонимы для добавления
    const synonymsToAdd = [
      // Баклажан
      { original: 'Баклажан местный', synonym: 'Баклажан', weight: 1.0 },
      { original: 'Баклажан местный', synonym: 'баклажан', weight: 1.0 },
      { original: 'Баклажан местный', synonym: 'Баклажаны', weight: 0.9 },
      
      // Брокколи
      { original: 'Брокколи', synonym: 'брокколи', weight: 1.0 },
      { original: 'Брокколи', synonym: 'Броколли', weight: 0.9 },
      { original: 'Брокколи', synonym: 'Брокколи капуста', weight: 0.8 },
      
      // Кабачки
      { original: 'Кабачки', synonym: 'кабачки', weight: 1.0 },
      { original: 'Кабачки', synonym: 'Кабачок', weight: 1.0 },
      { original: 'Кабачки', synonym: 'кабачок', weight: 1.0 },
      
      // Капуста белокочанная
      { original: 'Капуста белокочанная', synonym: 'Капуста', weight: 0.9 },
      { original: 'Капуста белокочанная', synonym: 'капуста', weight: 0.9 },
      { original: 'Капуста белокочанная', synonym: 'Капуста белая', weight: 1.0 },
      { original: 'Капуста белокочанная', synonym: 'Белокочанная капуста', weight: 1.0 },
      
      // Капуста красная
      { original: 'Капуста красная', synonym: 'Красная капуста', weight: 1.0 },
      { original: 'Капуста красная', synonym: 'Капуста краснокочанная', weight: 1.0 },
      { original: 'Капуста красная', synonym: 'Краснокочанная капуста', weight: 1.0 },
      
      // Капуста пекинская
      { original: 'Капуста пекинская', synonym: 'Пекинская капуста', weight: 1.0 },
      { original: 'Капуста пекинская', synonym: 'Пекинка', weight: 0.9 },
      { original: 'Капуста пекинская', synonym: 'Китайская капуста', weight: 0.8 },
      
      // Капуста цветная
      { original: 'Капуста цветная', synonym: 'Цветная капуста', weight: 1.0 },
      { original: 'Капуста цветная', synonym: 'Цветная', weight: 0.8 },
      
      // Картофель
      { original: 'Картофель любой', synonym: 'Картофель', weight: 1.0 },
      { original: 'Картофель любой', synonym: 'картофель', weight: 1.0 },
      { original: 'Картофель любой', synonym: 'Картошка', weight: 0.9 },
      { original: 'Картофель любой', synonym: 'картошка', weight: 0.9 },
      
      { original: 'Картофель белый', synonym: 'Белый картофель', weight: 1.0 },
      { original: 'Картофель белый', synonym: 'Картошка белая', weight: 0.9 },
      
      { original: 'Картофель красный', synonym: 'Красный картофель', weight: 1.0 },
      { original: 'Картофель красный', synonym: 'Картошка красная', weight: 0.9 },
      { original: 'Картофель красный', synonym: 'Картофель розовый', weight: 0.8 },
      
      { original: 'Картофель мелкий 100 грамм', synonym: 'Картофель мелкий', weight: 1.0 },
      { original: 'Картофель мелкий 100 грамм', synonym: 'Мелкий картофель', weight: 1.0 },
      { original: 'Картофель мелкий 100 грамм', synonym: 'Мелкая картошка', weight: 0.9 },
      
      // Кукуруза
      { original: 'Кукуруза', synonym: 'кукуруза', weight: 1.0 },
      { original: 'Кукуруза', synonym: 'Кукуруза початок', weight: 0.9 },
      { original: 'Кукуруза', synonym: 'Початок кукурузы', weight: 0.9 },
      
      // Лук
      { original: 'Лук красный', synonym: 'Красный лук', weight: 1.0 },
      { original: 'Лук красный', synonym: 'Лук фиолетовый', weight: 0.9 },
      { original: 'Лук красный', synonym: 'Ялтинский лук', weight: 0.8 },
      
      { original: 'Лук репчатый', synonym: 'Лук', weight: 1.0 },
      { original: 'Лук репчатый', synonym: 'лук', weight: 1.0 },
      { original: 'Лук репчатый', synonym: 'Репчатый лук', weight: 1.0 },
      { original: 'Лук репчатый', synonym: 'Лук белый', weight: 0.8 },
      
      // Морковь
      { original: 'Морковь', synonym: 'морковь', weight: 1.0 },
      { original: 'Морковь', synonym: 'Морковка', weight: 0.9 },
      { original: 'Морковь', synonym: 'морковка', weight: 0.9 },
      
      { original: 'Морковь крупная', synonym: 'Крупная морковь', weight: 1.0 },
      { original: 'Морковь крупная', synonym: 'Морковь большая', weight: 0.9 },
      
      // Перец
      { original: 'Перец местный', synonym: 'Перец', weight: 0.9 },
      { original: 'Перец местный', synonym: 'перец', weight: 0.9 },
      { original: 'Перец местный', synonym: 'Перец болгарский', weight: 0.8 },
      { original: 'Перец местный', synonym: 'Болгарский перец', weight: 0.8 },
      
      // Свекла
      { original: 'Свекла', synonym: 'свекла', weight: 1.0 },
      { original: 'Свекла', synonym: 'Свёкла', weight: 1.0 },
      { original: 'Свекла', synonym: 'свёкла', weight: 1.0 },
      { original: 'Свекла', synonym: 'Буряк', weight: 0.8 },
      
      // Тыква
      { original: 'Тыква', synonym: 'тыква', weight: 1.0 }
    ];

    const t = await sequelize.transaction();
    
    try {
      let addedCount = 0;
      let updatedCount = 0;
      let existingCount = 0;
      
      // Добавляем/обновляем продукты
      for (const product of products) {
        const existing = await NomenclatureCache.findOne({
          where: { product_name: product.name },
          transaction: t
        });
        
        if (!existing) {
          await NomenclatureCache.create({
            product_name: product.name,
            category: 'Овощи',
            unit: product.defaultUnit,
            created_at: new Date(),
            updated_at: new Date()
          }, { transaction: t });
          console.log(`✅ Добавлен новый продукт: ${product.name} (${product.defaultUnit})`);
          addedCount++;
        } else {
          // Обновляем единицу измерения и категорию если нужно
          let updated = false;
          if (existing.unit !== product.defaultUnit) {
            existing.unit = product.defaultUnit;
            updated = true;
          }
          if (existing.category !== 'Овощи') {
            existing.category = 'Овощи';
            updated = true;
          }
          if (updated) {
            await existing.save({ transaction: t });
            console.log(`✅ Обновлен продукт: ${product.name} (${product.defaultUnit})`);
            updatedCount++;
          } else {
            existingCount++;
          }
        }
        
        // Для продуктов с двумя единицами измерения создадим варианты
        if (product.units.length > 1) {
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
                category: 'Овощи',
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
              
              // Добавим обратный синоним для штучных товаров
              if (unit === 'шт') {
                await ProductSynonym.create({
                  original: variantName,
                  synonym: `${product.name} штука`,
                  weight: 0.9
                }, { transaction: t }).catch(() => {});
                await ProductSynonym.create({
                  original: variantName,
                  synonym: `${product.name} штуки`,
                  weight: 0.9
                }, { transaction: t }).catch(() => {});
              }
            }
          }
        }
      }
      
      // Добавляем синонимы
      let synonymsAdded = 0;
      for (const syn of synonymsToAdd) {
        try {
          await ProductSynonym.create(syn, { transaction: t });
          synonymsAdded++;
        } catch (error) {
          if (error.name === 'SequelizeUniqueConstraintError') {
            // Синоним уже существует
          } else {
            throw error;
          }
        }
      }
      
      await t.commit();
      
      console.log('\n✨ Обновление категории "Овощи" завершено успешно!');
      console.log(`📊 Статистика:`);
      console.log(`   - Новых продуктов добавлено: ${addedCount}`);
      console.log(`   - Продуктов обновлено: ${updatedCount}`);
      console.log(`   - Продуктов уже существовало: ${existingCount}`);
      console.log(`   - Синонимов добавлено: ${synonymsAdded}`);
      console.log(`   - Всего продуктов в категории: ${products.length}`);
      
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

updateVegetablesCategory();