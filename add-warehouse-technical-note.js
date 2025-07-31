const { NomenclatureCache } = require('./src/database/models');
const sequelize = require('./src/database/config');

async function addWarehouseTechnicalNote() {
  try {
    // Продукты для пометки "Склад"
    const warehouseProducts = [
      'Баклажан местный',
      'Брокколи',
      'Кабачки',
      'Капуста белокочанная',
      'Капуста красная',
      'Капуста пекинская',
      'Капуста цветная',
      'Картофель любой',
      'Картофель белый',
      'Картофель красный',
      'Картофель мелкий 100 грамм',
      'Кукуруза',
      'Лук красный',
      'Лук репчатый',
      'Морковь',
      'Морковь крупная',
      'Перец местный',
      'Свекла',
      'Тыква'
    ];

    const t = await sequelize.transaction();
    
    try {
      let updatedCount = 0;
      let notFoundCount = 0;
      let alreadyMarkedCount = 0;
      
      console.log('🏭 Добавление технической пометки "Склад" к продуктам...\n');
      
      for (const productName of warehouseProducts) {
        // Ищем основной продукт
        const product = await NomenclatureCache.findOne({
          where: { product_name: productName },
          transaction: t
        });
        
        if (!product) {
          console.log(`❌ Не найден: ${productName}`);
          notFoundCount++;
          continue;
        }
        
        // Проверяем, не имеет ли уже техническую пометку
        if (product.technical_note === 'Склад') {
          console.log(`ℹ️  Уже помечен: ${productName}`);
          alreadyMarkedCount++;
          continue;
        }
        
        // Обновляем техническую пометку
        await sequelize.query(
          `UPDATE nomenclature_cache 
           SET technical_note = ?, updated_at = ?
           WHERE product_name = ?`,
          {
            replacements: [
              'Склад',
              new Date(),
              productName
            ],
            type: sequelize.QueryTypes.UPDATE,
            transaction: t
          }
        );
        
        console.log(`✅ Обновлен: ${productName} - добавлена пометка "Склад"`);
        updatedCount++;
        
        // Также обновляем варианты продукта (с единицами измерения)
        const { Op } = require('sequelize');
        const variants = await NomenclatureCache.findAll({
          where: { 
            product_name: {
              [Op.like]: `${productName} (%)`
            }
          },
          transaction: t
        });
        
        for (const variant of variants) {
          if (variant.technical_note !== 'Склад') {
            await sequelize.query(
              `UPDATE nomenclature_cache 
               SET technical_note = ?, updated_at = ?
               WHERE id = ?`,
              {
                replacements: [
                  'Склад',
                  new Date(),
                  variant.id
                ],
                type: sequelize.QueryTypes.UPDATE,
                transaction: t
              }
            );
            console.log(`   ✅ Также обновлен вариант: ${variant.product_name}`);
          }
        }
      }
      
      await t.commit();
      
      console.log('\n✨ Добавление технической пометки "Склад" завершено!');
      console.log(`📊 Статистика:`);
      console.log(`   - Продуктов обновлено: ${updatedCount}`);
      console.log(`   - Уже имели пометку: ${alreadyMarkedCount}`);
      console.log(`   - Не найдено в базе: ${notFoundCount}`);
      
      // Проверяем результат
      const warehouseProductsInDb = await sequelize.query(
        "SELECT product_name, unit, category FROM nomenclature_cache WHERE technical_note = 'Склад' ORDER BY product_name",
        { type: sequelize.QueryTypes.SELECT }
      );
      
      console.log(`\n📋 Всего продуктов с пометкой "Склад": ${warehouseProductsInDb.length}`);
      console.log('\nСписок продуктов:');
      warehouseProductsInDb.forEach(p => {
        console.log(`   - ${p.product_name} (${p.unit}) [${p.category}]`);
      });
      
    } catch (error) {
      await t.rollback();
      throw error;
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при добавлении пометки:', error);
    process.exit(1);
  }
}

addWarehouseTechnicalNote();