const axios = require('axios');
const logger = require('../utils/logger');

class GoogleSheetsApiService {
  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY;
    this.spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    this.baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  }

  async getSheetData(range) {
    try {
      const url = `${this.baseUrl}/${this.spreadsheetId}/values/${range}?key=${this.apiKey}`;
      
      logger.info(`Fetching data from Google Sheets: ${range}`);
      
      const response = await axios.get(url);
      
      if (response.data && response.data.values) {
        logger.info(`Successfully fetched ${response.data.values.length} rows from Google Sheets`);
        return response.data.values;
      }
      
      return [];
    } catch (error) {
      logger.error('Error fetching Google Sheets data:', error.response?.data || error.message);
      throw error;
    }
  }

  async getSheetInfo() {
    try {
      const url = `${this.baseUrl}/${this.spreadsheetId}?key=${this.apiKey}`;
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      logger.error('Error getting sheet info:', error.response?.data || error.message);
      throw error;
    }
  }

  async getAllProducts() {
    try {
      // Сначала получаем информацию о таблице
      const sheetInfo = await this.getSheetInfo();
      const sheets = sheetInfo.sheets || [];
      
      logger.info('Available sheets:', sheets.map(s => s.properties.title));
      
      // Используем первый лист
      const targetSheet = sheets[0];
      
      if (!targetSheet) {
        throw new Error('No sheets found in the spreadsheet');
      }
      
      const sheetName = targetSheet.properties.title;
      logger.info(`Using sheet: ${sheetName}`);
      
      // Получаем данные из листа (расширенный диапазон)
      const data = await this.getSheetData(`'${sheetName}'!A1:AD100`);
      
      if (!data || data.length < 2) {
        logger.warn('No data found in Google Sheets');
        return [];
      }

      const products = [];
      const productSet = new Set(); // Для отслеживания дубликатов
      
      // Первая строка содержит категории и единицы измерения
      const headerRow = data[0];
      const categories = [];
      
      // Парсим заголовки - определяем категории и их колонки
      for (let i = 0; i < headerRow.length; i++) {
        const cell = headerRow[i];
        if (cell && cell.trim() && !['кг', 'шт', 'л', 'уп'].includes(cell.trim())) {
          // Это категория
          const category = {
            name: cell.trim(),
            startCol: i,
            endCol: i,
            units: []
          };
          
          // Ищем единицы измерения после категории
          for (let j = i + 1; j < headerRow.length; j++) {
            const nextCell = headerRow[j];
            if (nextCell && ['кг', 'шт', 'л', 'уп'].includes(nextCell.trim())) {
              category.units.push({ unit: nextCell.trim(), col: j });
              category.endCol = j;
            } else if (nextCell && nextCell.trim() && !['кг', 'шт', 'л', 'уп'].includes(nextCell.trim())) {
              // Следующая категория
              break;
            }
          }
          
          categories.push(category);
          logger.info(`Category: ${category.name}, columns: ${category.startCol}-${category.endCol}, units: ${category.units.map(u => u.unit).join(', ')}`);
        }
      }
      
      // Обрабатываем строки с продуктами (начиная со второй строки)
      for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
        const row = data[rowIndex];
        if (!row || row.length === 0) continue;
        
        // Для каждой категории проверяем продукты
        for (const category of categories) {
          // Проверяем основную колонку категории
          const productName = row[category.startCol];
          if (productName && productName.trim() && productName.trim().length > 1) {
            const trimmedName = productName.trim();
            
            // Пропускаем служебные слова и единицы измерения
            const skipWords = ['кг', 'шт', 'л', 'уп', 'кг.', 'шт.', 'ящик', 'мешок', 'упак', 'упаковка'];
            if (skipWords.includes(trimmedName.toLowerCase())) {
              continue;
            }
            
            // Определяем единицу измерения
            let unit = 'шт'; // По умолчанию
            
            // Проверяем, есть ли единица измерения в соседних колонках
            for (const unitInfo of category.units) {
              if (row[unitInfo.col] && ['кг', 'шт', 'л', 'уп', 'ящик', 'мешок'].includes(row[unitInfo.col].trim())) {
                unit = row[unitInfo.col].trim();
                break;
              }
            }
            
            // Если единиц измерения нет в колонках, берем из настроек категории
            if (unit === 'шт' && category.units.length > 0) {
              unit = category.units[0].unit;
            }
            
            // Создаем уникальный ключ
            const productKey = `${trimmedName.toLowerCase()}_${category.name}`;
            
            // Добавляем только уникальные продукты
            if (!productSet.has(productKey)) {
              productSet.add(productKey);
              products.push({
                product_name: trimmedName,
                category: category.name,
                unit: unit
              });
            }
          }
          
          // Также проверяем колонки единиц измерения для дополнительных продуктов
          for (const unitInfo of category.units) {
            const idx = unitInfo.col - 1;
            if (idx >= 0 && row[idx] && row[idx].trim() && row[idx].trim().length > 1) {
              const productName = row[idx].trim();
              
              // Пропускаем служебные слова
              const skipWords = ['кг', 'шт', 'л', 'уп', 'кг.', 'шт.', 'ящик', 'мешок', 'упак', 'упаковка'];
              if (skipWords.includes(productName.toLowerCase())) {
                continue;
              }
              
              const productKey = `${productName.toLowerCase()}_${category.name}`;
              
              if (!productSet.has(productKey)) {
                productSet.add(productKey);
                products.push({
                  product_name: productName,
                  category: category.name,
                  unit: unitInfo.unit
                });
              }
            }
          }
        }
      }

      logger.info(`Parsed ${products.length} unique products from Google Sheets`);
      return products;
    } catch (error) {
      logger.error('Error getting products from Google Sheets:', error);
      throw error;
    }
  }
}

module.exports = new GoogleSheetsApiService();