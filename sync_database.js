const { sequelize } = require('./src/database/models');

async function syncDatabase() {
  try {
    console.log('Синхронизация базы данных...');
    
    // Синхронизируем все модели с базой данных
    // alter: true обновит существующие таблицы без удаления данных
    await sequelize.sync({ alter: true });
    
    console.log('✅ База данных успешно синхронизирована!');
    
  } catch (error) {
    console.error('❌ Ошибка синхронизации:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

syncDatabase();