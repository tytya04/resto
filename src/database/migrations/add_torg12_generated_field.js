const { DataTypes } = require('sequelize');

async function addTorg12GeneratedField(sequelize) {
  const queryInterface = sequelize.getQueryInterface();
  
  try {
    // Проверяем, существует ли уже поле
    const tableDescription = await queryInterface.describeTable('orders');
    
    if (!tableDescription.torg12_generated) {
      await queryInterface.addColumn('orders', 'torg12_generated', {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false
      });
      
      console.log('✅ Поле torg12_generated добавлено в таблицу orders');
    } else {
      console.log('ℹ️ Поле torg12_generated уже существует в таблице orders');
    }
  } catch (error) {
    console.error('❌ Ошибка при добавлении поля torg12_generated:', error);
    throw error;
  }
}

module.exports = { addTorg12GeneratedField };