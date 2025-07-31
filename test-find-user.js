const { User, Restaurant } = require('./src/database/models');

async function findTestUser() {
  try {
    // Находим пользователей с ролью restaurant
    const users = await User.findAll({
      where: { role: 'restaurant' },
      include: [{
        model: Restaurant,
        as: 'restaurant'
      }],
      limit: 5
    });
    
    console.log(`Найдено ${users.length} пользователей с ролью restaurant:\n`);
    
    users.forEach(user => {
      console.log(`ID: ${user.id}`);
      console.log(`Username: ${user.username}`);
      console.log(`Restaurant ID: ${user.restaurant_id}`);
      if (user.restaurant) {
        console.log(`Restaurant Name: ${user.restaurant.name}`);
      }
      console.log('---');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Ошибка:', error);
    process.exit(1);
  }
}

findTestUser();