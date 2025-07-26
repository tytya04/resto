require('dotenv').config();
const { sequelize, Order } = require('./src/database/models');

async function updateOrderStatuses() {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('Обновление статусов заказов...\n');
    
    // Новая логика статусов:
    // sent -> Отправлен ресторанами (новая заявка)
    // processing -> В обработке (закупщик комплектует)
    // completed -> Укомплектован
    // delivered -> Доставлен
    
    // Меняем все approved/rejected/processed на sent для упрощения
    const result = await Order.update(
      { status: 'sent' },
      { 
        where: { 
          status: ['approved', 'rejected', 'processed', 'processing'] 
        },
        transaction 
      }
    );
    
    console.log(`✅ Обновлено ${result[0]} заказов`);
    
    // Проверяем и добавляем новые колонки для закупщика
    try {
      await sequelize.query(`ALTER TABLE orders ADD COLUMN buyer_id INTEGER REFERENCES users(id)`, { transaction });
      console.log('✅ Добавлена колонка buyer_id');
    } catch (e) {
      console.log('ℹ️ Колонка buyer_id уже существует');
    }
    
    try {
      await sequelize.query(`ALTER TABLE orders ADD COLUMN picked_at DATETIME`, { transaction });
      console.log('✅ Добавлена колонка picked_at');
    } catch (e) {
      console.log('ℹ️ Колонка picked_at уже существует');
    }
    
    try {
      await sequelize.query(`ALTER TABLE orders ADD COLUMN completed_at DATETIME`, { transaction });
      console.log('✅ Добавлена колонка completed_at');
    } catch (e) {
      console.log('ℹ️ Колонка completed_at уже существует');
    }
    
    await transaction.commit();
    console.log('\n✅ Готово!');
    process.exit(0);
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

updateOrderStatuses();