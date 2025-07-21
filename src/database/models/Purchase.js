const { DataTypes } = require('sequelize');
const sequelize = require('../config');

const Purchase = sequelize.define('purchases', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  consolidated_product_id: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'Уникальный идентификатор консолидированного продукта (product_name_unit)'
  },
  product_name: {
    type: DataTypes.STRING(300),
    allowNull: false
  },
  unit: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  total_quantity: {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: false,
    comment: 'Общее количество для закупки'
  },
  purchased_quantity: {
    type: DataTypes.DECIMAL(10, 3),
    defaultValue: 0,
    comment: 'Фактически закупленное количество'
  },
  total_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Общая сумма закупки'
  },
  unit_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Цена за единицу (рассчитывается автоматически)'
  },
  buyer_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  purchase_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  status: {
    type: DataTypes.ENUM('pending', 'partial', 'completed', 'cancelled'),
    defaultValue: 'pending'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // JSON с информацией о заказах
  orders_data: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: 'Информация о заказах: [{order_id, restaurant_id, quantity, allocated_price}]'
  }
}, {
  indexes: [
    {
      fields: ['consolidated_product_id']
    },
    {
      fields: ['purchase_date']
    },
    {
      fields: ['status']
    },
    {
      fields: ['buyer_id']
    }
  ]
});

// Методы для работы с закупками
Purchase.prototype.calculateUnitPrice = function() {
  if (this.total_price && this.purchased_quantity && this.purchased_quantity > 0) {
    this.unit_price = parseFloat(this.total_price) / parseFloat(this.purchased_quantity);
    return this.unit_price;
  }
  return null;
};

// Распределение цены по заказам пропорционально количеству
Purchase.prototype.allocatePriceToOrders = function() {
  if (!this.unit_price || !this.orders_data) return null;
  
  const allocations = this.orders_data.map(orderData => {
    const allocatedPrice = parseFloat(orderData.quantity) * parseFloat(this.unit_price);
    return {
      ...orderData,
      allocated_price: allocatedPrice.toFixed(2)
    };
  });
  
  return allocations;
};

module.exports = Purchase;