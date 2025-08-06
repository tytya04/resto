-- Создание таблицы purchase_items
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
);

-- Создаем индексы
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_status ON purchase_items(status);
CREATE INDEX IF NOT EXISTS idx_purchase_items_consolidated_product_id ON purchase_items(consolidated_product_id);

-- Обновляем структуру таблицы purchases
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS total_items INTEGER DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS completed_items INTEGER DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS completed_at DATETIME;