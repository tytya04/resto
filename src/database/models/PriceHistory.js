const { DataTypes } = require('sequelize');
const sequelize = require('../config');

const PriceHistory = sequelize.define('price_history', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  product_name: {
    type: DataTypes.STRING(300),
    allowNull: false,
    comment: 'Название продукта'
  },
  unit: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Единица измерения'
  },
  price_type: {
    type: DataTypes.ENUM('purchase', 'sale', 'suggested'),
    allowNull: false,
    comment: 'Тип цены: закупочная, продажная, рекомендованная'
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Цена'
  },
  source: {
    type: DataTypes.ENUM('manual', 'purchase', 'order', 'import'),
    allowNull: false,
    default: 'manual',
    comment: 'Источник цены'
  },
  source_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID источника (purchase_id, order_id и т.д.)'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID пользователя, установившего цену'
  },
  restaurant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID ресторана (для цен продажи)'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Примечания'
  },
  effective_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Дата вступления цены в силу'
  }
}, {
  tableName: 'price_history',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['product_name', 'unit', 'price_type', 'effective_date']
    },
    {
      fields: ['source', 'source_id']
    },
    {
      fields: ['restaurant_id']
    }
  ]
});

// Методы экземпляра
PriceHistory.prototype.getFormattedPrice = function() {
  return `${this.price} ₽/${this.unit}`;
};

// Статические методы
PriceHistory.getLatestPrice = async function(productName, unit, priceType, restaurantId = null) {
  const where = {
    product_name: productName,
    unit: unit,
    price_type: priceType
  };
  
  if (priceType === 'sale' && restaurantId) {
    where.restaurant_id = restaurantId;
  }
  
  return this.findOne({
    where,
    order: [['effective_date', 'DESC']],
    limit: 1
  });
};

PriceHistory.getPriceHistory = async function(productName, unit, priceType = null, limit = 10) {
  const where = {
    product_name: productName,
    unit: unit
  };
  
  if (priceType) {
    where.price_type = priceType;
  }
  
  return this.findAll({
    where,
    order: [['effective_date', 'DESC']],
    limit,
    include: [
      {
        model: sequelize.models.users,
        as: 'user',
        attributes: ['id', 'first_name', 'last_name', 'username']
      }
    ]
  });
};

PriceHistory.getAveragePrice = async function(productName, unit, priceType, daysBack = 30) {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - daysBack);
  
  const result = await this.findOne({
    where: {
      product_name: productName,
      unit: unit,
      price_type: priceType,
      effective_date: {
        [sequelize.Sequelize.Op.gte]: dateFrom
      }
    },
    attributes: [
      [sequelize.Sequelize.fn('AVG', sequelize.Sequelize.col('price')), 'average_price'],
      [sequelize.Sequelize.fn('COUNT', '*'), 'count']
    ]
  });
  
  return result?.get({ plain: true }) || { average_price: 0, count: 0 };
};

// Создание записи из закупки
PriceHistory.createFromPurchase = async function(purchase) {
  return this.create({
    product_name: purchase.product_name,
    unit: purchase.unit,
    price_type: 'purchase',
    price: purchase.unit_price,
    source: 'purchase',
    source_id: purchase.id,
    user_id: purchase.buyer_id,
    notes: `Закупка ${purchase.purchased_quantity} ${purchase.unit}`
  });
};

// Создание записи из заказа
PriceHistory.createFromOrderItem = async function(orderItem, order, priceType = 'sale') {
  return this.create({
    product_name: orderItem.product_name,
    unit: orderItem.unit,
    price_type: priceType,
    price: orderItem.price,
    source: 'order',
    source_id: order.id,
    user_id: order.processed_by || order.user_id,
    restaurant_id: order.restaurant_id,
    notes: `Заказ #${order.order_number}`
  });
};

module.exports = PriceHistory;