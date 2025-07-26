require('dotenv').config();
const { RegistrationRequest, User } = require('./src/database/models');
const logger = require('./src/utils/logger');

(async () => {
  try {
    // Проверяем все заявки на регистрацию
    const requests = await RegistrationRequest.findAll({
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    
    console.log('\n=== Registration Requests ===');
    requests.forEach(req => {
      console.log(`ID: ${req.id}, TelegramID: ${req.telegram_id}, Username: ${req.username}, Status: ${req.status}, Created: ${req.createdAt}`);
      console.log(`  Info: ${req.contact_info}`);
    });
    
    // Проверяем пользователя grassdream
    const grassdreamUser = await User.findOne({
      where: { telegram_id: 6968529444 }
    });
    
    console.log('\n=== Grassdream User ===');
    if (grassdreamUser) {
      console.log('User found:', grassdreamUser.toJSON());
    } else {
      console.log('User not found in database');
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Failed to check registrations:', error);
    process.exit(1);
  }
})();