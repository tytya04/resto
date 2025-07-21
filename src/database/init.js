const { sequelize, User, Restaurant, Order, OrderItem, NomenclatureCache, ProductSynonym, DraftOrder, DraftOrderItem } = require('./models');
const logger = require('../utils/logger');

const initDatabase = async () => {
  try {
    // Проверка подключения к БД
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    
    // Включаем поддержку внешних ключей для SQLite
    await sequelize.query('PRAGMA foreign_keys = ON;');
    logger.info('Foreign keys support enabled');

    // Синхронизация моделей с БД
    await sequelize.sync({ alter: false });
    logger.info('Database synchronized successfully');

    // Проверка наличия администратора
    const adminCount = await User.count({ where: { role: 'admin' } });
    
    if (adminCount === 0) {
      logger.info('No admin user found, creating default admin...');
      
      // Создание дефолтного администратора
      await User.create({
        telegram_id: 123456789, // Замените на реальный ID администратора
        username: 'admin',
        role: 'admin',
        first_name: 'Admin',
        last_name: 'User',
        is_active: true
      });
      
      logger.info('Default admin user created');
    }

    // Создание примера номенклатуры
    const nomenclatureCount = await NomenclatureCache.count();
    
    if (nomenclatureCount === 0) {
      logger.info('Creating sample nomenclature...');
      
      const sampleProducts = [
        { product_name: 'Картофель', category: 'Овощи', unit: 'кг', last_purchase_price: 35 },
        { product_name: 'Морковь', category: 'Овощи', unit: 'кг', last_purchase_price: 40 },
        { product_name: 'Лук репчатый', category: 'Овощи', unit: 'кг', last_purchase_price: 30 },
        { product_name: 'Помидоры', category: 'Овощи', unit: 'кг', last_purchase_price: 120 },
        { product_name: 'Огурцы', category: 'Овощи', unit: 'кг', last_purchase_price: 100 },
        { product_name: 'Говядина', category: 'Мясо', unit: 'кг', last_purchase_price: 450 },
        { product_name: 'Свинина', category: 'Мясо', unit: 'кг', last_purchase_price: 380 },
        { product_name: 'Курица', category: 'Мясо', unit: 'кг', last_purchase_price: 180 },
        { product_name: 'Молоко 3.2%', category: 'Молочные продукты', unit: 'л', last_purchase_price: 75 },
        { product_name: 'Сметана 20%', category: 'Молочные продукты', unit: 'кг', last_purchase_price: 220 },
        { product_name: 'Масло сливочное 82.5%', category: 'Молочные продукты', unit: 'кг', last_purchase_price: 650 },
        { product_name: 'Яйца куриные С1', category: 'Яйца', unit: 'дес', last_purchase_price: 95 },
        { product_name: 'Мука пшеничная в/с', category: 'Бакалея', unit: 'кг', last_purchase_price: 45 },
        { product_name: 'Сахар', category: 'Бакалея', unit: 'кг', last_purchase_price: 65 },
        { product_name: 'Соль поваренная', category: 'Бакалея', unit: 'кг', last_purchase_price: 20 }
      ];

      await NomenclatureCache.bulkCreate(sampleProducts);
      logger.info(`Created ${sampleProducts.length} sample products`);
    }

    // Создание предустановленных синонимов
    const synonymCount = await ProductSynonym.count();
    
    if (synonymCount === 0) {
      logger.info('Creating default synonyms...');
      
      const defaultSynonyms = [
        { original: 'Картофель', synonym: 'картошка', weight: 1.0 },
        { original: 'Картофель', synonym: 'картоха', weight: 0.9 },
        { original: 'Картофель', synonym: 'картофан', weight: 0.8 },
        { original: 'Морковь', synonym: 'морковка', weight: 1.0 },
        { original: 'Свинина', synonym: 'свиное мясо', weight: 1.0 },
        { original: 'Говядина', synonym: 'говяжье мясо', weight: 1.0 },
        { original: 'Говядина', synonym: 'говядинка', weight: 0.9 },
        { original: 'Курица', synonym: 'куриное мясо', weight: 1.0 },
        { original: 'Курица', synonym: 'курятина', weight: 1.0 },
        { original: 'Курица', synonym: 'курочка', weight: 0.9 },
        { original: 'Молоко 3.2%', synonym: 'молоко', weight: 0.9 },
        { original: 'Лук репчатый', synonym: 'лук', weight: 1.0 },
        { original: 'Лук репчатый', synonym: 'луковица', weight: 0.8 },
        { original: 'Помидоры', synonym: 'томаты', weight: 1.0 },
        { original: 'Помидоры', synonym: 'помидорки', weight: 0.9 },
        { original: 'Огурцы', synonym: 'огурчики', weight: 0.9 },
        { original: 'Яйца куриные С1', synonym: 'яйца', weight: 1.0 },
        { original: 'Яйца куриные С1', synonym: 'яички', weight: 0.8 },
        { original: 'Масло сливочное 82.5%', synonym: 'масло сливочное', weight: 1.0 },
        { original: 'Масло сливочное 82.5%', synonym: 'сливочное масло', weight: 1.0 },
        { original: 'Мука пшеничная в/с', synonym: 'мука', weight: 1.0 },
        { original: 'Сметана 20%', synonym: 'сметана', weight: 1.0 },
        { original: 'Сметана 20%', synonym: 'сметанка', weight: 0.8 }
      ];

      // Временно отключаем создание синонимов из-за проблемы с unique constraint
      // await ProductSynonym.bulkCreate(defaultSynonyms);
      logger.info('Skipped synonyms creation due to unique constraint issue');
    }

    logger.info('Database initialization completed');
    return true;
  } catch (error) {
    logger.error('Database initialization error:', error);
    throw error;
  }
};

// Функция для генерации номера заказа
const generateOrderNumber = async () => {
  const date = new Date();
  const year = date.getFullYear().toString().substr(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  const lastOrder = await Order.findOne({
    where: sequelize.where(
      sequelize.fn('substr', sequelize.col('order_number'), 1, 6),
      `${year}${month}${day}`
    ),
    order: [['order_number', 'DESC']]
  });

  let sequence = 1;
  if (lastOrder) {
    const lastSequence = parseInt(lastOrder.order_number.substr(-4));
    sequence = lastSequence + 1;
  }

  return `${year}${month}${day}-${sequence.toString().padStart(4, '0')}`;
};

// Хук для автоматической генерации номера заказа
Order.beforeCreate(async (order) => {
  if (!order.order_number) {
    order.order_number = await generateOrderNumber();
  }
});

// Хук для пересчета суммы заказа
OrderItem.afterCreate(async (item) => {
  await recalculateOrderTotal(item.order_id);
});

OrderItem.afterUpdate(async (item) => {
  await recalculateOrderTotal(item.order_id);
});

OrderItem.afterDestroy(async (item) => {
  await recalculateOrderTotal(item.order_id);
});

const recalculateOrderTotal = async (orderId) => {
  const items = await OrderItem.findAll({ where: { order_id: orderId } });
  const total = items.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
  
  await Order.update(
    { total_amount: total },
    { where: { id: orderId } }
  );
};

module.exports = {
  initDatabase,
  generateOrderNumber,
  recalculateOrderTotal
};