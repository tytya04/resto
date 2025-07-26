const { sequelize } = require('./src/database/models');

async function checkDatabaseLocks() {
  try {
    console.log('Проверка блокировок базы данных...\n');
    
    // Проверяем текущий режим журнала
    const [journalMode] = await sequelize.query('PRAGMA journal_mode;');
    console.log('Режим журнала:', journalMode[0].journal_mode);
    
    // Проверяем таймаут ожидания
    const [busyTimeout] = await sequelize.query('PRAGMA busy_timeout;');
    console.log('Таймаут ожидания:', busyTimeout[0].timeout, 'мс');
    
    // Проверяем открытые транзакции
    const [dbList] = await sequelize.query('PRAGMA database_list;');
    console.log('\nБазы данных:', dbList);
    
    // Принудительный checkpoint для WAL
    console.log('\nВыполняем checkpoint...');
    await sequelize.query('PRAGMA wal_checkpoint(TRUNCATE);');
    
    // Оптимизация базы
    console.log('Оптимизация базы данных...');
    await sequelize.query('VACUUM;');
    
    console.log('\n✅ База данных оптимизирована');
    
    process.exit(0);
  } catch (error) {
    console.error('Ошибка:', error);
    process.exit(1);
  }
}

checkDatabaseLocks();