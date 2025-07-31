const { NomenclatureCache } = require('./src/database/models');
const sequelize = require('./src/database/config');

async function checkWarehouseProducts() {
  try {
    console.log('📋 Проверка всех продуктов с пометкой "Склад":\n');
    
    // Получаем все продукты с пометкой "Склад"
    const warehouseProducts = await sequelize.query(
      `SELECT product_name, category, unit 
       FROM nomenclature_cache 
       WHERE technical_note = 'Склад' 
       ORDER BY category, product_name`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    // Группируем по категориям
    const byCategory = {};
    warehouseProducts.forEach(product => {
      if (!byCategory[product.category]) {
        byCategory[product.category] = [];
      }
      byCategory[product.category].push(product);
    });
    
    // Выводим по категориям
    Object.entries(byCategory).forEach(([category, products]) => {
      console.log(`\n📂 ${category} (${products.length} продуктов):`);
      products.forEach(p => {
        console.log(`   - ${p.product_name} (${p.unit})`);
      });
    });
    
    console.log(`\n📊 Всего продуктов с пометкой "Склад": ${warehouseProducts.length}`);
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
  
  process.exit(0);
}

checkWarehouseProducts();