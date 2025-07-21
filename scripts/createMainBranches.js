const { Restaurant, RestaurantBranch, sequelize } = require('../src/database/models');

async function createMainBranches() {
  try {
    console.log('Creating main branches for existing restaurants...');
    
    const restaurants = await Restaurant.findAll();
    console.log(`Found ${restaurants.length} restaurants`);
    
    for (const restaurant of restaurants) {
      // Check if branch already exists
      const existingBranch = await RestaurantBranch.findOne({
        where: { restaurantId: restaurant.id, isMain: true }
      });
      
      if (!existingBranch) {
        const branch = await RestaurantBranch.create({
          restaurantId: restaurant.id,
          address: restaurant.address || `Главный филиал ${restaurant.name}`,
          isMain: true,
          isActive: true
        });
        console.log(`Created main branch for ${restaurant.name}`);
      } else {
        console.log(`Main branch already exists for ${restaurant.name}`);
      }
    }
    
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

createMainBranches();