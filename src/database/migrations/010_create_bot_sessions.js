module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('bot_sessions', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      key: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: false
      },
      data: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
    
    // Добавляем индекс для быстрого поиска по ключу
    await queryInterface.addIndex('bot_sessions', ['key']);
    
    // Добавляем индекс для быстрой очистки истекших сессий
    await queryInterface.addIndex('bot_sessions', ['expiresAt']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('bot_sessions');
  }
};