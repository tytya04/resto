const { OrderItem } = require('./src/database/models');

async function fixDatesQuantity() {
  try {
    console.log('Исправление количества для "Финик Алжирский 0,5 кг"...');
    
    // Обновляем количество с 1 кг на 0.5 кг
    const [affectedRows] = await OrderItem.update(
      { 
        quantity: 0.5,
        total: 0 // Обнуляем total, так как цена не установлена
      },
      {
        where: {
          product_name: 'Финик Алжирский 0,5 кг',
          quantity: 1 // Только те, где количество = 1
        }
      }
    );
    
    console.log(`Обновлено ${affectedRows} записей`);
    
    // Проверяем результат
    const updatedItems = await OrderItem.findAll({
      where: {
        product_name: 'Финик Алжирский 0,5 кг'
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

fixDatesQuantity();