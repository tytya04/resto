const { Restaurant, RestaurantBranch, DraftOrder, sequelize } = require('./src/database/models');

async function fixBranches() {
  const transaction = await sequelize.transaction();
  
  try {
    // Добавляем колонку name если её нет
    try {
      await sequelize.query('ALTER TABLE restaurant_branches ADD COLUMN name VARCHAR(255);', { transaction });
      console.log('Колонка name добавлена');
    } catch (err) {
      console.log('Колонка name уже существует или ошибка:', err.message);
    }
    
    // Находим ресторан Эмбер
    const restaurant = await Restaurant.findOne({
      where: { name: 'Эмбер' },
      transaction
    });
    
    if (!restaurant) {
      console.log('Ресторан Эмбер не найден');
      await transaction.rollback();
      return;
    }
    
    // Получаем филиалы
    const branches = await RestaurantBranch.findAll({
      where: { restaurant_id: restaurant.id },
      transaction
    });
    
    console.log(`Найдено ${branches.length} филиалов для ресторана Эмбер`);
    
    // Обновляем названия филиалов
    if (branches.length >= 1) {
      await sequelize.query(
        'UPDATE restaurant_branches SET name = ? WHERE id = ?',
        { 
          replacements: ['Юбилейный', branches[0].id],
          transaction 
        }
      );
      console.log('Филиал 1 обновлен: Юбилейный');
    }
    
    if (branches.length >= 2) {
      await sequelize.query(
        'UPDATE restaurant_branches SET name = ?, is_main = 1 WHERE id = ?',
        { 
          replacements: ['Главный филиал Эмбер', branches[1].id],
          transaction 
        }
      );
      console.log('Филиал 2 обновлен: Главный филиал Эмбер');
    }
    
    // Удаляем лишние филиалы если их больше 2
    if (branches.length > 2) {
      for (let i = 2; i < branches.length; i++) {
        await branches[i].destroy({ transaction });
        console.log(`Удален лишний филиал ID: ${branches[i].id}`);
      }
    }
    
    // Обновляем черновики без филиала, привязываем к главному
    const mainBranch = branches.find(b => b.id === branches[1]?.id);
    if (mainBranch) {
      await DraftOrder.update(
        { branch_id: mainBranch.id },
        { 
          where: { 
            restaurant_id: restaurant.id,
            branch_id: null 
          },
          transaction
        }
      );
      console.log('Черновики без филиала привязаны к главному филиалу');
    }
    
    await transaction.commit();
    console.log('Все изменения успешно применены');
    
    // Показываем результат
    console.log('\nПроверка результата:');
    const updatedBranches = await sequelize.query(
      'SELECT id, name, address, is_main, is_active FROM restaurant_branches WHERE restaurant_id = ?',
      { 
        replacements: [restaurant.id],
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    updatedBranches.forEach(branch => {
      console.log(`- ID: ${branch.id}, Название: ${branch.name}, Адрес: ${branch.address}, Главный: ${branch.is_main}`);
    });
    
  } catch (error) {
    await transaction.rollback();
    console.error('Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

fixBranches();