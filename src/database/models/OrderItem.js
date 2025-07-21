const { DataTypes } = require('sequelize');
const sequelize = require('../config');

const OrderItem = sequelize.define('order_items', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'id'
    }
  },
  product_name: {
    type: DataTypes.STRING(300),
    allowNull: false
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: false,
    defaultValue: 0
  },
  unit: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'шт'
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true
  }
}, {
  indexes: [
    {
      fields: ['order_id']
    },
    {
      fields: ['product_name']
    }
  ]
});

module.exports = OrderItem;