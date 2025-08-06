const sequelize = require('./src/database/config');

async function addPackingStatus() {
  try {
    console.log('Добавляем поле packing_status в таблицу orders...');
    
    // Проверяем существующие колонки
    const [results] = await sequelize.query(`PRAGMA table_info(orders)`);
    const columnNames = results.map(col => col.name);
    
    console.log('Существующие колонки orders:', columnNames);
    
    // Добавляем поле packing_status если его нет
    if (!columnNames.includes('packing_status')) {
      await sequelize.query('ALTER TABLE orders ADD COLUMN packing_status VARCHAR(20) DEFAULT NULL');
      console.log('✅ Добавлено поле packing_status');
    } else {
      console.log('✅ Поле packing_status уже существует');
    }
    
    console.log('✅ Миграция завершена');
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

addPackingStatus();