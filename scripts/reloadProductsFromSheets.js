require('dotenv').config();
const { NomenclatureCache, sequelize } = require('../src/database/models');
const googleSheetsApiService = require('../src/services/GoogleSheetsApiService');
const logger = require('../src/utils/logger');

async function reloadProducts() {
  try {
    logger.info('Starting to reload products from Google Sheets...');
    
    // Получаем продукты из Google Sheets
    const products = await googleSheetsApiService.getAllProducts();
    
    logger.info(`Fetched ${products.length} products from Google Sheets`);
    
    // Начинаем транзакцию
    const transaction = await sequelize.transaction();
    
    try {
      // Очищаем таблицу продуктов
      await NomenclatureCache.destroy({
        where: {},
        transaction
      });
      
      logger.info('Cleared existing products from database');
      
      // Загружаем новые продукты
      let created = 0;
      for (const product of products) {
        await NomenclatureCache.create({
          product_name: product.product_name,
          category: product.category,
          unit: product.unit,
          source: 'google_sheets',
          last_updated: new Date()
        }, { transaction });
        
        created++;
        
        if (created % 10 === 0) {
          logger.info(`Loaded ${created} products...`);
        }
      }
      
      // Подтверждаем транзакцию
      await transaction.commit();
      
      logger.info(`Successfully loaded ${created} products from Google Sheets`);
      
      // Показываем статистику по категориям
      const stats = await NomenclatureCache.findAll({
        attributes: [
          'category',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['category'],
        order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']]
      });
      
      logger.info('Products by category:');
      stats.forEach(stat => {
        logger.info(`  ${stat.category}: ${stat.dataValues.count} products`);
      });
      
    } catch (error) {
      // Откатываем транзакцию при ошибке
      await transaction.rollback();
      throw error;
    }
    
  } catch (error) {
    logger.error('Error reloading products:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

reloadProducts();