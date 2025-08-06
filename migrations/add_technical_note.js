const { QueryInterface, DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface) => {
    // Добавляем колонку technical_note в таблицу nomenclature_caches
    await queryInterface.addColumn('nomenclature_caches', 'technical_note', {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null
    });

    // Обновляем продукты с пометкой "Сенной"
    await queryInterface.sequelize.query(`
      UPDATE nomenclature_caches 
      SET technical_note = 'Сенной'
      WHERE product_name IN ('Микрозелень', 'Микс салата без романо', 'Микс салата весовой')
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('nomenclature_caches', 'technical_note');
  }
};