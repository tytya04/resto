const { NomenclatureCache } = require('./src/database/models');
const sequelize = require('./src/database/config');

async function fixWarehouseCategories() {
  try {
    // Распределение продуктов по правильным категориям
    const categoryMapping = {
      'Овощи': [
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
      ],
      'Фрукты': [
        // Здесь будут фрукты, если они есть в списке "Склад"
      ],
      'Цитрусы': [
        // Здесь будут цитрусы, если они есть в списке "Склад"
      ]
    };

    const t = await sequelize.transaction();
    
    try {
      console.log('🔄 Исправление категорий для продуктов с пометкой "Склад"...\n');
      
      let updatedCount = 0;
      
      // Сначала получим все продукты с пометкой "Склад"
      const warehouseProducts = await NomenclatureCache.findAll({
        where: { technical_note: 'Склад' },
        transaction: t
      });
      
      console.log(`📋 Найдено продуктов с пометкой "Склад": ${warehouseProducts.length}\n`);
      
      // Обновляем категории
      for (const [category, products] of Object.entries(categoryMapping)) {
        for (const productName of products) {
          // Обновляем основной продукт
          const result = await sequelize.query(
            `UPDATE nomenclature_cache 
             SET category = ?, updated_at = ?
             WHERE product_name = ? AND technical_note = 'Склад'`,
            {
              replacements: [
                category,
                new Date(),
                productName
              ],
              type: sequelize.QueryTypes.UPDATE,
              transaction: t
            }
          );
          
          if (result[1] > 0) {
            console.log(`✅ ${productName} → категория "${category}"`);
            updatedCount++;
          }
          
          // Обновляем варианты продукта
          await sequelize.query(
            `UPDATE nomenclature_cache 
             SET category = ?, updated_at = ?
             WHERE product_name LIKE ? AND technical_note = 'Склад'`,
            {
              replacements: [
                category,
                new Date(),
                `${productName} (%)`
              ],
              type: sequelize.QueryTypes.UPDATE,
              transaction: t
            }
          );
        }
      }
      
      await t.commit();
      
      console.log('\n✨ Категории исправлены!');
      console.log(`📊 Обновлено продуктов: ${updatedCount}`);
      
      // Проверяем результат
      console.log('\n📋 Распределение продуктов "Склад" по категориям:');
      
      const stats = await sequelize.query(
        `SELECT category, COUNT(*) as count 
         FROM nomenclature_cache 
         WHERE technical_note = 'Склад' 
         GROUP BY category 
         ORDER BY category`,
        { type: sequelize.QueryTypes.SELECT }
      );
      
      stats.forEach(stat => {
        console.log(`   - ${stat.category}: ${stat.count} продуктов`);
      });
      
      // Показываем примеры
      console.log('\nПримеры продуктов:');
      for (const category of ['Овощи', 'Фрукты', 'Цитрусы']) {
        const examples = await sequelize.query(
          `SELECT product_name, unit 
           FROM nomenclature_cache 
           WHERE technical_note = 'Склад' AND category = ?
           ORDER BY product_name
           LIMIT 5`,
          { 
            replacements: [category],
            type: sequelize.QueryTypes.SELECT 
          }
        );
        
        if (examples.length > 0) {
          console.log(`\n${category}:`);
          examples.forEach(p => {
            console.log(`   - ${p.product_name} (${p.unit})`);
          });
        }
      }
      
    } catch (error) {
      await t.rollback();
      throw error;
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при исправлении категорий:', error);
    process.exit(1);
  }
}

fixWarehouseCategories();