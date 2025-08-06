const { Purchase, User } = require('./src/database/models');

async function checkActivePurchases() {
  try {
    console.log('=== Проверка активных закупок ===\n');
    
    // Находим закупщика
    const buyer = await User.findOne({ 
      where: { role: 'buyer', first_name: 'Поля(_)' }
    });
    
    if (!buyer) {
      console.log('❌ Закупщик не найден');
      return;
    }
    
    console.log(`Закупщик: ${buyer.first_name} (ID: ${buyer.id})\n`);
    
    // Проверяем все закупки
    const allPurchases = await Purchase.findAll({
      where: { buyer_id: buyer.id }
    });
    
    console.log(`Всего закупок у закупщика: ${allPurchases.length}`);
    
    if (allPurchases.length > 0) {
      console.log('\nСписок всех закупок:');
      allPurchases.forEach((p, i) => {
        console.log(`${i + 1}. ID: ${p.id}`);
        console.log(`   Продукт: ${p.product_name}`);
        console.log(`   Статус: ${p.status}`);
        console.log(`   Создана: ${p.created_at}`);
      });
    }
    
    // Проверяем активные закупки (как в коде)
    const activePurchases = await Purchase.findAll({
      where: {
        buyer_id: buyer.id,
        status: ['pending', 'in_progress', 'packing'],
        product_name: 'Закупочная сессия'
      }
    });
    
    console.log(`\nАктивных закупок (pending/in_progress/packing + 'Закупочная сессия'): ${activePurchases.length}`);
    
    // Проверяем счетчик как в функции purchases
    const { Op } = require('sequelize');
    const moment = require('moment');
    
    const activePurchasesCount = await Purchase.count({
      where: {
        buyer_id: buyer.id,
        status: ['pending', 'in_progress', 'packing'],
        product_name: 'Закупочная сессия'
      }
    });
    
    const completedPurchasesCount = await Purchase.count({
      where: {
        buyer_id: buyer.id,
        status: 'completed',
        product_name: 'Закупочная сессия',
        created_at: {
          [Op.gte]: moment().subtract(30, 'days').toDate()
        }
      }
    });
    
    console.log(`\n=== Счетчики для кнопок ===`);
    console.log(`Активные закупки: ${activePurchasesCount}`);
    console.log(`Завершенные закупки (за 30 дней): ${completedPurchasesCount}`);
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

checkActivePurchases();