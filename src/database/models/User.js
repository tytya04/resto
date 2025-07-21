const { DataTypes } = require('sequelize');
const sequelize = require('../config');

const User = sequelize.define('users', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  telegram_id: {
    type: DataTypes.BIGINT,
    unique: true,
    allowNull: false
  },
  username: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  role: {
    type: DataTypes.ENUM('restaurant', 'manager', 'buyer', 'admin'),
    defaultValue: 'restaurant',
    allowNull: false
  },
  restaurant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'restaurants',
      key: 'id'
    }
  },
  first_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  last_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['telegram_id']
    },
    {
      fields: ['role']
    },
    {
      fields: ['restaurant_id']
    }
  ]
});

module.exports = User;