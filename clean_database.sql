-- Очистка базы данных от всех заказов и связанных данных
-- Выполнять с осторожностью!

-- Удаляем данные из таблиц в правильном порядке (учитывая внешние ключи)

-- Удаляем историю цен
DELETE FROM price_histories;

-- Удаляем элементы закупок
DELETE FROM purchase_items;

-- Удаляем закупки
DELETE FROM purchases;

-- Удаляем элементы заказов
DELETE FROM order_items;

-- Удаляем заказы
DELETE FROM orders;

-- Удаляем элементы черновиков
DELETE FROM draft_order_items;

-- Удаляем черновики заказов
DELETE FROM draft_orders;

-- Сбрасываем автоинкременты (для SQLite)
DELETE FROM sqlite_sequence WHERE name IN ('orders', 'order_items', 'draft_orders', 'draft_order_items', 'purchases', 'purchase_items', 'price_histories');

-- Проверка результатов
SELECT 'orders' as table_name, COUNT(*) as count FROM orders
UNION ALL
SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL
SELECT 'draft_orders', COUNT(*) FROM draft_orders
UNION ALL
SELECT 'draft_order_items', COUNT(*) FROM draft_order_items
UNION ALL
SELECT 'purchases', COUNT(*) FROM purchases
UNION ALL
SELECT 'purchase_items', COUNT(*) FROM purchase_items
UNION ALL
SELECT 'price_histories', COUNT(*) FROM price_histories;