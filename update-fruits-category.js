const { NomenclatureCache, ProductSynonym } = require('./src/database/models');
const sequelize = require('./src/database/config');

async function updateFruitsCategory() {
  try {
    // Продукты категории "Фрукты" с единицами измерения
    const products = [
      { name: 'Абрикос', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Арбуз', units: ['кг', 'шт'], defaultUnit: 'кг' },
      { name: 'Голубика', units: ['кг', 'шт'], defaultUnit: 'кг' },
      { name: 'Дыня', units: ['кг', 'шт'], defaultUnit: 'кг' },
      { name: 'Ежевика', units: ['кг', 'шт'], defaultUnit: 'кг' },
      { name: 'Клубника', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Малина', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Нектарин светлый', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Персик инжирный', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Слива жёлтая', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Слива чёрная', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Фейхоа', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Черешня', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Яблоки зелёные', units: ['кг'], defaultUnit: 'кг' },
      { name: 'Яблоки красные', units: ['кг'], defaultUnit: 'кг' }
    ];

    // Синонимы для добавления
    const synonymsToAdd = [
      // Абрикос
      { original: 'Абрикос', synonym: 'абрикос', weight: 1.0 },
      { original: 'Абрикос', synonym: 'Абрикосы', weight: 1.0 },
      { original: 'Абрикос', synonym: 'абрикосы', weight: 1.0 },
      
      // Арбуз
      { original: 'Арбуз', synonym: 'арбуз', weight: 1.0 },
      { original: 'Арбуз', synonym: 'Арбузы', weight: 0.9 },
      
      // Голубика
      { original: 'Голубика', synonym: 'голубика', weight: 1.0 },
      
      // Дыня
      { original: 'Дыня', synonym: 'дыня', weight: 1.0 },
      { original: 'Дыня', synonym: 'Дыни', weight: 0.9 },
      
      // Ежевика
      { original: 'Ежевика', synonym: 'ежевика', weight: 1.0 },
      
      // Клубника
      { original: 'Клубника', synonym: 'клубника', weight: 1.0 },
      { original: 'Клубника', synonym: 'Земляника садовая', weight: 0.8 },
      
      // Малина
      { original: 'Малина', synonym: 'малина', weight: 1.0 },
      
      // Нектарин
      { original: 'Нектарин светлый', synonym: 'Нектарин', weight: 1.0 },
      { original: 'Нектарин светлый', synonym: 'нектарин', weight: 1.0 },
      { original: 'Нектарин светлый', synonym: 'Нектарины', weight: 0.9 },
      
      // Персик
      { original: 'Персик инжирный', synonym: 'Персик', weight: 0.9 },
      { original: 'Персик инжирный', synonym: 'персик', weight: 0.9 },
      { original: 'Персик инжирный', synonym: 'Персики', weight: 0.8 },
      { original: 'Персик инжирный', synonym: 'Инжирный персик', weight: 1.0 },
      
      // Слива
      { original: 'Слива жёлтая', synonym: 'Слива желтая', weight: 1.0 },
      { original: 'Слива жёлтая', synonym: 'Желтая слива', weight: 1.0 },
      { original: 'Слива жёлтая', synonym: 'Слива', weight: 0.8 },
      { original: 'Слива чёрная', synonym: 'Слива черная', weight: 1.0 },
      { original: 'Слива чёрная', synonym: 'Черная слива', weight: 1.0 },
      { original: 'Слива чёрная', synonym: 'Слива', weight: 0.8 },
      { original: 'Слива чёрная', synonym: 'Чернослив свежий', weight: 0.7 },
      
      // Фейхоа
      { original: 'Фейхоа', synonym: 'фейхоа', weight: 1.0 },
      { original: 'Фейхоа', synonym: 'Фейхуа', weight: 0.9 },
      
      // Черешня
      { original: 'Черешня', synonym: 'черешня', weight: 1.0 },
      { original: 'Черешня', synonym: 'Черешни', weight: 0.9 },
      
      // Яблоки
      { original: 'Яблоки зелёные', synonym: 'Яблоки зеленые', weight: 1.0 },
      { original: 'Яблоки зелёные', synonym: 'Зеленые яблоки', weight: 1.0 },
      { original: 'Яблоки зелёные', synonym: 'Яблоки', weight: 0.7 },
      { original: 'Яблоки зелёные', synonym: 'яблоки', weight: 0.7 },
      { original: 'Яблоки зелёные', synonym: 'Гренни смит', weight: 0.8 },
      { original: 'Яблоки зелёные', synonym: 'Симиренко', weight: 0.8 },
      { original: 'Яблоки красные', synonym: 'Красные яблоки', weight: 1.0 },
      { original: 'Яблоки красные', synonym: 'Яблоки', weight: 0.7 },
      { original: 'Яблоки красные', synonym: 'яблоки', weight: 0.7 }
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
            category: 'Фрукты',
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
          if (existing.category !== 'Фрукты') {
            existing.category = 'Фрукты';
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
                category: 'Фрукты',
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
      
      console.log('\n✨ Обновление категории "Фрукты" завершено успешно!');
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

updateFruitsCategory();