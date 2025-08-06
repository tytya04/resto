const { OrderItem } = require('./src/database/models');

async function fixFiniky() {
  try {
    console.log('Исправляем "Финик крупный 0,5 кг"...');
    
    const [affectedRows] = await OrderItem.update(
      { 
        quantity: 0.5,
        total: 0 // Обнуляем total
      },
      {
        where: {
          product_name: 'Финик крупный 0,5 кг',
          quantity: { [require('sequelize').Op.gte]: 1 } // Все где количество >= 1
        }
      }
    );
    
    console.log(`✅ Обновлено ${affectedRows} записей`);
    
    // Проверяем результат
    const updatedItems = await OrderItem.findAll({
      where: {
        product_name: 'Финик крупный 0,5 кг'
      },
      attributes: ['id', 'quantity', 'unit', 'total']
    });
    
    console.log('\nОбновленные записи:');
    updatedItems.forEach(item => {
      console.log(`- ID ${item.id}: ${item.quantity} ${item.unit}, сумма: ${item.total}`);
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    process.exit(0);
  }
}

fixFiniky();