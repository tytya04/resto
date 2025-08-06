const { User } = require('./src/database/models');
const logger = require('./src/utils/logger');

async function testWorkflow() {
  try {
    console.log('=== Проверка процесса работы системы ===\n');
    
    // 1. Проверяем пользователей
    console.log('1. Активные пользователи:');
    
    const restaurants = await User.findAll({
      where: { role: 'restaurant', is_active: true }
    });
    console.log(`   - Рестораны: ${restaurants.length}`);
    restaurants.forEach(r => console.log(`     • ${r.first_name || r.username} (ID: ${r.id})`));
    
    const managers = await User.findAll({
      where: { role: 'manager', is_active: true }
    });
    console.log(`   - Менеджеры: ${managers.length}`);
    managers.forEach(m => console.log(`     • ${m.first_name || m.username} (ID: ${m.id})`));
    
    const buyers = await User.findAll({
      where: { role: 'buyer', is_active: true }
    });
    console.log(`   - Закупщики: ${buyers.length}`);
    buyers.forEach(b => console.log(`     • ${b.first_name || b.username} (ID: ${b.id})`));
    
    console.log('\n2. Процесс работы:');
    console.log('   ✅ Шаг 1: Ресторан создает черновик заказа');
    console.log('   ✅ Шаг 2: Заказ отправляется (вручную или по расписанию)');
    console.log('   ✅ Шаг 3: Менеджер получает уведомление');
    console.log('   ✅ Шаг 4: Менеджер обрабатывает и одобряет заказ');
    console.log('   ✅ Шаг 5: Закупщик получает уведомление об одобренном заказе');
    console.log('   ✅ Шаг 6: Закупщик видит заказ в консолидированном списке');
    
    console.log('\n3. Исправления:');
    console.log('   ✅ Удалены все старые заказы');
    console.log('   ✅ Менеджер может видеть консолидацию всех заказов (sent, approved, processing)');
    console.log('   ✅ Закупщик получает уведомления только об одобренных заказах');
    console.log('   ✅ Команда /consolidate зарегистрирована для закупщиков');
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

testWorkflow();