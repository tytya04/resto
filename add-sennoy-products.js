const { NomenclatureCache, ProductSynonym } = require('./src/database/models');
const sequelize = require('./src/database/config');

async function addSennoyProducts() {
  try {
    // Продукты с пометкой "Сенной"
    const products = [
      { name: 'Микрозелень', unit: 'шт' },
      { name: 'Микс салата без романо', unit: 'кг' },
      { name: 'Микс салата весовой', unit: 'кг' },
      { name: 'Фриллис', unit: 'кг' }
    ];

    // Синонимы для добавления
    const synonymsToAdd = [
      // Микрозелень
      { original: 'Микрозелень', synonym: 'микрозелень', weight: 1.0 },
      { original: 'Микрозелень', synonym: 'Микро зелень', weight: 0.9 },
      { original: 'Микрозелень', synonym: 'Микрогрин', weight: 0.8 },
      { original: 'Микрозелень', synonym: 'Microgreen', weight: 0.8 },
      
      // Микс салата без романо
      { original: 'Микс салата без романо', synonym: 'Микс салата', weight: 0.8 },
      { original: 'Микс салата без романо', synonym: 'Салатный микс без романо', weight: 1.0 },
      { original: 'Микс салата без романо', synonym: 'Салат микс без романо', weight: 1.0 },
      
      // Микс салата весовой
      { original: 'Микс салата весовой', synonym: 'Микс салата', weight: 0.8 },
      { original: 'Микс салата весовой', synonym: 'Салатный микс', weight: 0.9 },
      { original: 'Микс салата весовой', synonym: 'Салат микс', weight: 0.9 },
      { original: 'Микс салата весовой', synonym: 'Микс салатов', weight: 0.9 },
      
      // Фриллис
      { original: 'Фриллис', synonym: 'фриллис', weight: 1.0 },
      { original: 'Фриллис', synonym: 'Frillice', weight: 0.9 },
      { original: 'Фриллис', synonym: 'Фрилис', weight: 0.9 },
      { original: 'Фриллис', synonym: 'Салат фриллис', weight: 1.0 }
    ];

    const t = await sequelize.transaction();
    
    try {
      let addedCount = 0;
      let updatedCount = 0;
      
      // Добавляем продукты с технической пометкой
      for (const product of products) {
        const existing = await NomenclatureCache.findOne({
          where: { product_name: product.name },
          transaction: t
        });
        
        if (!existing) {
          // Создаем новый продукт с пометкой "Сенной"
          await sequelize.query(
            `INSERT INTO nomenclature_cache (product_name, category, unit, technical_note, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            {
              replacements: [
                product.name,
                'Зелень',
                product.unit,
                'Сенной',
                new Date(),
                new Date()
              ],
              type: sequelize.QueryTypes.INSERT,
              transaction: t
            }
          );
          console.log(`✅ Добавлен новый продукт: ${product.name} (${product.unit}) - Сенной`);
          addedCount++;
        } else {
          // Обновляем существующий продукт
          await sequelize.query(
            `UPDATE nomenclature_cache 
             SET category = ?, unit = ?, technical_note = ?, updated_at = ?
             WHERE product_name = ?`,
            {
              replacements: [
                'Зелень',
                product.unit,
                'Сенной',
                new Date(),
                product.name
              ],
              type: sequelize.QueryTypes.UPDATE,
              transaction: t
            }
          );
          console.log(`✅ Обновлен продукт: ${product.name} - добавлена пометка "Сенной"`);
          updatedCount++;
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
      
      console.log('\n✨ Добавление продуктов "Сенной" завершено успешно!');
      console.log(`📊 Статистика:`);
      console.log(`   - Новых продуктов добавлено: ${addedCount}`);
      console.log(`   - Продуктов обновлено: ${updatedCount}`);
      console.log(`   - Синонимов добавлено: ${synonymsAdded}`);
      console.log(`   - Всего продуктов с пометкой "Сенной": ${products.length}`);
      
      // Проверяем результат
      const sennoyProducts = await sequelize.query(
        "SELECT product_name, unit, technical_note FROM nomenclature_cache WHERE technical_note = 'Сенной'",
        { type: sequelize.QueryTypes.SELECT }
      );
      
      console.log('\n📋 Продукты с пометкой "Сенной":');
      sennoyProducts.forEach(p => {
        console.log(`   - ${p.product_name} (${p.unit})`);
      });
      
    } catch (error) {
      await t.rollback();
      throw error;
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при добавлении:', error);
    process.exit(1);
  }
}

addSennoyProducts();