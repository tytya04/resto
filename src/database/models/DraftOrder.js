const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DraftOrder = sequelize.define('DraftOrder', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    restaurant_id: {
      type: DataTypes.INTEGER,
      references: {
        model: 'restaurants',
        key: 'id'
      },
      allowNull: false
    },
    branch_id: {
      type: DataTypes.INTEGER,
      references: {
        model: 'restaurant_branches',
        key: 'id'
      },
      allowNull: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      references: {
        model: 'users',
        key: 'id'
      },
      allowNull: false
    },
    scheduled_for: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Дата и время отправки заказа'
    },
    status: {
      type: DataTypes.ENUM('draft', 'sent', 'cancelled'),
      defaultValue: 'draft'
    },
    last_modified: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'draft_orders',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['restaurant_id', 'branch_id', 'scheduled_for', 'status'],
        unique: true,
        where: {
          status: 'draft'
        }
      },
      {
        fields: ['status', 'scheduled_for']
      },
      {
        fields: ['restaurant_id', 'status']
      },
      {
        fields: ['branch_id']
      }
    ]
  });

  // Associations are defined in index.js to avoid duplicates

  return DraftOrder;
};