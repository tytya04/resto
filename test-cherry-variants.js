const { sequelize, DraftOrder, DraftOrderItem, User, Restaurant } = require('./src/database/models');
const draftOrderService = require('./src/services/DraftOrderService');
const productMatcher = require('./src/services/ProductMatcher');

async function testCherryVariants() {
  try {
    // Инициализируем ProductMatcher
    await productMatcher.initialize();
    
    console.log('Тестируем новую логику для вариантов черри...\n');
    
    // Находим тестового пользователя и ресторан
    const user = await User.findOne({ where: { username: 'grassdream' } });
    if (!user) {
      console.log('Пользователь не найден!');
      return;
    }
    const restaurant = await Restaurant.findOne({ where: { id: user.restaurant_id } });
    
    console.log(`Пользователь: ${user.username} (ID: ${user.id})`);
    console.log(`Ресторан: ${restaurant.name} (ID: ${restaurant.id})\n`);
    
    // Создаем тестовый черновик
    const draft = await DraftOrder.create({
      restaurant_id: restaurant.id,
      user_id: user.id,
      status: 'draft',
      scheduled_for: new Date(Date.now() + 24 * 60 * 60 * 1000) // завтра
    });
    
    console.log(`Создан черновик заказа ID: ${draft.id}\n`);
    
    // Тестируем добавление продукта
    console.log('Добавляем "Черри 2 кг"...');
    const results = await draftOrderService.parseAndAddProducts(
      draft.id,
      'Черри 2 кг',
      user.id
    );
    
    console.log('\nРезультаты:');
    console.log(`- Распознано: ${results.matched.length}`);
    console.log(`- Не распознано: ${results.unmatched.length}`);
    console.log(`- Требует уточнения единицы: ${results.needsUnitClarification.length}`);
    console.log(`- Дубликаты: ${results.duplicates.length}`);
    console.log(`- Ошибки: ${results.errors.length}`);
    
    if (results.unmatched.length > 0) {
      console.log('\n❓ Нераспознанные продукты (требуют выбора):');
      results.unmatched.forEach(({ item, suggestions }) => {
        console.log(`   Продукт: "${item.original_name}" - ${item.quantity} ${item.unit}`);
        console.log(`   Статус: ${item.status}`);
        console.log(`   Варианты для выбора:`);
        suggestions.slice(0, 5).forEach((s, i) => {
          console.log(`     ${i + 1}. ${s.product_name} (ID: ${s.id}) - ${s.match_type}`);
        });
      });
    }
    
    if (results.matched.length > 0) {
      console.log('\n✅ Распознанные продукты:');
      results.matched.forEach(({ item, matchedProduct }) => {
        console.log(`   - ${matchedProduct.product_name} (ID: ${matchedProduct.id}) - ${item.quantity} ${item.unit}`);
        console.log(`     Статус: ${item.status}`);
      });
    }
    
    // Удаляем тестовые данные
    await DraftOrderItem.destroy({ where: { draft_order_id: draft.id } });
    await draft.destroy();
    
    console.log('\n✅ Тест завершен, тестовые данные удалены');
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await sequelize.close();
  }
}

testCherryVariants();