const { DataTypes } = require('sequelize');
const sequelize = require('../config');

const Supplier = sequelize.define('suppliers', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'ООО "ПОСТАВЩИК"'
  },
  inn: {
    type: DataTypes.STRING(12),
    allowNull: true
  },
  kpp: {
    type: DataTypes.STRING(9),
    allowNull: true
  },
  ogrn: {
    type: DataTypes.STRING(15),
    allowNull: true
  },
  legal_address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  postal_address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  contact_phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  fax: {
    type: DataTypes.STRING,
    allowNull: true
  },
  contact_email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bank_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bank_bik: {
    type: DataTypes.STRING(9),
    allowNull: true
  },
  bank_account: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  bank_corr_account: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  director_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  director_position: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'Генеральный директор'
  },
  accountant_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  accountant_position: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'Главный бухгалтер'
  },
  warehouse_responsible: {
    type: DataTypes.STRING,
    allowNull: true
  },
  warehouse_position: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'Заведующий складом'
  },
  okpo: {
    type: DataTypes.STRING(14),
    allowNull: true
  },
  okved: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'suppliers'
});

module.exports = Supplier;