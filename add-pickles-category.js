const { NomenclatureCache, ProductSynonym } = require('./src/database/models');
const sequelize = require('./src/database/config');

async function addPicklesCategory() {
  try {
    // Продукты категории "Соленья"
    const products = [
      { name: 'Огурцы бочковые', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Перец острый солёный', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Помидор бочковой', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Капуста квашеная', units: ['кг'], defaultUnit: 'кг' }
    ];

    // Синонимы для добавления
    const synonymsToAdd = [
      // Огурцы бочковые
      { original: 'Огурцы бочковые', synonym: 'Бочковые огурцы', weight: 1.0 },
      { original: 'Огурцы бочковые', synonym: 'Огурцы солёные', weight: 0.9 },
      { original: 'Огурцы бочковые', synonym: 'Огурцы соленые', weight: 0.9 },
      { original: 'Огурцы бочковые', synonym: 'Соленые огурцы', weight: 0.9 },
      { original: 'Огурцы бочковые', synonym: 'Солёные огурцы', weight: 0.9 },
      
      // Перец острый солёный
      { original: 'Перец острый солёный', synonym: 'Перец острый соленый', weight: 1.0 },
      { original: 'Перец острый солёный', synonym: 'Солёный острый перец', weight: 1.0 },
      { original: 'Перец острый солёный', synonym: 'Острый перец солёный', weight: 1.0 },
      { original: 'Перец острый солёный', synonym: 'Горький перец солёный', weight: 0.8 },
      
      // Помидор бочковой
      { original: 'Помидор бочковой', synonym: 'Помидоры бочковые', weight: 1.0 },
      { original: 'Помидор бочковой', synonym: 'Бочковые помидоры', weight: 1.0 },
      { original: 'Помидор бочковой', synonym: 'Томаты бочковые', weight: 0.9 },
      { original: 'Помидор бочковой', synonym: 'Помидоры солёные', weight: 0.9 },
      { original: 'Помидор бочковой', synonym: 'Солёные помидоры', weight: 0.9 },
      
      // Капуста квашеная
      { original: 'Капуста квашеная', synonym: 'Квашеная капуста', weight: 1.0 },
      { original: 'Капуста квашеная', synonym: 'капуста квашеная', weight: 1.0 },
      { original: 'Капуста квашеная', synonym: 'Кислая капуста', weight: 0.9 },
      { original: 'Капуста квашеная', synonym: 'Капуста кислая', weight: 0.9 }
    ];

    const t = await sequelize.transaction();
    
    try {
      let addedCount = 0;
      let updatedCount = 0;
      let existingCount = 0;
      
      console.log('🥒 Создание категории "Соленья" и добавление продуктов...\n');
      
      // Добавляем/обновляем продукты
      for (const product of products) {
        const existing = await NomenclatureCache.findOne({
          where: { product_name: product.name },
          transaction: t
        });
        
        if (!existing) {
          await NomenclatureCache.create({
            product_name: product.name,
            category: 'Соленья',
            unit: product.defaultUnit,
            created_at: new Date(),
            updated_at: new Date()
          }, { transaction: t });
          console.log(`✅ Добавлен новый продукт: ${product.name} (${product.defaultUnit})`);
          addedCount++;
        } else {
          // Обновляем категорию если нужно
          if (existing.category !== 'Соленья') {
            existing.category = 'Соленья';
            existing.unit = product.defaultUnit;
            await existing.save({ transaction: t });
            console.log(`✅ Обновлен продукт: ${product.name} → категория "Соленья"`);
            updatedCount++;
          } else {
            console.log(`ℹ️  Продукт уже существует: ${product.name}`);
            existingCount++;
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
      
      console.log('\n✨ Создание категории "Соленья" завершено успешно!');
      console.log(`📊 Статистика:`);
      console.log(`   - Новых продуктов добавлено: ${addedCount}`);
      console.log(`   - Продуктов обновлено: ${updatedCount}`);
      console.log(`   - Продуктов уже существовало: ${existingCount}`);
      console.log(`   - Синонимов добавлено: ${synonymsAdded}`);
      console.log(`   - Всего продуктов в категории: ${products.length}`);
      
      // Показываем все продукты категории
      console.log('\n📋 Продукты в категории "Соленья":');
      const pickles = await sequelize.query(
        `SELECT product_name, unit 
         FROM nomenclature_cache 
         WHERE category = 'Соленья'
         ORDER BY product_name`,
        { type: sequelize.QueryTypes.SELECT }
      );
      
      pickles.forEach(p => {
        console.log(`   - ${p.product_name} (${p.unit})`);
      });
      
    } catch (error) {
      await t.rollback();
      throw error;
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при создании категории:', error);
    process.exit(1);
  }
}

addPicklesCategory();