const sequelize = require('./src/database/config');
const { QueryTypes } = require('sequelize');

async function addTechnicalNoteField() {
  try {
    // Проверяем, существует ли уже поле technical_note
    const tableInfo = await sequelize.query(
      "PRAGMA table_info(nomenclature_cache)",
      { type: QueryTypes.SELECT }
    );
    
    const hasField = tableInfo.some(column => column.name === 'technical_note');
    
    if (!hasField) {
      // Добавляем поле technical_note
      await sequelize.query(
        "ALTER TABLE nomenclature_cache ADD COLUMN technical_note VARCHAR(200)",
        { type: QueryTypes.RAW }
      );
      console.log('✅ Поле technical_note успешно добавлено в таблицу nomenclature_cache');
    } else {
      console.log('ℹ️ Поле technical_note уже существует');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при добавлении поля:', error);
    process.exit(1);
  }
}

addTechnicalNoteField();