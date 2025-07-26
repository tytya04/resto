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
  },
  pool: {
    max: 1,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  retry: {
    match: [
      /SQLITE_BUSY/,
      /SQLITE_LOCKED/
    ],
    max: 5,
    backoffBase: 100,
    backoffExponent: 1.2
  }
});

module.exports = sequelize;