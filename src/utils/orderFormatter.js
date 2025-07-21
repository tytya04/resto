const moment = require('moment');
require('moment/locale/ru');
const { formatInTimezone } = require('./timezone');

moment.locale('ru');

class OrderFormatter {
  // Форматирование заказа для отображения
  static formatOrder(order) {
    let text = `📋 <b>Заказ${order.order_number ? ' #' + order.order_number : ''}</b>\n`;
    text += `📅 Дата: ${formatInTimezone(order.created_at, 'DD MMMM YYYY, HH:mm')}\n`;
    
    if (order.restaurant) {
      text += `🏢 Ресторан: ${order.restaurant.name}\n`;
    }
    
    text += `📊 Статус: ${this.getStatusText(order.status)}\n`;
    text += `\n<b>Позиции заказа:</b>\n\n`;

    let totalAmount = 0;
    order.orderItems.forEach((item, index) => {
      text += `${index + 1}. ${item.product_name}\n`;
      text += `   Количество: ${item.quantity} ${item.unit}`;
      
      if (item.price) {
        text += ` × ${item.price} ₽ = ${item.total || 0} ₽`;
      }
      
      text += '\n';
      totalAmount += item.total || 0;
    });

    text += `\n<b>💰 Итого: ${totalAmount.toFixed(2)} ₽</b>\n`;

    if (order.notes) {
      text += `\n📝 Примечание: ${order.notes}\n`;
    }

    if (order.sent_at) {
      text += `\n📤 Отправлен: ${formatInTimezone(order.sent_at)}`;
    }

    if (order.approved_at) {
      text += `\n✅ Одобрен: ${formatInTimezone(order.approved_at)}`;
    }

    if (order.rejected_at) {
      text += `\n❌ Отклонен: ${formatInTimezone(order.rejected_at)}`;
      if (order.rejection_reason) {
        text += `\nПричина: ${order.rejection_reason}`;
      }
    }

    return text;
  }

  // Краткий формат заказа для списков
  static formatOrderShort(order) {
    const statusEmoji = this.getStatusEmoji(order.status);
    let text = `${statusEmoji} <b>#${order.order_number}</b> от ${moment(order.created_at).format('DD.MM')}\n`;
    text += `Позиций: ${order.orderItems?.length || 0}, Сумма: ${order.total_amount || 0} ₽`;
    return text;
  }

  // Форматирование позиции заказа
  static formatOrderItem(item, index) {
    let text = `${index}. <b>${item.product_name}</b>\n`;
    text += `   ${item.quantity} ${item.unit}`;
    
    if (item.price) {
      text += ` × ${item.price} ₽ = ${item.total || 0} ₽`;
    }
    
    if (item.notes) {
      text += `\n   <i>${item.notes}</i>`;
    }
    
    return text;
  }

  // Получение текста статуса
  static getStatusText(status) {
    const statusTexts = {
      'draft': 'Черновик',
      'sent': 'Отправлен',
      'processing': 'В обработке',
      'approved': 'Одобрен',
      'rejected': 'Отклонен',
      'purchased': 'Закуплен',
      'delivered': 'Доставлен',
      'completed': 'Завершен',
      'cancelled': 'Отменен'
    };
    
    return statusTexts[status] || status;
  }

  // Получение эмодзи для статуса
  static getStatusEmoji(status) {
    const statusEmojis = {
      'draft': '📝',
      'sent': '📤',
      'processing': '⏳',
      'approved': '✅',
      'rejected': '❌',
      'purchased': '🛒',
      'delivered': '📦',
      'completed': '✅',
      'cancelled': '🚫'
    };
    
    return statusEmojis[status] || '📋';
  }

  // Подсчет общей суммы позиций
  static calculateTotal(items) {
    return items.reduce((sum, item) => sum + (item.total || 0), 0).toFixed(2);
  }

  // Форматирование списка заказов
  static formatOrdersList(orders) {
    if (orders.length === 0) {
      return '📋 Заказов не найдено';
    }

    let text = `📋 <b>Найдено заказов: ${orders.length}</b>\n\n`;
    
    orders.forEach((order, index) => {
      if (index > 0) text += '\n➖➖➖➖➖➖➖➖➖\n\n';
      text += this.formatOrderShort(order);
    });

    return text;
  }

  // Форматирование консолидированных заказов
  static formatConsolidatedOrder(consolidated) {
    let text = '<b>📊 Консолидированный заказ</b>\n\n';
    
    const byCategory = {};
    
    // Группируем по категориям
    consolidated.forEach(item => {
      const category = item.category || 'Без категории';
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(item);
    });

    // Выводим по категориям
    Object.entries(byCategory).forEach(([category, items]) => {
      text += `\n<b>📂 ${category}</b>\n`;
      
      items.forEach(item => {
        text += `\n• ${item.product_name}\n`;
        text += `  Общее кол-во: ${item.total_quantity} ${item.unit}\n`;
        text += `  Рестораны: ${item.restaurants.join(', ')}\n`;
      });
    });

    return text;
  }

  // Форматирование детальной информации о позиции в консолидации
  static formatConsolidatedItemDetails(item) {
    let text = `<b>📦 ${item.product_name}</b>\n\n`;
    text += `📏 Единица измерения: ${item.unit}\n`;
    text += `📊 Общее количество: ${item.total_quantity} ${item.unit}\n\n`;
    
    text += '<b>Распределение по ресторанам:</b>\n';
    
    item.orders.forEach(order => {
      text += `\n• ${order.restaurant}\n`;
      text += `  Заказ #${order.order_number}: ${order.quantity} ${item.unit}\n`;
    });

    return text;
  }

  // Форматирование для экспорта (CSV)
  static formatOrderForCSV(order) {
    const lines = ['Продукт;Количество;Единица;Цена;Сумма'];
    
    order.orderItems.forEach(item => {
      lines.push(
        `${item.product_name};${item.quantity};${item.unit};${item.price || ''};${item.total || ''}`
      );
    });

    lines.push('');
    lines.push(`Итого:;;;${order.total_amount}`);
    
    return lines.join('\n');
  }

  // Валидация данных позиции
  static validateOrderItem(item) {
    const errors = [];

    if (!item.product_name || item.product_name.trim().length === 0) {
      errors.push('Не указано название продукта');
    }

    if (!item.quantity || item.quantity <= 0) {
      errors.push('Количество должно быть больше 0');
    }

    if (!item.unit) {
      errors.push('Не указана единица измерения');
    }

    if (item.price && item.price < 0) {
      errors.push('Цена не может быть отрицательной');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Форматирование ошибок валидации
  static formatValidationErrors(errors) {
    if (errors.length === 0) return '';
    
    let text = '⚠️ <b>Обнаружены ошибки:</b>\n\n';
    errors.forEach((error, index) => {
      text += `${index + 1}. ${error}\n`;
    });
    
    return text;
  }
}

module.exports = OrderFormatter;