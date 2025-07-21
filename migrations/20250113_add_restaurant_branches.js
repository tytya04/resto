'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Создаем таблицу филиалов
    await queryInterface.createTable('restaurant_branches', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      restaurantId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'restaurants',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      address: {
        type: Sequelize.STRING,
        allowNull: false
      },
      isMain: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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

    // Добавляем индексы
    await queryInterface.addIndex('restaurant_branches', ['restaurantId']);
    await queryInterface.addIndex('restaurant_branches', ['isActive']);

    // Добавляем колонку branchId в draft_orders
    await queryInterface.addColumn('draft_orders', 'branchId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'restaurant_branches',
        key: 'id'
      },
      onDelete: 'SET NULL'
    });

    // Добавляем индекс для branchId
    await queryInterface.addIndex('draft_orders', ['branchId']);

    // Удаляем старый уникальный индекс
    await queryInterface.removeIndex('draft_orders', ['restaurant_id', 'scheduled_for', 'status']);

    // Создаем новый уникальный индекс с branchId
    await queryInterface.addIndex('draft_orders', ['restaurant_id', 'branchId', 'scheduled_for', 'status'], {
      unique: true,
      where: {
        status: 'draft'
      }
    });

    // Создаем филиалы для существующих ресторанов
    const restaurants = await queryInterface.sequelize.query(
      'SELECT id, name, address FROM restaurants',
      { type: Sequelize.QueryTypes.SELECT }
    );

    for (const restaurant of restaurants) {
      await queryInterface.bulkInsert('restaurant_branches', [{
        restaurantId: restaurant.id,
        address: restaurant.address || `Главный филиал ${restaurant.name}`,
        isMain: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }]);
    }

    // Обновляем существующие черновики, привязывая их к главным филиалам
    await queryInterface.sequelize.query(`
      UPDATE draft_orders
      SET branchId = (
        SELECT id FROM restaurant_branches 
        WHERE restaurantId = draft_orders.restaurant_id AND isMain = 1
        LIMIT 1
      )
      WHERE branchId IS NULL
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Удаляем индексы
    await queryInterface.removeIndex('draft_orders', ['restaurant_id', 'branchId', 'scheduled_for', 'status']);
    await queryInterface.removeIndex('draft_orders', ['branchId']);

    // Восстанавливаем старый индекс
    await queryInterface.addIndex('draft_orders', ['restaurant_id', 'scheduled_for', 'status'], {
      unique: true,
      where: {
        status: 'draft'
      }
    });

    // Удаляем колонку branchId
    await queryInterface.removeColumn('draft_orders', 'branchId');

    // Удаляем таблицу филиалов
    await queryInterface.dropTable('restaurant_branches');
  }
};