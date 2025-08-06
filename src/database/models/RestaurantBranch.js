const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RestaurantBranch = sequelize.define('RestaurantBranch', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    restaurantId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'restaurants',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    address: {
      type: DataTypes.STRING,
      allowNull: false
    },
    isMain: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'restaurant_branches',
    timestamps: true,
    underscored: true
  });

  RestaurantBranch.associate = (models) => {
    RestaurantBranch.belongsTo(models.Restaurant, {
      foreignKey: 'restaurantId',
      as: 'restaurant'
    });
    
    RestaurantBranch.hasMany(models.DraftOrder, {
      foreignKey: 'branchId',
      as: 'draftOrders'
    });
  };

  return RestaurantBranch;
};