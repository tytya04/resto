const { Order, OrderItem, Purchase, PriceHistory, Restaurant, User } = require('../database/models');
const { Op, fn, col, literal } = require('sequelize');
const logger = require('../utils/logger');
const moment = require('moment');

class AnalyticsService {
  // Расчет маржинальности продукта
  static async calculateProductMargin(productName, unit, restaurantId = null) {
    try {
      // Получаем последнюю закупочную цену
      const purchasePrice = await PriceHistory.getLatestPrice(productName, unit, 'purchase');
      
      // Получаем последнюю цену продажи
      const salePrice = await PriceHistory.getLatestPrice(productName, unit, 'sale', restaurantId);
      
      if (!purchasePrice || !salePrice) {
        return null;
      }
      
      const margin = ((salePrice.price - purchasePrice.price) / purchasePrice.price) * 100;
      const markup = ((salePrice.price - purchasePrice.price) / salePrice.price) * 100;
      
      return {
        product_name: productName,
        unit: unit,
        purchase_price: purchasePrice.price,
        sale_price: salePrice.price,
        margin_percent: margin.toFixed(2),
        markup_percent: markup.toFixed(2),
        profit_per_unit: (salePrice.price - purchasePrice.price).toFixed(2)
      };
    } catch (error) {
      logger.error('Error calculating product margin:', error);
      throw error;
    }
  }
  
