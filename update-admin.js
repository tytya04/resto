require('dotenv').config();
const { User } = require('./src/database/models');
const logger = require('./src/utils/logger');

(async () => {
  try {
    logger.info('Updating admin user...');
    
    // Обновляем существующего администратора
    const [updated] = await User.update(
      { telegram_id: 320661773 },
      { where: { role: 'admin', telegram_id: 123456789 } }
    );
    
    if (updated) {
      logger.info('Admin user updated successfully');
    } else {
      // Если не обновили, создаем нового
      const admin = await User.findOrCreate({
        where: { telegram_id: 320661773 },
        defaults: {
          username: 'admin',
          role: 'admin',
          first_name: 'Admin',
          last_name: 'User',
          is_active: true
        }
      });
      logger.info('Admin user created/found');
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Failed to update admin:', error);
    process.exit(1);
  }
})();