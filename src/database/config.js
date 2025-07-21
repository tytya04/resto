const { Sequelize } = require('sequelize');
const path = require('path');
const logger = require('../utils/logger');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../../database.sqlite'),
  logging: (msg) => logger.debug(msg),
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true
  },
  dialectOptions: {
    // Включаем поддержку внешних ключей в SQLite
    foreignKeys: true
  }
});

module.exports = sequelize;