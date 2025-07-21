const sequelize = require('../config');
const User = require('./User');
const Restaurant = require('./Restaurant');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const NomenclatureCache = require('./NomenclatureCache');
const ProductSynonym = require('./ProductSynonym');
const RegistrationRequest = require('./RegistrationRequest');
const Settings = require('./Settings');
const Purchase = require('./Purchase');
const PriceHistory = require('./PriceHistory');
const ScheduledOrder = require('./ScheduledOrder');

// Инициализируем модели, которые определены как функции
const DraftOrder = require('./DraftOrder')(sequelize);
const DraftOrderItem = require('./DraftOrderItem')(sequelize);
const RestaurantBranch = require('./RestaurantBranch')(sequelize);

// Определение связей между моделями

// User - Restaurant
User.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id',
  as: 'restaurant'
});
Restaurant.hasMany(User, { 
  foreignKey: 'restaurant_id',
  as: 'users'
});

// Order - Restaurant
Order.belongsTo(Restaurant, { 
  foreignKey: 'restaurant_id',
  as: 'restaurant'
});
Restaurant.hasMany(Order, { 
  foreignKey: 'restaurant_id',
  as: 'orders'
});

// Order - User
Order.belongsTo(User, { 
  foreignKey: 'user_id',
  as: 'user'
});
User.hasMany(Order, { 
  foreignKey: 'user_id',
  as: 'orders'
});

// Order - User (processed_by)
Order.belongsTo(User, {
  foreignKey: 'processed_by',
  as: 'processor'
});

// Order - User (approved_by)
Order.belongsTo(User, {
  foreignKey: 'approved_by',
  as: 'approver'
});

// Order - User (rejected_by)
Order.belongsTo(User, {
  foreignKey: 'rejected_by',
  as: 'rejector'
});

// Order - OrderItem
Order.hasMany(OrderItem, { 
  foreignKey: 'order_id',
  as: 'orderItems',
  onDelete: 'CASCADE'
});
OrderItem.belongsTo(Order, { 
  foreignKey: 'order_id',
  as: 'order'
});

// RegistrationRequest - User (processed_by)
RegistrationRequest.belongsTo(User, {
  foreignKey: 'processed_by',
  as: 'processor'
});

// Settings - Restaurant
Settings.belongsTo(Restaurant, {
  foreignKey: 'restaurant_id',
  as: 'restaurant'
});

// Purchase - User (buyer)
Purchase.belongsTo(User, {
  foreignKey: 'buyer_id',
  as: 'buyer'
});

// PriceHistory - User
PriceHistory.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

// PriceHistory - Restaurant
PriceHistory.belongsTo(Restaurant, {
  foreignKey: 'restaurant_id',
  as: 'restaurant'
});

// ScheduledOrder - Restaurant
ScheduledOrder.belongsTo(Restaurant, {
  foreignKey: 'restaurant_id',
  as: 'restaurant'
});
Restaurant.hasMany(ScheduledOrder, {
  foreignKey: 'restaurant_id',
  as: 'scheduledOrders'
});

// ScheduledOrder - User (created_by)
ScheduledOrder.belongsTo(User, {
  foreignKey: 'created_by',
  as: 'creator'
});

// DraftOrder - Restaurant
DraftOrder.belongsTo(Restaurant, {
  foreignKey: 'restaurant_id',
  as: 'restaurant'
});
Restaurant.hasMany(DraftOrder, {
  foreignKey: 'restaurant_id',
  as: 'draftOrders'
});

// Restaurant - RestaurantBranch
Restaurant.hasMany(RestaurantBranch, {
  foreignKey: 'restaurantId',
  as: 'branches'
});
RestaurantBranch.belongsTo(Restaurant, {
  foreignKey: 'restaurantId',
  as: 'restaurant'
});

// DraftOrder - RestaurantBranch
DraftOrder.belongsTo(RestaurantBranch, {
  foreignKey: 'branchId',
  as: 'branch'
});
RestaurantBranch.hasMany(DraftOrder, {
  foreignKey: 'branchId',
  as: 'draftOrders'
});

// DraftOrder - User
DraftOrder.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});
User.hasMany(DraftOrder, {
  foreignKey: 'user_id',
  as: 'draftOrders'
});

// DraftOrder - DraftOrderItem
DraftOrder.hasMany(DraftOrderItem, {
  foreignKey: 'draft_order_id',
  as: 'draftOrderItems',
  onDelete: 'CASCADE'
});
DraftOrderItem.belongsTo(DraftOrder, {
  foreignKey: 'draft_order_id',
  as: 'draftOrder'
});

// DraftOrderItem - User
DraftOrderItem.belongsTo(User, {
  foreignKey: 'added_by',
  as: 'addedByUser'
});

// DraftOrderItem - NomenclatureCache
DraftOrderItem.belongsTo(NomenclatureCache, {
  foreignKey: 'matched_product_id',
  as: 'matchedProduct'
});

module.exports = {
  sequelize,
  User,
  Restaurant,
  RestaurantBranch,
  Order,
  OrderItem,
  NomenclatureCache,
  ProductSynonym,
  RegistrationRequest,
  Settings,
  Purchase,
  PriceHistory,
  ScheduledOrder,
  DraftOrder,
  DraftOrderItem
};