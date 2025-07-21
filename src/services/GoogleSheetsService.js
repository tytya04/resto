const { google } = require('googleapis');
const Fuse = require('fuse.js');
const cron = require('node-cron');
const config = require('../config');
const logger = require('../utils/logger');
const { NomenclatureCache, PriceHistory } = require('../database/models');

class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.fuseInstance = null;
    this.cacheData = [];
    this.lastUpdateTime = null;
    this.isInitialized = false;
    this.updateTask = null;
  }

  async initialize() {
    try {
      if (!config.googleSheets.spreadsheetId || !config.googleSheets.privateKey) {
        logger.warn('Google Sheets configuration is missing. Service will work in offline mode.');
        await this.loadCacheFromDB();
        return false;
      }

      // Настройка аутентификации через Service Account
      const auth = new google.auth.JWT({
        email: config.googleSheets.serviceAccountEmail,
        key: config.googleSheets.privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      this.sheets = google.sheets({ version: 'v4', auth });
      
      // Загрузка данных при инициализации
      await this.loadNomenclature();
      
      // Настройка планировщика обновления кэша
      this.setupCacheUpdateSchedule();
      
      this.isInitialized = true;
      logger.info('GoogleSheetsService initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize GoogleSheetsService:', error);
      await this.loadCacheFromDB();
      return false;
    }
  }

  async loadNomenclature() {
    try {
      if (!this.sheets) {
        throw new Error('Google Sheets not initialized');
      }

      logger.info('Loading nomenclature from Google Sheets...');
      
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: config.googleSheets.spreadsheetId,
        range: config.googleSheets.range,
      });

      const rows = response.data.values;
      
      if (!rows || rows.length === 0) {
        logger.warn('No data found in Google Sheets');
        return;
      }

      // Пропускаем заголовок таблицы
      const headers = rows[0];
      const dataRows = rows.slice(1);

      const products = dataRows.map(row => ({
        product_name: row[0] || '',
        category: row[1] || '',
        unit: row[2] || 'шт',
        last_purchase_price: parseFloat(row[3]) || null,
        last_sale_price: parseFloat(row[4]) || null,
        last_update: new Date()
      })).filter(product => product.product_name);

      // Обновление кэша в БД
      await this.updateCache(products);
      
      logger.info(`Loaded ${products.length} products from Google Sheets`);
      this.lastUpdateTime = new Date();
      
      return products;
    } catch (error) {
      logger.error('Error loading nomenclature from Google Sheets:', error);
      throw error;
    }
  }

  async updateCache(products = null) {
    try {
      if (!products) {
        // Если продукты не переданы, загружаем их из Google Sheets
        products = await this.loadNomenclature();
      }

      if (!products || products.length === 0) {
        logger.warn('No products to update in cache');
        return;
      }

      // Обновление или создание записей в БД
      for (const product of products) {
        await NomenclatureCache.upsert({
          product_name: product.product_name,
          category: product.category,
          unit: product.unit,
          last_purchase_price: product.last_purchase_price,
          last_sale_price: product.last_sale_price,
          last_update: new Date()
        }, {
          where: { product_name: product.product_name }
        });
      }

      // Обновление локального кэша
      await this.loadCacheFromDB();
      
      logger.info(`Cache updated with ${products.length} products`);
    } catch (error) {
      logger.error('Error updating cache:', error);
      throw error;
    }
  }

  async loadCacheFromDB() {
    try {
      this.cacheData = await NomenclatureCache.findAll({
        attributes: ['product_name', 'category', 'unit', 'last_purchase_price', 'last_sale_price'],
        raw: true
      });

      // Настройка Fuse.js для нечеткого поиска
      this.fuseInstance = new Fuse(this.cacheData, {
        keys: ['product_name', 'category'],
        includeScore: true,
        threshold: 0.4,
        minMatchCharLength: 2,
        shouldSort: true,
        isCaseSensitive: false,
        findAllMatches: true,
        ignoreLocation: true
      });

      logger.info(`Loaded ${this.cacheData.length} products from database cache`);
    } catch (error) {
      logger.error('Error loading cache from database:', error);
      throw error;
    }
  }

  searchProducts(query, limit = 10) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    if (!this.fuseInstance) {
      logger.warn('Fuse instance not initialized, loading from DB...');
      this.loadCacheFromDB();
      return [];
    }

    // Поиск с использованием Fuse.js
    const results = this.fuseInstance.search(query);
    
    // Возвращаем топ результатов с форматированием
    return results
      .slice(0, limit)
      .map(result => ({
        ...result.item,
        score: result.score,
        matchedOn: this.getMatchedFields(result)
      }));
  }

  getMatchedFields(fuseResult) {
    const matched = [];
    if (fuseResult.matches) {
      fuseResult.matches.forEach(match => {
        if (match.key === 'product_name') matched.push('название');
        if (match.key === 'category') matched.push('категория');
      });
    }
    return matched.join(', ');
  }

  async getProductByName(productName) {
    try {
      const product = await NomenclatureCache.findOne({
        where: { product_name: productName }
      });
      return product;
    } catch (error) {
      logger.error('Error getting product by name:', error);
      return null;
    }
  }

  async getProductsByCategory(category) {
    try {
      const products = await NomenclatureCache.findAll({
        where: { category },
        order: [['product_name', 'ASC']]
      });
      return products;
    } catch (error) {
      logger.error('Error getting products by category:', error);
      return [];
    }
  }

  async getCategories() {
    try {
      const categories = await NomenclatureCache.findAll({
        attributes: [[NomenclatureCache.sequelize.fn('DISTINCT', NomenclatureCache.sequelize.col('category')), 'category']],
        where: {
          category: {
            [NomenclatureCache.sequelize.Op.ne]: null
          }
        },
        raw: true
      });
      return categories.map(c => c.category).filter(Boolean);
    } catch (error) {
      logger.error('Error getting categories:', error);
      return [];
    }
  }

  setupCacheUpdateSchedule() {
    if (this.updateTask) {
      this.updateTask.stop();
    }

    // Настройка cron задачи для обновления кэша
    this.updateTask = cron.schedule(config.cacheUpdateSchedule, async () => {
      logger.info('Starting scheduled cache update...');
      try {
        await this.loadNomenclature();
        logger.info('Scheduled cache update completed');
      } catch (error) {
        logger.error('Scheduled cache update failed:', error);
      }
    });

    logger.info(`Cache update scheduled with pattern: ${config.cacheUpdateSchedule}`);
  }

  async manualUpdate() {
    try {
      logger.info('Starting manual cache update...');
      await this.loadNomenclature();
      return {
        success: true,
        productsCount: this.cacheData.length,
        lastUpdate: this.lastUpdateTime
      };
    } catch (error) {
      logger.error('Manual cache update failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  getStats() {
    return {
      isInitialized: this.isInitialized,
      productsInCache: this.cacheData.length,
      lastUpdateTime: this.lastUpdateTime,
      categories: [...new Set(this.cacheData.map(p => p.category).filter(Boolean))].length
    };
  }

  // Обновление цен в Google Sheets на основе фактических закупок
  async updatePricesFromPurchases(daysBack = 30) {
    try {
      if (!this.sheets) {
        throw new Error('Google Sheets not initialized');
      }

      logger.info('Updating prices in Google Sheets from recent purchases...');
      
      // Получаем средние закупочные цены за последний период
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - daysBack);
      
      const avgPrices = await PriceHistory.findAll({
        where: {
          price_type: 'purchase',
          effective_date: {
            [PriceHistory.sequelize.Op.gte]: dateFrom
          }
        },
        attributes: [
          'product_name',
          'unit',
          [PriceHistory.sequelize.fn('AVG', PriceHistory.sequelize.col('price')), 'avg_price'],
          [PriceHistory.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['product_name', 'unit'],
        having: PriceHistory.sequelize.literal('count > 2') // Минимум 3 закупки для надежности
      });

      if (avgPrices.length === 0) {
        logger.info('No reliable price data found for update');
        return { updated: 0 };
      }

      // Загружаем текущие данные из таблицы
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: config.googleSheets.spreadsheetId,
        range: config.googleSheets.range,
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        throw new Error('No data found in Google Sheets');
      }

      // Создаем map для быстрого поиска
      const priceMap = {};
      avgPrices.forEach(item => {
        const key = `${item.product_name}_${item.unit}`;
        priceMap[key] = parseFloat(item.get('avg_price'));
      });

      // Обновляем цены в массиве
      let updatedCount = 0;
      const headers = rows[0];
      const dataRows = rows.slice(1);
      
      const updatedRows = dataRows.map((row, index) => {
        const productName = row[0];
        const unit = row[2] || 'шт';
        const key = `${productName}_${unit}`;
        
        if (priceMap[key]) {
          row[3] = priceMap[key].toFixed(2); // Обновляем закупочную цену
          updatedCount++;
          
          // Обновляем продажную цену с наценкой 30% (можно настроить)
          const markup = 1.3;
          row[4] = (priceMap[key] * markup).toFixed(2);
        }
        
        return row;
      });

      // Записываем обновленные данные обратно в Google Sheets
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: config.googleSheets.spreadsheetId,
        range: config.googleSheets.range,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [headers, ...updatedRows]
        }
      });

      // Обновляем локальный кэш
      await this.loadNomenclature();
      
      logger.info(`Updated ${updatedCount} product prices in Google Sheets`);
      return { updated: updatedCount };
      
    } catch (error) {
      logger.error('Error updating prices in Google Sheets:', error);
      throw error;
    }
  }

  // Получение рекомендованной цены продажи на основе истории
  async getSuggestedSalePrice(productName, unit, markupPercent = 30) {
    try {
      // Получаем последнюю закупочную цену
      const latestPurchase = await PriceHistory.getLatestPrice(productName, unit, 'purchase');
      
      if (!latestPurchase) {
        // Если нет истории закупок, берем из номенклатуры
        const product = await this.getProductByName(productName);
        if (product && product.last_purchase_price) {
          return product.last_purchase_price * (1 + markupPercent / 100);
        }
        return null;
      }
      
      // Рассчитываем рекомендованную цену с наценкой
      return latestPurchase.price * (1 + markupPercent / 100);
      
    } catch (error) {
      logger.error('Error getting suggested sale price:', error);
      return null;
    }
  }

  destroy() {
    if (this.updateTask) {
      this.updateTask.stop();
      this.updateTask = null;
    }
  }
}

// Создание синглтона
const googleSheetsService = new GoogleSheetsService();

module.exports = googleSheetsService;