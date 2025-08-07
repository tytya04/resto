const { sequelize } = require('./src/database/models');

async function cleanDatabase() {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('Starting database cleanup...');
    
    // Удаляем данные в правильном порядке
    const tables = [
      'price_histories',
      'purchase_items', 
      'purchases',
      'order_items',
      'orders',
      'draft_order_items',
      'draft_orders'
    ];
    
    for (const table of tables) {
      try {
        const [result] = await sequelize.query(`DELETE FROM ${table}`, { transaction });
        console.log(`✓ Cleaned table ${table}`);
      } catch (err) {
        if (err.message.includes('no such table')) {
          console.log(`⊘ Table ${table} does not exist, skipping...`);
        } else {
          throw err;
        }
      }
    }
    
    // Сбрасываем автоинкременты
    try {
      await sequelize.query(`DELETE FROM sqlite_sequence WHERE name IN ('orders', 'order_items', 'draft_orders', 'draft_order_items', 'purchases', 'purchase_items', 'price_histories')`, { transaction });
      console.log('✓ Reset auto-increments');
    } catch (err) {
      console.log('⊘ Could not reset auto-increments');
    }
    
    await transaction.commit();
    
    // Получаем итоговую статистику
    const checkTables = [
      'orders',
      'order_items',
      'draft_orders',
      'draft_order_items',
      'purchases',
      'purchase_items'
    ];
    
    console.log('\nDatabase cleanup completed successfully!');
    console.log('\nTable counts after cleanup:');
    
    for (const table of checkTables) {
      try {
        const [[result]] = await sequelize.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`  ${table}: ${result.count} records`);
      } catch (err) {
        console.log(`  ${table}: table not found`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    await transaction.rollback();
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanDatabase();