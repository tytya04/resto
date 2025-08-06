const sequelize = require('./src/database/config');

async function runMigration() {
  try {
    // Добавляем колонку technical_note
    await sequelize.query(`
      ALTER TABLE nomenclature_cache 
      ADD COLUMN technical_note TEXT DEFAULT NULL
    `);
    console.log('✅ Добавлена колонка technical_note');

    // Обновляем продукты с пометкой "Сенной"
    await sequelize.query(`
      UPDATE nomenclature_cache 
      SET technical_note = 'Сенной'
      WHERE product_name IN ('Микрозелень', 'Микс салата без романо', 'Микс салата весовой')
    `);
    console.log('✅ Обновлены продукты с пометкой "Сенной"');

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка миграции:', error.message);
    process.exit(1);
  }
}

runMigration();