const { Restaurant, RestaurantBranch, DraftOrder } = require('./src/database/models');

async function checkBranches() {
  try {
    // Находим ресторан Эмбер
    const restaurant = await Restaurant.findOne({
      where: { name: 'Эмбер' }
    });
    
    if (!restaurant) {
      console.log('Ресторан Эмбер не найден');
      return;
    }
    
    console.log('Ресторан:', restaurant.name, 'ID:', restaurant.id);
    
    // Получаем все филиалы
    const branches = await RestaurantBranch.findAll({
      where: { restaurant_id: restaurant.id }
    });
    
    console.log('\nФилиалы в базе данных:');
    branches.forEach(branch => {
      console.log(`- ID: ${branch.id}, Название: ${branch.name}, Активен: ${branch.is_active}`);
    });
    
    // Проверяем черновики заказов
    const drafts = await DraftOrder.findAll({
      where: { restaurant_id: restaurant.id },
      include: [{
        model: RestaurantBranch,
        as: 'branch'
      }]
    });
    
    console.log('\nЧерновики заказов:');
    drafts.forEach(draft => {
      const branchName = draft.branch ? draft.branch.name : 'Без филиала';
      console.log(`- ID: ${draft.id}, Филиал: ${branchName}, Статус: ${draft.status}`);
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

checkBranches();