  // История цен продукта
  static async getProductPriceHistory(productName, unit = null, daysBack = 90) {
    try {
      const dateFrom = moment().subtract(daysBack, 'days').toDate();
      
      const where = {
        product_name: productName,
        effective_date: {
          [Op.gte]: dateFrom
        }
      };
      
      if (unit) {
        where.unit = unit;
      }
      
      const priceHistory = await PriceHistory.findAll({
        where,
        order: [['effective_date', 'DESC']],
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'first_name', 'last_name', 'username']
          },
          {
            model: Restaurant,
            as: 'restaurant',
            attributes: ['id', 'name']
          }
        ]
      });
      
      // Группируем по типам цен
      const grouped = {
        purchase: [],
        sale: [],
        suggested: []
      };
      
      priceHistory.forEach(record => {
        grouped[record.price_type].push({
          date: record.effective_date,
          price: record.price,
          unit: record.unit,
          source: record.source,
          user: record.user,
          restaurant: record.restaurant,
          notes: record.notes
        });
      });
      
      return grouped;
    } catch (error) {
      logger.error('Error getting price history:', error);
      throw error;
    }
  }
  
  // Отчет по рентабельности продуктов
  static async getProfitabilityReport(restaurantId = null, dateFrom = null, dateTo = null) {
    try {
      const where = {
        status: ['approved', 'completed']
      };
      
      if (restaurantId) {
        where.restaurant_id = restaurantId;
      }
      
      if (dateFrom && dateTo) {
        where.created_at = {
          [Op.between]: [dateFrom, dateTo]
        };
      } else {
        // По умолчанию - последние 30 дней
        where.created_at = {
          [Op.gte]: moment().subtract(30, 'days').toDate()
        };
      }
      
      // Получаем все позиции заказов с ценами
      const orderItems = await OrderItem.findAll({
        include: [{
          model: Order,
          as: 'order',
          where,
          attributes: ['id', 'restaurant_id']
        }],
        where: {
          price: { [Op.not]: null },
          total: { [Op.not]: null }
        }
      });
      
      // Группируем по продуктам
      const productStats = {};
      
      for (const item of orderItems) {
        const key = `${item.product_name}_${item.unit}`;
        
        if (!productStats[key]) {
          productStats[key] = {
            product_name: item.product_name,
            unit: item.unit,
            total_quantity: 0,
            total_revenue: 0,
            total_cost: 0,
            orders_count: 0,
            average_sale_price: 0,
            average_purchase_price: 0
          };
        }
        
        // Накапливаем статистику
        productStats[key].total_quantity += parseFloat(item.quantity);
        productStats[key].total_revenue += parseFloat(item.total || 0);
        productStats[key].orders_count += 1;
        
        // Получаем закупочную цену на момент заказа
        const purchasePrice = await PriceHistory.findOne({
          where: {
            product_name: item.product_name,
            unit: item.unit,
            price_type: 'purchase',
            effective_date: {
              [Op.lte]: item.createdAt
            }
          },
          order: [['effective_date', 'DESC']]
        });
        
        if (purchasePrice) {
          productStats[key].total_cost += parseFloat(item.quantity) * parseFloat(purchasePrice.price);
        }
      }
      
      // Рассчитываем показатели
      const report = Object.values(productStats).map(stats => {
        stats.average_sale_price = stats.total_revenue / stats.total_quantity;
        
        if (stats.total_cost > 0) {
          stats.average_purchase_price = stats.total_cost / stats.total_quantity;
          stats.gross_profit = stats.total_revenue - stats.total_cost;
          stats.margin_percent = ((stats.gross_profit / stats.total_revenue) * 100).toFixed(2);
          stats.markup_percent = ((stats.gross_profit / stats.total_cost) * 100).toFixed(2);
        } else {
          stats.gross_profit = 0;
          stats.margin_percent = 0;
          stats.markup_percent = 0;
        }
        
        return stats;
      });
      
      // Сортируем по прибыли
      report.sort((a, b) => b.gross_profit - a.gross_profit);
      
      return report;
    } catch (error) {
      logger.error('Error generating profitability report:', error);
      throw error;
    }
  }
  
  // Сравнение плановой и фактической себестоимости заказа
  static async getOrderCostAnalysis(orderId) {
    try {
      const order = await Order.findByPk(orderId, {
        include: [
          {
            model: OrderItem,
            as: 'orderItems'
          },
          {
            model: Restaurant,
            as: 'restaurant'
          }
        ]
      });
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      const analysis = {
        order_number: order.order_number,
        restaurant: order.restaurant.name,
        status: order.status,
        items: []
      };
      
      let totalPlannedCost = 0;
      let totalActualCost = 0;
      let totalRevenue = 0;
      
      for (const item of order.orderItems) {
        const itemAnalysis = {
          product_name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          sale_price: item.price,
          sale_total: item.total
        };
        
        // Получаем плановую цену (из номенклатуры на момент заказа)
        const plannedPrice = await PriceHistory.findOne({
          where: {
            product_name: item.product_name,
            unit: item.unit,
            price_type: 'suggested',
            effective_date: {
              [Op.lte]: order.created_at
            }
          },
          order: [['effective_date', 'DESC']]
        });
        
        // Получаем фактическую закупочную цену
        const actualPrice = await PriceHistory.findOne({
          where: {
            product_name: item.product_name,
            unit: item.unit,
            price_type: 'purchase',
            effective_date: {
              [Op.lte]: order.created_at
            }
          },
          order: [['effective_date', 'DESC']]
        });
        
        itemAnalysis.planned_purchase_price = plannedPrice?.price || 0;
        itemAnalysis.actual_purchase_price = actualPrice?.price || 0;
        itemAnalysis.planned_cost = itemAnalysis.planned_purchase_price * item.quantity;
        itemAnalysis.actual_cost = itemAnalysis.actual_purchase_price * item.quantity;
        itemAnalysis.cost_variance = itemAnalysis.actual_cost - itemAnalysis.planned_cost;
        itemAnalysis.cost_variance_percent = itemAnalysis.planned_cost > 0 
          ? ((itemAnalysis.cost_variance / itemAnalysis.planned_cost) * 100).toFixed(2)
          : 0;
        
        // Маржа
        if (item.price && itemAnalysis.actual_purchase_price) {
          itemAnalysis.margin = item.price - itemAnalysis.actual_purchase_price;
          itemAnalysis.margin_percent = ((itemAnalysis.margin / item.price) * 100).toFixed(2);
        }
        
        totalPlannedCost += itemAnalysis.planned_cost;
        totalActualCost += itemAnalysis.actual_cost;
        totalRevenue += item.total || 0;
        
        analysis.items.push(itemAnalysis);
      }
      
      // Итоговые показатели
      analysis.summary = {
        total_revenue: totalRevenue,
        total_planned_cost: totalPlannedCost,
        total_actual_cost: totalActualCost,
        cost_variance: totalActualCost - totalPlannedCost,
        cost_variance_percent: totalPlannedCost > 0 
          ? ((totalActualCost - totalPlannedCost) / totalPlannedCost * 100).toFixed(2)
          : 0,
        gross_profit: totalRevenue - totalActualCost,
        gross_margin_percent: totalRevenue > 0 
          ? ((totalRevenue - totalActualCost) / totalRevenue * 100).toFixed(2)
          : 0
      };
      
      return analysis;
    } catch (error) {
      logger.error('Error analyzing order cost:', error);
      throw error;
    }
  }
  
  // Топ продуктов по различным критериям
  static async getTopProducts(criteria = 'revenue', limit = 10, dateFrom = null, dateTo = null) {
    try {
      const where = {
        status: ['approved', 'completed']
      };
      
      if (dateFrom && dateTo) {
        where.created_at = {
          [Op.between]: [dateFrom, dateTo]
        };
      } else {
        where.created_at = {
          [Op.gte]: moment().subtract(30, 'days').toDate()
        };
      }
      
      const orderItems = await OrderItem.findAll({
        attributes: [
          'product_name',
          'unit',
          [fn('SUM', col('quantity')), 'total_quantity'],
          [fn('SUM', col('total')), 'total_revenue'],
          [fn('COUNT', '*'), 'order_count'],
          [fn('AVG', col('price')), 'avg_price']
        ],
        include: [{
          model: Order,
          as: 'order',
          where,
          attributes: []
        }],
        group: ['product_name', 'unit'],
        order: [[
          criteria === 'revenue' ? fn('SUM', col('total')) :
          criteria === 'quantity' ? fn('SUM', col('quantity')) :
          criteria === 'orders' ? fn('COUNT', '*') :
          fn('SUM', col('total')),
          'DESC'
        ]],
        limit
      });
      
      return orderItems.map(item => item.get({ plain: true }));
    } catch (error) {
      logger.error('Error getting top products:', error);
      throw error;
    }
  }
  
  // Анализ динамики цен
  static async getPriceTrends(productName, unit, daysBack = 90) {
    try {
      const dateFrom = moment().subtract(daysBack, 'days').toDate();
      
      const prices = await PriceHistory.findAll({
        where: {
          product_name: productName,
          unit: unit,
          effective_date: {
            [Op.gte]: dateFrom
          }
        },
        order: [['effective_date', 'ASC']]
      });
      
      // Группируем по типам и датам
      const trends = {
        purchase: [],
        sale: [],
        dates: []
      };
      
      const dateMap = {};
      
      prices.forEach(price => {
        const date = moment(price.effective_date).format('YYYY-MM-DD');
        
        if (!dateMap[date]) {
          dateMap[date] = {
            date,
            purchase: null,
            sale: null
          };
        }
        
        if (price.price_type === 'purchase') {
          dateMap[date].purchase = price.price;
        } else if (price.price_type === 'sale') {
          dateMap[date].sale = price.price;
        }
      });
      
      // Преобразуем в массивы для графиков
      Object.values(dateMap).forEach(data => {
        trends.dates.push(data.date);
        trends.purchase.push(data.purchase);
        trends.sale.push(data.sale);
      });
      
      // Рассчитываем изменения
      const purchasePrices = prices.filter(p => p.price_type === 'purchase');
      const salePrices = prices.filter(p => p.price_type === 'sale');
      
      if (purchasePrices.length >= 2) {
        const firstPurchase = purchasePrices[0].price;
        const lastPurchase = purchasePrices[purchasePrices.length - 1].price;
        trends.purchase_change = {
          absolute: lastPurchase - firstPurchase,
          percent: ((lastPurchase - firstPurchase) / firstPurchase * 100).toFixed(2)
        };
      }
      
      if (salePrices.length >= 2) {
        const firstSale = salePrices[0].price;
        const lastSale = salePrices[salePrices.length - 1].price;
        trends.sale_change = {
          absolute: lastSale - firstSale,
          percent: ((lastSale - firstSale) / firstSale * 100).toFixed(2)
        };
      }
      
      return trends;
    } catch (error) {
      logger.error('Error getting price trends:', error);
      throw error;
    }
  }
}

module.exports = AnalyticsService;