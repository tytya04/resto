const sequelize = require('./src/database/config');

async function fixPurchaseItemsColumns() {
  try {
    console.log('Добавляем отсутствующие колонки в purchase_items...');
    
    // Проверяем существующие колонки
    const [results] = await sequelize.query(`PRAGMA table_info(purchase_items)`);
    const columnNames = results.map(col => col.name);
    
    console.log('Существующие колонки:', columnNames);
    
    // Добавляем отсутствующие колонки
    if (!columnNames.includes('created_at')) {
      await sequelize.query('ALTER TABLE purchase_items ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
      console.log('✅ Добавлена колонка created_at');
    }
    
    if (!columnNames.includes('updated_at')) {
      await sequelize.query('ALTER TABLE purchase_items ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
      console.log('✅ Добавлена колонка updated_at');
    }
    
    // Удаляем существующую активную закупку для теста
    const [deletedCount] = await sequelize.query(
      `DELETE FROM purchases WHERE product_name = 'Закупочная сессия'`
    );
    console.log(`✅ Удалено ${deletedCount} активных закупочных сессий`);
    
    // Удаляем orphaned purchase_items
    await sequelize.query(`DELETE FROM purchase_items WHERE purchase_id NOT IN (SELECT id FROM purchases)`);
    console.log('✅ Удалены orphaned purchase_items');
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

fixPurchaseItemsColumns();