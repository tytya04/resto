const { Markup } = require('telegraf');
const fs = require('fs').promises;
const path = require('path');
const { Order, Restaurant } = require('../database/models');
const documentGenerator = require('../services/DocumentGenerator');
const config = require('../config');
const logger = require('../utils/logger');

// Команда генерации ТОРГ-12
const generateTorg12Command = async (ctx) => {
  const match = ctx.message.text.match(/^\/generate_torg12_(\d+)$/);
  
  if (!match) {
    return ctx.reply('❌ Неверный формат команды');
  }
  
  const orderId = parseInt(match[1]);
  
  try {
    // Проверяем права доступа
    if (!['manager', 'buyer'].includes(ctx.user.role)) {
      return ctx.reply('⚠️ У вас нет прав для генерации документов');
    }
    
    // Проверяем заказ
    const order = await Order.findByPk(orderId, {
      include: [{ model: Restaurant, as: 'restaurant' }]
    });
    
    if (!order) {
      return ctx.reply('❌ Заказ не найден');
    }
    
    if (order.status !== 'approved') {
      return ctx.reply('⚠️ ТОРГ-12 можно генерировать только для одобренных заказов');
    }
    
    await ctx.reply('⏳ Генерирую документ ТОРГ-12...');
    
    // Генерируем документ
    const result = await documentGenerator.generateTorg12(orderId);
    
    // Отправляем документ в чат
    await ctx.replyWithDocument(
      { source: result.filePath },
      {
        caption: `📄 ТОРГ-12 для заказа #${order.order_number}\n` +
                `🏢 ${order.restaurant.name}\n` +
                `💰 Сумма: ${order.total_amount} ₽`,
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('📧 Отправить на email', `send_doc_email:${orderId}:${result.fileName}`)],
          [Markup.button.callback('🗑 Удалить', `delete_doc:${result.fileName}`)]
        ])
      }
    );
    
    logger.info(`TORG-12 sent to user ${ctx.user.id} for order ${orderId}`);
    
  } catch (error) {
    logger.error('Error generating TORG-12:', error);
    await ctx.reply(`❌ Ошибка при генерации документа: ${error.message}`);
  }
};

// Обработчик отправки документа на email
const sendDocumentByEmail = async (ctx) => {
  await ctx.answerCbQuery();
  
  const [orderId, fileName] = ctx.match.slice(1);
  
  try {
    // Получаем заказ и ресторан
    const order = await Order.findByPk(orderId, {
      include: [{ model: Restaurant, as: 'restaurant' }]
    });
    
    if (!order) {
      return ctx.reply('❌ Заказ не найден');
    }
    
    // Определяем email получателя
    const recipientEmail = order.restaurant.accountant_email || 
                          order.restaurant.contact_email || 
                          config.email.accountantEmail;
    
    if (!recipientEmail) {
      return ctx.reply('❌ Email бухгалтера не указан');
    }
    
    const filePath = path.join(__dirname, '..', '..', 'documents', fileName);
    
    // Проверяем существование файла
    try {
      await fs.access(filePath);
    } catch {
      return ctx.reply('❌ Файл документа не найден');
    }
    
    // Отправляем email
    const subject = `ТОРГ-12 для заказа #${order.order_number}`;
    const body = `
      <h3>Документ ТОРГ-12</h3>
      <p>Добрый день!</p>
      <p>Направляем вам товарную накладную ТОРГ-12 для заказа #${order.order_number}.</p>
      <p><strong>Информация о заказе:</strong></p>
      <ul>
        <li>Номер заказа: ${order.order_number}</li>
        <li>Ресторан: ${order.restaurant.name}</li>
        <li>Сумма: ${order.total_amount} ₽</li>
        <li>Дата: ${new Date(order.approved_at).toLocaleDateString('ru-RU')}</li>
      </ul>
      <p>Документ во вложении.</p>
      <p>С уважением,<br>${config.supplier.name}</p>
    `;
    
    // Используем EmailService для отправки ТОРГ-12
    const emailService = require('../services/EmailService');
    const result = await emailService.sendTorg12(order, filePath, recipientEmail);
    
    if (result.success) {
      await ctx.reply(
        `✅ Документ отправлен на email: ${recipientEmail}\n\n` +
        `📄 ${fileName}`
      );
    } else {
      throw new Error(result.error);
    }
    
  } catch (error) {
    logger.error('Error sending document by email:', error);
    await ctx.reply(`❌ Ошибка при отправке документа: ${error.message}`);
  }
};

// Удаление документа
const deleteDocument = async (ctx) => {
  await ctx.answerCbQuery();
  
  const fileName = ctx.match[1];
  
  try {
    const filePath = path.join(__dirname, '..', '..', 'documents', fileName);
    
    // Удаляем файл
    await fs.unlink(filePath);
    
    await ctx.editMessageCaption(
      `🗑 Документ ${fileName} удален`,
      { reply_markup: undefined }
    );
    
  } catch (error) {
    logger.error('Error deleting document:', error);
    await ctx.reply('❌ Ошибка при удалении документа');
  }
};

