const { DataTypes } = require('sequelize');
const sequelize = require('../config');

const NomenclatureCache = sequelize.define('nomenclature_cache', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  product_name: {
    type: DataTypes.STRING(300),
    allowNull: false,
    unique: true
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  unit: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'шт'
  },
  last_purchase_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  last_sale_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  supplier: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  article: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  barcode: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  min_order_quantity: {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: true
  },
  technical_note: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: null
  },
  last_update: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['product_name']
    },
    {
      fields: ['category']
    },
    {
      fields: ['article']
    },
    {
      fields: ['barcode']
    }
  ]
});

module.exports = NomenclatureCache;