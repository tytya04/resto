module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Создание таблицы restaurants
    await queryInterface.createTable('restaurants', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: Sequelize.STRING(200),
        allowNull: false
      },
      legal_name: {
        type: Sequelize.STRING(300),
        allowNull: true
      },
      inn: {
        type: Sequelize.STRING(12),
        allowNull: true,
        unique: true
      },
      address: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      contact_person: {
        type: Sequelize.STRING(200),
        allowNull: true
      },
      contact_phone: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      contact_email: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      delivery_address: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Создание таблицы users
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      telegram_id: {
        type: Sequelize.BIGINT,
        unique: true,
        allowNull: false
      },
      username: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      role: {
        type: Sequelize.ENUM('restaurant', 'manager', 'buyer', 'admin'),
        defaultValue: 'restaurant',
        allowNull: false
      },
      restaurant_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'restaurants',
          key: 'id'
        }
      },
      first_name: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      last_name: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Создание таблицы orders
    await queryInterface.createTable('orders', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      restaurant_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'restaurants',
          key: 'id'
        }
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      status: {
        type: Sequelize.ENUM('draft', 'sent', 'processing', 'confirmed', 'completed'),
        defaultValue: 'draft',
        allowNull: false
      },
      total_amount: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0
      },
      sent_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      confirmed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      delivery_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      order_number: {
        type: Sequelize.STRING(20),
        unique: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Создание таблицы order_items
    await queryInterface.createTable('order_items', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'orders',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      product_name: {
        type: Sequelize.STRING(300),
        allowNull: false
      },
      quantity: {
        type: Sequelize.DECIMAL(10, 3),
        allowNull: false,
        defaultValue: 0
      },
      unit: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'шт'
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      total: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Создание таблицы nomenclature_cache
    await queryInterface.createTable('nomenclature_cache', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      product_name: {
        type: Sequelize.STRING(300),
        allowNull: false,
        unique: true
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      unit: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'шт'
      },
      last_purchase_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      last_sale_price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      supplier: {
        type: Sequelize.STRING(200),
        allowNull: true
      },
      article: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      barcode: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      min_order_quantity: {
        type: Sequelize.DECIMAL(10, 3),
        allowNull: true
      },
      last_update: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Создание индексов
    await queryInterface.addIndex('users', ['telegram_id']);
    await queryInterface.addIndex('users', ['role']);
    await queryInterface.addIndex('users', ['restaurant_id']);
    
    await queryInterface.addIndex('restaurants', ['name']);
    await queryInterface.addIndex('restaurants', ['inn']);
    
    await queryInterface.addIndex('orders', ['restaurant_id']);
    await queryInterface.addIndex('orders', ['user_id']);
    await queryInterface.addIndex('orders', ['status']);
    await queryInterface.addIndex('orders', ['created_at']);
    await queryInterface.addIndex('orders', ['order_number']);
    
    await queryInterface.addIndex('order_items', ['order_id']);
    await queryInterface.addIndex('order_items', ['product_name']);
    
    await queryInterface.addIndex('nomenclature_cache', ['product_name']);
    await queryInterface.addIndex('nomenclature_cache', ['category']);
    await queryInterface.addIndex('nomenclature_cache', ['article']);
    await queryInterface.addIndex('nomenclature_cache', ['barcode']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('order_items');
    await queryInterface.dropTable('orders');
    await queryInterface.dropTable('users');
    await queryInterface.dropTable('restaurants');
    await queryInterface.dropTable('nomenclature_cache');
  }
};