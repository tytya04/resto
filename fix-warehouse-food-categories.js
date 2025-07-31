const { NomenclatureCache } = require('./src/database/models');
const sequelize = require('./src/database/config');

async function fixWarehouseFoodCategories() {
  try {
    // Продукты для перемещения
    const categoryUpdates = [
      // Варенье → Консервация
      { products: ['Варенье малина', 'Варенье кизиловое'], newCategory: 'Консервация' },
      // Специи для брынзы → Специи
      { products: ['Специи для брынзы', 'Специи для брынзы (шт)'], newCategory: 'Специи' }
    ];

    const t = await sequelize.transaction();
    
    try {
      console.log('🔄 Исправление категорий для съедобных продуктов...\n');
      
      let updatedCount = 0;
      
      for (const update of categoryUpdates) {
        console.log(`\n📂 Перемещение в категорию "${update.newCategory}":`);
        
        for (const productName of update.products) {
          const result = await sequelize.query(
            `UPDATE nomenclature_cache 
             SET category = ?, updated_at = ?
             WHERE product_name = ? AND technical_note = 'Склад'`,
            {
              replacements: [
                update.newCategory,
                new Date(),
                productName
              ],
              type: sequelize.QueryTypes.UPDATE,
              transaction: t
            }
          );
          
          if (result[1] > 0) {
            console.log(`✅ ${productName} → "${update.newCategory}"`);
            updatedCount++;
          } else {
            console.log(`⚠️  ${productName} - не найден или уже в правильной категории`);
          }
        }
      }
      
      await t.commit();
      
      console.log('\n✨ Категории исправлены!');
      console.log(`📊 Обновлено продуктов: ${updatedCount}`);
      
      // Показываем итоговое распределение
      console.log('\n📋 Обновленное распределение продуктов "Склад" по категориям:');
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
      
      // Показываем продукты в новых категориях
      console.log('\n📦 Продукты в обновленных категориях:');
      
      // Консервация
      const preserves = await sequelize.query(
        `SELECT product_name, unit 
         FROM nomenclature_cache 
         WHERE technical_note = 'Склад' AND category = 'Консервация'
         ORDER BY product_name`,
        { type: sequelize.QueryTypes.SELECT }
      );
      
      if (preserves.length > 0) {
        console.log('\nКонсервация:');
        preserves.forEach(p => {
          console.log(`   - ${p.product_name} (${p.unit})`);
        });
      }
      
      // Специи (только продукты со складской пометкой)
      const spices = await sequelize.query(
        `SELECT product_name, unit 
         FROM nomenclature_cache 
         WHERE technical_note = 'Склад' AND category = 'Специи'
         ORDER BY product_name`,
        { type: sequelize.QueryTypes.SELECT }
      );
      
      if (spices.length > 0) {
        console.log('\nСпеции (с пометкой "Склад"):');
        spices.forEach(p => {
          console.log(`   - ${p.product_name} (${p.unit})`);
        });
      }
      
      // Хозтовары (что осталось)
      const household = await sequelize.query(
        `SELECT product_name, unit 
         FROM nomenclature_cache 
         WHERE technical_note = 'Склад' AND category = 'Хозтовары'
         ORDER BY product_name`,
        { type: sequelize.QueryTypes.SELECT }
      );
      
      if (household.length > 0) {
        console.log('\nХозтовары:');
        household.forEach(p => {
          console.log(`   - ${p.product_name} (${p.unit})`);
        });
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

fixWarehouseFoodCategories();