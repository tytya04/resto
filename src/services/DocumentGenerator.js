const puppeteer = require('puppeteer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');
const { Order, OrderItem, Restaurant, User } = require('../database/models');
const config = require('../config');
const logger = require('../utils/logger');

class DocumentGenerator {
  constructor() {
    this.templatesPath = path.join(__dirname, '..', 'templates');
    this.outputPath = path.join(__dirname, '..', '..', 'documents');
    this.initializeHelpers();
  }

  // Инициализация хелперов Handlebars
  initializeHelpers() {
    // Форматирование цены
    handlebars.registerHelper('formatPrice', (price) => {
      return parseFloat(price || 0).toFixed(2);
    });

    // Увеличение индекса на 1 (для нумерации с 1)
    handlebars.registerHelper('increment', (value) => {
      return parseInt(value) + 1;
    });

    // Форматирование даты
    handlebars.registerHelper('formatDate', (date, format) => {
      return moment(date).format(format || 'DD.MM.YYYY');
    });
  }

  // Генерация ТОРГ-12
  async generateTorg12(orderId) {
    try {
      logger.info(`Generating TORG-12 for order ${orderId}`);

      // Получаем данные заказа
      const order = await Order.findByPk(orderId, {
        include: [
          {
            model: OrderItem,
            as: 'orderItems'
          },
          {
            model: Restaurant,
            as: 'restaurant'
          },
          {
            model: User,
            as: 'user'
          }
        ]
      });

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status !== 'approved') {
        throw new Error('Order must be approved to generate TORG-12');
      }

      // Подготавливаем данные для шаблона
      const data = await this.prepareTorg12Data(order);

      // Генерируем HTML из шаблона
      const html = await this.renderTemplate('torg12.hbs', data);

      // Создаем PDF
      const pdfBuffer = await this.generatePDF(html, {
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm'
        }
      });

      // Сохраняем файл
      const fileName = `TORG-12_${order.order_number}_${moment().format('YYYYMMDD_HHmmss')}.pdf`;
      const filePath = await this.saveFile(pdfBuffer, fileName);

      logger.info(`TORG-12 generated successfully: ${fileName}`);

      return {
        fileName,
        filePath,
        buffer: pdfBuffer,
        order: order
      };

    } catch (error) {
      logger.error('Error generating TORG-12:', error);
      throw error;
    }
  }

  // Подготовка данных для ТОРГ-12
  async prepareTorg12Data(order) {
    const vatRate = 20; // НДС 20%

    // Рассчитываем суммы для каждого товара
    const items = order.orderItems.map((item, index) => {
      const sumWithoutVat = parseFloat(item.total || 0) / (1 + vatRate / 100);
      const vatAmount = parseFloat(item.total || 0) - sumWithoutVat;

      return {
        ...item.dataValues,
        index: index + 1,
        sumWithoutVat: sumWithoutVat.toFixed(2),
        vatAmount: vatAmount.toFixed(2)
      };
    });

    // Общие суммы
    const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.total || 0), 0);
    const totalWithoutVat = totalAmount / (1 + vatRate / 100);
    const totalVat = totalAmount - totalWithoutVat;

    // Генерируем номер документа
    const documentNumber = `${order.order_number}-${moment().format('DDMMYY')}`;

    return {
      documentNumber,
      documentDate: moment().format('DD.MM.YYYY'),
      orderNumber: order.order_number,
      orderDate: moment(order.created_at).format('DD.MM.YYYY'),
      supplier: config.supplier,
      buyer: {
        legal_name: order.restaurant.legal_name || order.restaurant.name,
        inn: order.restaurant.inn || 'Не указан',
        kpp: order.restaurant.kpp || 'Не указан',
        address: order.restaurant.address || 'Не указан',
        delivery_address: order.restaurant.delivery_address || order.restaurant.address || 'Не указан',
        director_name: order.restaurant.director_name || 'Не указан'
      },
      items,
      itemsCount: items.length,
      vatRate,
      totalAmount: totalAmount.toFixed(2),
      totalWithoutVat: totalWithoutVat.toFixed(2),
      totalVat: totalVat.toFixed(2)
    };
  }

  // Рендеринг шаблона
  async renderTemplate(templateName, data) {
    const templatePath = path.join(this.templatesPath, templateName);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = handlebars.compile(templateContent);
    return template(data);
  }

  // Генерация PDF через Puppeteer
  async generatePDF(html, options = {}) {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: options.format || 'A4',
        landscape: options.landscape || false,
        printBackground: options.printBackground || true,
        margin: options.margin || {
          top: '20mm',
          right: '10mm',
          bottom: '20mm',
          left: '10mm'
        }
      });

      return pdfBuffer;

    } finally {
      await browser.close();
    }
  }

  // Сохранение файла
  async saveFile(buffer, fileName) {
    // Создаем директорию если её нет
    await fs.mkdir(this.outputPath, { recursive: true });
    
    const filePath = path.join(this.outputPath, fileName);
    await fs.writeFile(filePath, buffer);
    
    return filePath;
  }

  // Генерация счета-фактуры
  async generateInvoice(orderId) {
    // TODO: Реализовать генерацию счета-фактуры
    throw new Error('Invoice generation not implemented yet');
  }

  // Генерация акта выполненных работ
  async generateAct(orderId) {
    // TODO: Реализовать генерацию акта
    throw new Error('Act generation not implemented yet');
  }

  // Отправка документа по email
  async sendDocumentByEmail(documentPath, recipientEmail, subject, body) {
    // Используем новый EmailService
    const emailService = require('./EmailService');
    
    const options = {
      to: recipientEmail,
      subject: subject,
      html: body,
      attachments: [{
        filename: path.basename(documentPath),
        path: documentPath
      }]
    };
    
    try {
      const result = await emailService.sendEmail(options);
      if (result.success) {
        logger.info(`Document sent to ${recipientEmail}: ${result.messageId}`);
        return result;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      logger.error('Error sending document by email:', error);
      throw error;
    }
  }

  // Получение списка сгенерированных документов
  async getGeneratedDocuments(orderId) {
    try {
      const files = await fs.readdir(this.outputPath);
      const orderFiles = files.filter(file => file.includes(`_${orderId}_`));
      
      const documents = [];
      for (const file of orderFiles) {
        const filePath = path.join(this.outputPath, file);
        const stats = await fs.stat(filePath);
        
        documents.push({
          fileName: file,
          filePath: filePath,
          size: stats.size,
          createdAt: stats.birthtime
        });
      }
      
      return documents;
    } catch (error) {
      logger.error('Error getting generated documents:', error);
      return [];
    }
  }

  // Удаление старых документов
  async cleanupOldDocuments(daysToKeep = 30) {
    try {
      const files = await fs.readdir(this.outputPath);
      const now = new Date();
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.outputPath, file);
        const stats = await fs.stat(filePath);
        const ageInDays = (now - stats.birthtime) / (1000 * 60 * 60 * 24);

        if (ageInDays > daysToKeep) {
          await fs.unlink(filePath);
          deletedCount++;
          logger.info(`Deleted old document: ${file}`);
        }
      }

      logger.info(`Cleanup completed. Deleted ${deletedCount} old documents.`);
      return deletedCount;

    } catch (error) {
      logger.error('Error cleaning up old documents:', error);
      return 0;
    }
  }
}

// Создаем singleton экземпляр
const documentGenerator = new DocumentGenerator();

module.exports = documentGenerator;