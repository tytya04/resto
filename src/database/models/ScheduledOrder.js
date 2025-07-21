const { DataTypes } = require('sequelize');
const sequelize = require('../config');

const ScheduledOrder = sequelize.define('scheduled_orders', {
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
  schedule_time: {
    type: DataTypes.TIME,
    allowNull: false,
    comment: 'Время отправки заказа (HH:MM)'
  },
  schedule_days: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'JSON массив дней недели (0-6, где 0 - воскресенье)'
  },
  template_items: {
    type: DataTypes.TEXT,
    comment: 'JSON массив шаблонных позиций заказа'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  last_run: {
    type: DataTypes.DATE,
    comment: 'Время последнего выполнения'
  },
  next_run: {
    type: DataTypes.DATE,
    comment: 'Время следующего выполнения'
  },
  created_by: {
    type: DataTypes.INTEGER,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  indexes: [
    {
      fields: ['restaurant_id']
    },
    {
      fields: ['is_active', 'next_run']
    }
  ]
});

module.exports = ScheduledOrder;