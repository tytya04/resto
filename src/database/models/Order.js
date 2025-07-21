const { DataTypes } = require('sequelize');
const sequelize = require('../config');

const Order = sequelize.define('orders', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  restaurant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'restaurants',
      key: 'id'
    }
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('draft', 'sent', 'processing', 'approved', 'rejected', 'completed', 'cancelled'),
    defaultValue: 'draft',
    allowNull: false
  },
  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  sent_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  confirmed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  delivery_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  order_number: {
    type: DataTypes.STRING(20),
    unique: true
  },
  processed_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  processed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  approved_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  rejected_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  rejected_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  manager_comment: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  items_json: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('items_json');
      return rawValue ? JSON.parse(rawValue) : [];
    },
    set(value) {
      this.setDataValue('items_json', JSON.stringify(value));
    }
  }
}, {
  indexes: [
    {
      fields: ['restaurant_id']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_at']
    },
    {
      unique: true,
      fields: ['order_number']
    }
  ]
});

// Метод проверки возможности редактирования заказа
Order.prototype.canEdit = function() {
  // Заказ можно редактировать только в статусе draft
  return this.status === 'draft';
};

// Статический метод для проверки возможности редактирования
Order.canEditOrder = async function(orderId) {
  const order = await this.findByPk(orderId);
  if (!order) return false;
  return order.canEdit();
};

module.exports = Order;