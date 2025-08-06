const sequelize = require('./src/database/config');

async function createPurchaseItemsTable() {
  try {
    console.log('Создание таблицы purchase_items...');
    
    // Создаем таблицу purchase_items
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        product_name VARCHAR(300) NOT NULL,
        unit VARCHAR(20) NOT NULL,
        quantity DECIMAL(10,3) NOT NULL,
        required_quantity DECIMAL(10,3) NOT NULL,
        purchased_quantity DECIMAL(10,3) DEFAULT 0,
        purchase_price DECIMAL(10,2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending',
        consolidated_product_id VARCHAR(500),
        purchased_at DATETIME,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id)
      )
    `);
    
    console.log('✅ Таблица purchase_items создана');
    
    // Создаем индексы
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_purchase_items_status ON purchase_items(status)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_purchase_items_consolidated_product_id ON purchase_items(consolidated_product_id)');
    
    console.log('✅ Индексы созданы');
    
    // Проверяем и добавляем новые колонки в purchases
    try {
      await sequelize.query('ALTER TABLE purchases ADD COLUMN total_items INTEGER DEFAULT 0');
      console.log('✅ Добавлена колонка total_items');
    } catch (e) {
      console.log('Колонка total_items уже существует');
    }
    
    try {
      await sequelize.query('ALTER TABLE purchases ADD COLUMN completed_items INTEGER DEFAULT 0');
      console.log('✅ Добавлена колонка completed_items');
    } catch (e) {
      console.log('Колонка completed_items уже существует');
    }
    
    try {
      await sequelize.query('ALTER TABLE purchases ADD COLUMN completed_at DATETIME');
      console.log('✅ Добавлена колонка completed_at');
    } catch (e) {
      console.log('Колонка completed_at уже существует');
    }
    
    console.log('\n✅ Все изменения успешно применены!');
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

createPurchaseItemsTable();