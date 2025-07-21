const { Markup } = require('telegraf');

class KeyboardHelper {
  // Создание клавиатуры для выбора продуктов
  static createProductSelectionKeyboard(products, callbackPrefix = 'select_product') {
    if (!products || products.length === 0) {
      return null;
    }

    const buttons = products.map(product => {
      const buttonText = this.formatProductButton(product);
      // Используем ID продукта, если есть, иначе название
      const callbackData = `${callbackPrefix}:${product.id || product.product_name}`;
      
      return [Markup.button.callback(buttonText, callbackData)];
    });

    // Добавляем кнопку отмены
    buttons.push([Markup.button.callback('❌ Отмена', 'cancel_selection')]);

    return Markup.inlineKeyboard(buttons);
  }

  // Форматирование текста кнопки продукта
  static formatProductButton(product) {
    let text = product.product_name || product.text || 'Неизвестный продукт';
    
    if (product.category) {
      text += ` (${product.category})`;
    }
    
    if (product.unit && product.price) {
      text += ` - ${product.price}₽/${product.unit}`;
    }
    
    if (product.match_info && product.match_info.trim()) {
      text += ` ${product.match_info}`;
    }
    
    // Ограничиваем длину текста кнопки
    if (text.length > 60) {
      text = text.substring(0, 57) + '...';
    }
    
    return text;
  }

  // Создание клавиатуры для выбора категории
  static createCategoryKeyboard(categories, callbackPrefix = 'select_category') {
    if (!categories || categories.length === 0) {
      return null;
    }

    const buttons = [];
    
    // Группируем категории по 2 в ряд
    for (let i = 0; i < categories.length; i += 2) {
      const row = [];
      
      row.push(Markup.button.callback(
        categories[i],
        `${callbackPrefix}:${categories[i]}`
      ));
      
      if (i + 1 < categories.length) {
        row.push(Markup.button.callback(
          categories[i + 1],
          `${callbackPrefix}:${categories[i + 1]}`
        ));
      }
      
      buttons.push(row);
    }

    // Добавляем управляющие кнопки
    buttons.push([
      Markup.button.callback('🔍 Поиск по названию', 'search_by_name'),
      Markup.button.callback('❌ Отмена', 'cancel_selection')
    ]);

    return Markup.inlineKeyboard(buttons);
  }

  // Создание клавиатуры для подтверждения выбора
  static createConfirmationKeyboard(productName, quantity, unit) {
    const text = `${productName} - ${quantity} ${unit}`;
    
    return Markup.inlineKeyboard([
      [Markup.button.callback('✅ Подтвердить', `confirm:${productName}:${quantity}:${unit}`)],
      [Markup.button.callback('✏️ Изменить количество', `edit_quantity:${productName}`)],
      [Markup.button.callback('❌ Отмена', 'cancel_selection')]
    ]);
  }

  // Создание клавиатуры для навигации по страницам
  static createPaginationKeyboard(currentPage, totalPages, callbackPrefix) {
    const buttons = [];
    const navigationRow = [];

    if (currentPage > 1) {
      navigationRow.push(Markup.button.callback('⬅️ Назад', `${callbackPrefix}:${currentPage - 1}`));
    }

    navigationRow.push(Markup.button.callback(`${currentPage}/${totalPages}`, 'current_page'));

    if (currentPage < totalPages) {
      navigationRow.push(Markup.button.callback('Вперед ➡️', `${callbackPrefix}:${currentPage + 1}`));
    }

    buttons.push(navigationRow);
    buttons.push([Markup.button.callback('❌ Закрыть', 'close_pagination')]);

    return Markup.inlineKeyboard(buttons);
  }

  // Создание клавиатуры быстрого выбора количества
  static createQuantityKeyboard(productName, unit = 'кг') {
    const commonQuantities = this.getCommonQuantities(unit);
    const buttons = [];

    // Первый ряд - предустановленные количества
    const firstRow = commonQuantities.slice(0, 3).map(qty => 
      Markup.button.callback(`${qty} ${unit}`, `quick_qty:${productName}:${qty}:${unit}`)
    );
    buttons.push(firstRow);

    // Второй ряд - дополнительные количества
    if (commonQuantities.length > 3) {
      const secondRow = commonQuantities.slice(3, 6).map(qty => 
        Markup.button.callback(`${qty} ${unit}`, `quick_qty:${productName}:${qty}:${unit}`)
      );
      buttons.push(secondRow);
    }

    // Управляющие кнопки
    buttons.push([
      Markup.button.callback('⌨️ Ввести вручную', `manual_qty:${productName}`),
      Markup.button.callback('❌ Отмена', 'cancel_selection')
    ]);

    return Markup.inlineKeyboard(buttons);
  }

  // Получение стандартных количеств в зависимости от единицы измерения
  static getCommonQuantities(unit) {
    const quantities = {
      'кг': [1, 5, 10, 20, 50, 100],
      'г': [100, 250, 500, 750, 1000, 2000],
      'л': [1, 2, 5, 10, 20, 50],
      'мл': [100, 250, 500, 750, 1000, 2000],
      'шт': [1, 5, 10, 20, 50, 100],
      'уп': [1, 2, 5, 10, 20, 50],
      'дес': [1, 2, 5, 10, 20, 30]
    };

    return quantities[unit] || quantities['шт'];
  }

  // Создание клавиатуры для фильтрации результатов поиска
  static createSearchFiltersKeyboard(hasCategories = true) {
    const buttons = [];

    if (hasCategories) {
      buttons.push([
        Markup.button.callback('📂 По категориям', 'filter_by_category'),
        Markup.button.callback('💰 По цене', 'filter_by_price')
      ]);
    }

    buttons.push([
      Markup.button.callback('🔄 Сбросить фильтры', 'reset_filters'),
      Markup.button.callback('❌ Закрыть', 'close_filters')
    ]);

    return Markup.inlineKeyboard(buttons);
  }

  // Создание клавиатуры для действий с продуктом
  static createProductActionsKeyboard(productName) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('➕ Добавить в заказ', `add_to_order:${productName}`)],
      [Markup.button.callback('ℹ️ Информация', `product_info:${productName}`)],
      [Markup.button.callback('🔄 Найти похожие', `find_similar:${productName}`)],
      [Markup.button.callback('❌ Закрыть', 'close_actions')]
    ]);
  }

  // Разбор callback_data
  static parseCallbackData(callbackData) {
    const parts = callbackData.split(':');
    return {
      action: parts[0],
      params: parts.slice(1)
    };
  }

  // Создание текста с предложениями продуктов
  static formatProductSuggestions(products, query) {
    if (!products || products.length === 0) {
      return `❌ По запросу "${query}" ничего не найдено.\n\nПопробуйте:\n• Проверить правописание\n• Использовать другие слова\n• Выбрать из категорий`;
    }

    let text = `🔍 Результаты поиска по запросу "${query}":\n\n`;
    
    products.forEach((product, index) => {
      text += `${index + 1}. ${product.product_name}`;
      
      if (product.category) {
        text += ` (${product.category})`;
      }
      
      if (product.unit && product.price) {
        text += ` - ${product.price}₽/${product.unit}`;
      }
      
      if (product.match_type === 'synonym' && product.matched_term) {
        text += `\n   💡 Найдено по синониму: "${product.matched_term}"`;
      }
      
      text += '\n';
    });

    text += '\n📌 Выберите продукт из списка ниже:';
    
    return text;
  }
}

module.exports = KeyboardHelper;