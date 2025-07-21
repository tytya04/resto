const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { Settings } = require('../database/models');
const moment = require('moment');

class EmailService {
  constructor() {
    this.transporter = null;
    this.templates = {};
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Получаем настройки SMTP из базы данных
      const smtpSettings = await this.getSmtpSettings();
      
      if (!smtpSettings.host || !smtpSettings.user || !smtpSettings.pass) {
        logger.warn('Email service not configured. Skipping initialization.');
        return false;
      }

      // Создаем транспортер
      this.transporter = nodemailer.createTransport({
        host: smtpSettings.host,
        port: smtpSettings.port || 587,
        secure: smtpSettings.secure || false,
        auth: {
          user: smtpSettings.user,
          pass: smtpSettings.pass
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      // Проверяем соединение
      await this.transporter.verify();
      
      // Загружаем шаблоны
      await this.loadTemplates();
      
      this.isInitialized = true;
      logger.info('Email service initialized successfully');
      return true;
      
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      this.isInitialized = false;
      return false;
    }
  }

  async getSmtpSettings() {
    const settings = {
      host: await Settings.getValue('smtp_host') || process.env.EMAIL_HOST,
      port: await Settings.getValue('smtp_port') || process.env.EMAIL_PORT,
      secure: await Settings.getValue('smtp_secure') || false,
      user: await Settings.getValue('smtp_user') || process.env.EMAIL_USER,
      pass: await Settings.getValue('smtp_pass') || process.env.EMAIL_PASS,
      from: await Settings.getValue('smtp_from') || process.env.EMAIL_FROM || 'noreply@restaurant.com'
    };
    
    return settings;
  }

  async loadTemplates() {
    try {
      const templatesDir = path.join(__dirname, '../templates/email');
      const templateFiles = await fs.readdir(templatesDir);
      
      for (const file of templateFiles) {
        if (file.endsWith('.hbs')) {
          const templateName = file.replace('.hbs', '');
          const templatePath = path.join(templatesDir, file);
          const templateContent = await fs.readFile(templatePath, 'utf8');
          
          this.templates[templateName] = handlebars.compile(templateContent);
          logger.info(`Loaded email template: ${templateName}`);
        }
      }
      
      // Регистрируем хелперы для шаблонов
      this.registerHelpers();
      
    } catch (error) {
      logger.error('Error loading email templates:', error);
    }
  }

  registerHelpers() {
    // Форматирование даты
    handlebars.registerHelper('formatDate', (date, format) => {
      return moment(date).format(format || 'DD.MM.YYYY');
    });
    
    // Форматирование времени
    handlebars.registerHelper('formatTime', (date) => {
      return moment(date).format('HH:mm');
    });
    
    // Форматирование числа
    handlebars.registerHelper('formatNumber', (number, decimals = 2) => {
      return parseFloat(number).toFixed(decimals);
    });
    
    // Форматирование валюты
    handlebars.registerHelper('formatCurrency', (amount) => {
      return `${parseFloat(amount).toFixed(2)} ₽`;
    });
  }

  async sendEmail(options) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (!this.transporter) {
      logger.error('Email service not available');
      return { success: false, error: 'Email service not configured' };
    }
    
    try {
      const smtpSettings = await this.getSmtpSettings();
      
      const mailOptions = {
        from: options.from || smtpSettings.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments || []
      };
      
      if (options.cc) mailOptions.cc = options.cc;
      if (options.bcc) mailOptions.bcc = options.bcc;
      
      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info(`Email sent: ${info.messageId} to ${options.to}`);
      return { success: true, messageId: info.messageId };
      
    } catch (error) {
      logger.error('Error sending email:', error);
      return { success: false, error: error.message };
    }
  }

  async sendTemplatedEmail(templateName, data, options) {
    if (!this.templates[templateName]) {
      logger.error(`Email template '${templateName}' not found`);
      return { success: false, error: 'Template not found' };
    }
    
    try {
      // Генерируем HTML из шаблона
      const html = this.templates[templateName](data);
      
      // Объединяем с опциями
      const emailOptions = {
        ...options,
        html
      };
      
      return await this.sendEmail(emailOptions);
      
    } catch (error) {
      logger.error('Error sending templated email:', error);
      return { success: false, error: error.message };
    }
  }

  // Отправка ТОРГ-12 бухгалтеру
  async sendTorg12(order, pdfPath, recipientEmail = null) {
    try {
      const email = recipientEmail || await Settings.getValue('accountant_email');
      
      if (!email) {
        logger.warn('No accountant email configured');
        return { success: false, error: 'Accountant email not configured' };
      }
      
      const data = {
        orderNumber: order.order_number,
        restaurantName: order.restaurant.name,
        date: order.approved_at || order.created_at,
        totalAmount: order.total_amount,
        itemsCount: order.orderItems.length
      };
      
      const options = {
        to: email,
        subject: `ТОРГ-12 для заказа #${order.order_number} - ${order.restaurant.name}`,
        attachments: [{
          filename: `TORG-12_${order.order_number}.pdf`,
          path: pdfPath
        }]
      };
      
      return await this.sendTemplatedEmail('torg12', data, options);
      
    } catch (error) {
      logger.error('Error sending TORG-12:', error);
      return { success: false, error: error.message };
    }
  }

  // Уведомление о новой заявке
  async sendNewOrderNotification(order, managerEmails = []) {
    try {
      const emails = managerEmails.length > 0 
        ? managerEmails 
        : await this.getManagerEmails();
      
      if (emails.length === 0) {
        logger.warn('No manager emails configured');
        return { success: false, error: 'No manager emails' };
      }
      
      const data = {
        orderNumber: order.order_number,
        restaurantName: order.restaurant.name,
        userName: order.user.first_name || order.user.username,
        createdAt: order.created_at,
        itemsCount: order.orderItems.length,
        totalAmount: order.total_amount || 'Не указана',
        items: order.orderItems.map(item => ({
          name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price || 'Не указана'
        }))
      };
      
      const options = {
        to: emails.join(', '),
        subject: `Новая заявка #${order.order_number} от ${order.restaurant.name}`
      };
      
      return await this.sendTemplatedEmail('new_order', data, options);
      
    } catch (error) {
      logger.error('Error sending new order notification:', error);
      return { success: false, error: error.message };
    }
  }

  // Ежедневный отчет для менеджеров
  async sendDailyReport(reportData, managerEmails = []) {
    try {
      const emails = managerEmails.length > 0 
        ? managerEmails 
        : await this.getManagerEmails();
      
      if (emails.length === 0) {
        logger.warn('No manager emails for daily report');
        return { success: false, error: 'No manager emails' };
      }
      
      const data = {
        date: new Date(),
        ordersCount: reportData.ordersCount,
        totalRevenue: reportData.totalRevenue,
        approvedCount: reportData.approvedCount,
        rejectedCount: reportData.rejectedCount,
        pendingCount: reportData.pendingCount,
        topProducts: reportData.topProducts,
        restaurantStats: reportData.restaurantStats
      };
      
      const options = {
        to: emails.join(', '),
        subject: `Ежедневный отчет по заказам - ${moment().format('DD.MM.YYYY')}`
      };
      
      return await this.sendTemplatedEmail('daily_report', data, options);
      
    } catch (error) {
      logger.error('Error sending daily report:', error);
      return { success: false, error: error.message };
    }
  }

  // Уведомление об изменении цен
  async sendPriceChangeNotification(changes, recipientEmails = []) {
    try {
      const emails = recipientEmails.length > 0 
        ? recipientEmails 
        : await this.getAllNotificationEmails();
      
      if (emails.length === 0) {
        logger.warn('No emails for price change notification');
        return { success: false, error: 'No recipient emails' };
      }
      
      const data = {
        date: new Date(),
        changesCount: changes.length,
        changes: changes.map(change => ({
          productName: change.productName,
          unit: change.unit,
          oldPrice: change.oldPrice,
          newPrice: change.newPrice,
          changePercent: ((change.newPrice - change.oldPrice) / change.oldPrice * 100).toFixed(2),
          priceType: change.priceType === 'purchase' ? 'Закупочная' : 'Продажная'
        }))
      };
      
      const options = {
        to: emails.join(', '),
        subject: `Изменение цен - ${moment().format('DD.MM.YYYY')}`
      };
      
      return await this.sendTemplatedEmail('price_changes', data, options);
      
    } catch (error) {
      logger.error('Error sending price change notification:', error);
      return { success: false, error: error.message };
    }
  }

  // Получение email адресов менеджеров
  async getManagerEmails() {
    const emailsStr = await Settings.getValue('manager_emails');
    if (!emailsStr) return [];
    
    return emailsStr.split(',').map(email => email.trim()).filter(Boolean);
  }

  // Получение всех email для уведомлений
  async getAllNotificationEmails() {
    const managerEmails = await this.getManagerEmails();
    const accountantEmail = await Settings.getValue('accountant_email');
    const additionalEmails = await Settings.getValue('notification_emails');
    
    const allEmails = [...managerEmails];
    
    if (accountantEmail) allEmails.push(accountantEmail);
    
    if (additionalEmails) {
      const additional = additionalEmails.split(',').map(e => e.trim()).filter(Boolean);
      allEmails.push(...additional);
    }
    
    // Убираем дубликаты
    return [...new Set(allEmails)];
  }

  // Проверка настроек
  async testConnection() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (!this.transporter) {
      return { success: false, error: 'Email service not configured' };
    }
    
    try {
      await this.transporter.verify();
      return { success: true, message: 'SMTP connection successful' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Обновление настроек SMTP
  async updateSmtpSettings(settings) {
    try {
      // Сохраняем в базу данных
      for (const [key, value] of Object.entries(settings)) {
        await Settings.setValue(`smtp_${key}`, value);
      }
      
      // Переинициализируем сервис
      this.isInitialized = false;
      await this.initialize();
      
      return { success: true };
      
    } catch (error) {
      logger.error('Error updating SMTP settings:', error);
      return { success: false, error: error.message };
    }
  }
}

// Создаем синглтон
const emailService = new EmailService();

module.exports = emailService;