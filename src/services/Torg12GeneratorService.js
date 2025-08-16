const XLSX = require('xlsx');
const moment = require('moment');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

class Torg12GeneratorService {
  constructor() {
    // Загружаем шаблон при создании экземпляра
    this.templatePath = path.join(__dirname, '../../templates/torg12_template.xls');
  }

  /**
   * Генерирует накладную ТОРГ-12 для заказа
   * @param {Object} order - Заказ с позициями и связанными данными
   * @param {Object} supplier - Данные поставщика (restaurant-поставщик)
   * @param {Object} buyer - Данные покупателя (restaurant-покупатель)
   * @param {Object} options - Дополнительные параметры
   */
  async generateTorg12(order, supplier, buyer, options = {}) {
    try {
      logger.info('Generating ТОРГ-12 document', {
        orderId: order.id,
        orderNumber: order.order_number,
        supplierId: supplier.id,
        buyerId: buyer.id
      });

      // Загружаем шаблон
      const workbook = XLSX.readFile(this.templatePath);
      const sheetName = Object.keys(workbook.Sheets)[0];
      const worksheet = workbook.Sheets[sheetName];

      // Заполняем документ
      await this.fillDocument(worksheet, order, supplier, buyer, options);

      // Генерируем имя файла
      const fileName = `TORG12_${order.order_number}_${moment().format('YYYYMMDD_HHmmss')}.xlsx`;
      const outputPath = path.join(__dirname, '../../temp', fileName);

      // Создаем директорию если не существует
      const tempDir = path.dirname(outputPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Записываем файл
      XLSX.writeFile(workbook, outputPath);

      logger.info('ТОРГ-12 generated successfully', {
        orderId: order.id,
        fileName,
        outputPath
      });

      return {
        success: true,
        fileName,
        filePath: outputPath,
        documentNumber: this.generateDocumentNumber(order),
        documentDate: moment().format('DD.MM.YYYY')
      };

    } catch (error) {
      logger.error('Error generating ТОРГ-12', {
        orderId: order?.id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Заполняет ячейки документа данными
   */
  async fillDocument(worksheet, order, supplier, buyer, options) {
    const documentNumber = this.generateDocumentNumber(order);
    const documentDate = moment().format('DD.MM.YYYY');

    // Основные реквизиты документа
    this.setCellValue(worksheet, 'R5', documentNumber); // Номер документа
    this.setCellValue(worksheet, 'AC5', documentDate);  // Дата составления

    // Код по ОКПО организации-грузоотправителя (поставщик)
    this.setCellValue(worksheet, 'CS6', supplier.okpo || '');

    // Грузоотправитель (поставщик)
    const supplierInfo = this.formatOrganizationInfo(supplier);
    this.setCellValue(worksheet, 'B8', supplierInfo);

    // Структурное подразделение
    this.setCellValue(worksheet, 'B10', options.department || 'Склад');
    
    // Вид деятельности по ОКДП
    this.setCellValue(worksheet, 'AS10', supplier.okdp || '');

    // Грузополучатель (покупатель)
    this.setCellValue(worksheet, 'CS12', buyer.okpo || '');
    const buyerInfo = this.formatOrganizationInfo(buyer);
    this.setCellValue(worksheet, 'B13', buyerInfo);

    // Поставщик (повторно)
    this.setCellValue(worksheet, 'CS14', supplier.okpo || '');
    this.setCellValue(worksheet, 'B15', supplierInfo);

    // Плательщик (обычно тот же что и покупатель)
    this.setCellValue(worksheet, 'CS16', buyer.okpo || '');
    this.setCellValue(worksheet, 'B17', buyerInfo);

    // Основание (договор, заказ-наряд)
    const basis = options.contractNumber 
      ? `Договор № ${options.contractNumber}` 
      : `Заказ № ${order.order_number}`;
    this.setCellValue(worksheet, 'B18', basis);
    this.setCellValue(worksheet, 'AS19', options.contractDate || documentDate);

    // Транспортная накладная (опционально)
    if (options.transportNumber) {
      this.setCellValue(worksheet, 'BO21', options.transportNumber);
      this.setCellValue(worksheet, 'BO22', options.transportDate || documentDate);
    }

    // Вид операции
    this.setCellValue(worksheet, 'B23', options.operationType || 'Отпуск товара');

    // Заполняем позиции товаров
    await this.fillOrderItems(worksheet, order.orderItems);

    // Подписи
    this.fillSignatures(worksheet, supplier, buyer);
  }

  /**
   * Заполняет позиции товаров в таблице
   */
  async fillOrderItems(worksheet, orderItems) {
    const startRow = 30; // Начальная строка для товаров
    let totalAmount = 0;
    let totalQuantity = 0;

    orderItems.forEach((item, index) => {
      const row = startRow + index;
      
      // Номер по порядку
      this.setCellValue(worksheet, `A${row}`, index + 1);
      
      // Наименование товара
      this.setCellValue(worksheet, `B${row}`, item.product_name);
      
      // Единица измерения
      this.setCellValue(worksheet, `N${row}`, item.unit || 'шт');
      
      // Количество
      const quantity = parseFloat(item.quantity) || 0;
      this.setCellValue(worksheet, `T${row}`, quantity);
      
      // Цена
      const price = parseFloat(item.price) || 0;
      this.setCellValue(worksheet, `BI${row}`, price.toFixed(2));
      
      // Сумма
      const total = quantity * price;
      this.setCellValue(worksheet, `BQ${row}`, total.toFixed(2));
      
      totalAmount += total;
      totalQuantity += quantity;
    });

    // Итоговая строка
    const totalRow = startRow + orderItems.length + 2;
    this.setCellValue(worksheet, `A${totalRow}`, 'ИТОГО:');
    this.setCellValue(worksheet, `T${totalRow}`, totalQuantity);
    this.setCellValue(worksheet, `BQ${totalRow}`, totalAmount.toFixed(2));
  }

  /**
   * Заполняет подписи ответственных лиц
   */
  fillSignatures(worksheet, supplier, buyer) {
    // Отпуск разрешил (обычно директор поставщика)
    this.setCellValue(worksheet, 'F81', supplier.director_position || 'Генеральный директор');
    this.setCellValue(worksheet, 'AQ81', supplier.director_name || '');

    // Главный бухгалтер поставщика
    this.setCellValue(worksheet, 'F82', supplier.accountant_position || 'Главный бухгалтер');
    this.setCellValue(worksheet, 'AQ82', supplier.accountant_name || '');

    // Отпустил (заведующий складом)
    this.setCellValue(worksheet, 'F83', supplier.warehouse_position || 'Заведующий складом');
    this.setCellValue(worksheet, 'AQ83', supplier.warehouse_responsible || '');

    // Получил (представитель покупателя)
    this.setCellValue(worksheet, 'BM85', buyer.contact_person || '');
  }

  /**
   * Форматирует информацию об организации
   */
  formatOrganizationInfo(org) {
    let info = org.legal_name || org.name || '';
    
    if (org.address) {
      info += `\nАдрес: ${org.address}`;
    }
    
    if (org.contact_phone) {
      info += `\nТел.: ${org.contact_phone}`;
    }
    
    if (org.fax) {
      info += `\nФакс: ${org.fax}`;
    }
    
    // Банковские реквизиты
    if (org.inn) {
      info += `\nИНН: ${org.inn}`;
    }
    
    if (org.kpp) {
      info += `\nКПП: ${org.kpp}`;
    }
    
    if (org.bank_name) {
      info += `\nБанк: ${org.bank_name}`;
    }
    
    if (org.bank_account) {
      info += `\nР/с: ${org.bank_account}`;
    }
    
    if (org.bank_bik) {
      info += `\nБИК: ${org.bank_bik}`;
    }
    
    if (org.bank_corr_account) {
      info += `\nК/с: ${org.bank_corr_account}`;
    }
    
    return info;
  }

  /**
   * Устанавливает значение в ячейку
   */
  setCellValue(worksheet, cellAddress, value) {
    if (!worksheet[cellAddress]) {
      worksheet[cellAddress] = {};
    }
    worksheet[cellAddress].v = value;
    worksheet[cellAddress].t = typeof value === 'number' ? 'n' : 's';
  }

  /**
   * Генерирует номер документа ТОРГ-12
   */
  generateDocumentNumber(order) {
    return `ТОРГ12-${order.order_number}-${moment().format('MMYY')}`;
  }

  /**
   * Проверяет готовность данных для генерации ТОРГ-12
   */
  validateDataForGeneration(order, supplier, buyer) {
    const errors = [];
    
    // Проверяем заказ
    if (!order || !order.orderItems || order.orderItems.length === 0) {
      errors.push('Заказ не содержит позиций');
    }
    
    // Проверяем цены
    if (order.orderItems?.some(item => !item.price || item.price <= 0)) {
      errors.push('Не все позиции заказа имеют цену');
    }
    
    // Проверяем реквизиты поставщика
    if (!supplier.legal_name) {
      errors.push('Не указано полное наименование поставщика');
    }
    
    if (!supplier.inn) {
      errors.push('Не указан ИНН поставщика');
    }
    
    if (!supplier.address) {
      errors.push('Не указан адрес поставщика');
    }
    
    // Проверяем реквизиты покупателя
    if (!buyer.legal_name) {
      errors.push('Не указано полное наименование покупателя');
    }
    
    if (!buyer.inn) {
      errors.push('Не указан ИНН покупателя');
    }
    
    if (!buyer.address) {
      errors.push('Не указан адрес покупателя');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = new Torg12GeneratorService();