// Список документов для заказа
const listOrderDocuments = async (ctx) => {
  const match = ctx.message.text.match(/^\/order_documents_(\d+)$/);
  
  if (!match) {
    return ctx.reply('❌ Неверный формат команды');
  }
  
  const orderId = parseInt(match[1]);
  
  try {
    const order = await Order.findByPk(orderId, {
      include: [{ model: Restaurant, as: 'restaurant' }]
    });
    
    if (!order) {
      return ctx.reply('❌ Заказ не найден');
    }
    
    const documents = await documentGenerator.getGeneratedDocuments(order.order_number);
    
    if (documents.length === 0) {
      return ctx.reply(
        `📋 Для заказа #${order.order_number} нет сгенерированных документов\n\n` +
        `Используйте /generate_torg12_${orderId} для создания ТОРГ-12`
      );
    }
    
    let message = `📋 <b>Документы для заказа #${order.order_number}</b>\n\n`;
    
    documents.forEach((doc, index) => {
      const sizeKb = (doc.size / 1024).toFixed(2);
      const date = new Date(doc.createdAt).toLocaleDateString('ru-RU');
      
      message += `${index + 1}. ${doc.fileName}\n`;
      message += `   📏 Размер: ${sizeKb} KB\n`;
      message += `   📅 Создан: ${date}\n\n`;
    });
    
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('📄 Создать ТОРГ-12', `quick_torg12:${orderId}`)],
      [Markup.button.callback('🗑 Очистить старые документы', 'cleanup_old_docs')]
    ]);
    
    await ctx.reply(message, { 
      parse_mode: 'HTML',
      reply_markup: keyboard 
    });
    
  } catch (error) {
    logger.error('Error listing documents:', error);
    await ctx.reply('❌ Ошибка при получении списка документов');
  }
};

// Быстрая генерация ТОРГ-12
const quickGenerateTorg12 = async (ctx) => {
  await ctx.answerCbQuery();
  
  const orderId = parseInt(ctx.match[1]);
  
  // Имитируем команду
  ctx.message = { text: `/generate_torg12_${orderId}` };
  return generateTorg12Command(ctx);
};

// Очистка старых документов
const cleanupOldDocuments = async (ctx) => {
  await ctx.answerCbQuery();
  
  if (ctx.user.role !== 'manager') {
    return ctx.reply('⚠️ Только менеджеры могут выполнять очистку');
  }
  
  try {
    const deletedCount = await documentGenerator.cleanupOldDocuments(30);
    
    await ctx.reply(
      `🗑 Очистка завершена\n\n` +
      `Удалено документов старше 30 дней: ${deletedCount}`
    );
    
  } catch (error) {
    logger.error('Error cleaning up documents:', error);
    await ctx.reply('❌ Ошибка при очистке документов');
  }
};

// Меню документов
const documentsMenu = async (ctx) => {
  const keyboard = Markup.keyboard([
    ['📄 Последние документы', '🗑 Очистка документов'],
    ['📊 Статистика документов', '⚙️ Настройки документов'],
    ['🔙 Главное меню']
  ]).resize();
  
  await ctx.reply(
    '📄 <b>Управление документами</b>\n\n' +
    'Выберите действие:',
    {
      parse_mode: 'HTML',
      reply_markup: keyboard
    }
  );
};

// Последние документы
const recentDocuments = async (ctx) => {
  try {
    const documentsPath = path.join(__dirname, '..', '..', 'documents');
    const files = await fs.readdir(documentsPath);
    
    // Получаем информацию о файлах
    const fileStats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(documentsPath, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          path: filePath,
          size: stats.size,
          created: stats.birthtime
        };
      })
    );
    
    // Сортируем по дате создания
    fileStats.sort((a, b) => b.created - a.created);
    
    // Берем последние 10
    const recent = fileStats.slice(0, 10);
    
    if (recent.length === 0) {
      return ctx.reply('📋 Нет сгенерированных документов');
    }
    
    let message = '📄 <b>Последние документы:</b>\n\n';
    
    recent.forEach((file, index) => {
      const sizeKb = (file.size / 1024).toFixed(2);
      const date = new Date(file.created).toLocaleDateString('ru-RU');
      const time = new Date(file.created).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      message += `${index + 1}. ${file.name}\n`;
      message += `   📏 ${sizeKb} KB | 📅 ${date} ${time}\n\n`;
    });
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    
  } catch (error) {
    logger.error('Error getting recent documents:', error);
    await ctx.reply('❌ Ошибка при получении списка документов');
  }
};

module.exports = {
  generateTorg12Command,
  sendDocumentByEmail,
  deleteDocument,
  listOrderDocuments,
  quickGenerateTorg12,
  cleanupOldDocuments,
  documentsMenu,
  recentDocuments
};