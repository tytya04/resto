const { DataTypes } = require('sequelize');
const sequelize = require('../config');

const PurchaseItem = sequelize.define('purchase_items', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  purchase_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'purchases',
      key: 'id'
    }
  },
  product_name: {
    type: DataTypes.STRING(300),
    allowNull: false
  },
  unit: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: false,
    comment: 'Необходимое количество'
  },
  required_quantity: {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: false,
    comment: 'Требуемое количество из заказов'
  },
  purchased_quantity: {
    type: DataTypes.DECIMAL(10, 3),
    defaultValue: 0,
    comment: 'Фактически закупленное количество'
  },
  purchase_price: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: 'Цена закупки (себестоимость)'
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'skipped'),
    defaultValue: 'pending'
  },
  consolidated_product_id: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'ID консолидированного продукта'
  },
  purchased_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Дата и время закупки товара'
  }
}, {
  tableName: 'purchase_items',
  timestamps: true,
  indexes: [
    {
      fields: ['purchase_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['consolidated_product_id']
    }
  ]
});

// Связи
PurchaseItem.associate = (models) => {
  PurchaseItem.belongsTo(models.Purchase, {
    foreignKey: 'purchase_id',
    as: 'purchase'
  });
};

module.exports = PurchaseItem;