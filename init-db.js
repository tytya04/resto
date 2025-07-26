require('dotenv').config();
const { initDatabase } = require('./src/database/init');
const logger = require('./src/utils/logger');

(async () => {
  try {
    logger.info('Starting database initialization...');
    await initDatabase();
    logger.info('Database initialized successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    process.exit(1);
  }
})();