const { DataTypes } = require('sequelize');
const sequelize = require('../config');

const BotSession = sequelize.define('BotSession', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  key: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  data: {
    type: DataTypes.TEXT,
    allowNull: false,
    get() {
      const rawValue = this.getDataValue('data');
      return rawValue ? JSON.parse(rawValue) : {};
    },
    set(value) {
      this.setDataValue('data', JSON.stringify(value));
    }
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'bot_sessions',
  timestamps: true
});

module.exports = BotSession;