const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DraftOrderItem = sequelize.define('DraftOrderItem', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    draft_order_id: {
      type: DataTypes.INTEGER,
      references: {
        model: 'draft_orders',
        key: 'id'
      },
      allowNull: false
    },
    product_name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Название продукта из базы'
    },
    original_name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Название, введенное пользователем'
    },
    quantity: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: false
    },
    unit: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('unmatched', 'matched', 'confirmed'),
      defaultValue: 'unmatched',
      comment: 'unmatched - не распознан, matched - найдено соответствие, confirmed - подтвержден пользователем'
    },
    matched_product_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'ID продукта из номенклатуры'
    },
    added_by: {
      type: DataTypes.INTEGER,
      references: {
        model: 'users',
        key: 'id'
      },
      allowNull: false
    },
    added_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'draft_order_items',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['draft_order_id']
      },
      {
        fields: ['status']
      }
    ]
  });

  // Associations are defined in index.js to avoid duplicates

  return DraftOrderItem;
};