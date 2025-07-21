const { DataTypes } = require('sequelize');
const sequelize = require('../config');

const ProductSynonym = sequelize.define('product_synonyms', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  original: {
    type: DataTypes.STRING(300),
    allowNull: false
  },
  synonym: {
    type: DataTypes.STRING(300),
    allowNull: false
  },
  weight: {
    type: DataTypes.FLOAT,
    defaultValue: 1.0,
    comment: 'Вес синонима для ранжирования результатов'
  },
  usage_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Счетчик использования для улучшения ранжирования'
  }
}, {
  indexes: [
    {
      fields: ['synonym']
    },
    {
      fields: ['original']
    },
    {
      unique: true,
      fields: ['original', 'synonym']
    }
  ]
});

module.exports = ProductSynonym;