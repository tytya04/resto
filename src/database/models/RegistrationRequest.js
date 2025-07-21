const { DataTypes } = require('sequelize');
const sequelize = require('../config');

const RegistrationRequest = sequelize.define('registration_requests', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  telegram_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  username: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  first_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  last_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  requested_role: {
    type: DataTypes.ENUM('restaurant', 'manager', 'buyer', 'admin', 'unknown'),
    allowNull: false,
    defaultValue: 'unknown'
  },
  contact_info: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Информация от пользователя в свободной форме'
  },
  restaurant_name: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'Название ресторана для новых заявок'
  },
  contact_phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  contact_email: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending'
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
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  indexes: [
    {
      fields: ['telegram_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_at']
    }
  ]
});

module.exports = RegistrationRequest;