const { Order, OrderItem, Restaurant, User, Supplier } = require('../database/models');
const Torg12GeneratorService = require('../services/Torg12GeneratorService');
const logger = require('../utils/logger');
const fs = require('fs');

/**
 * Генерация ТОРГ-12 для заказа
 */
const generateTorg12Command = async (ctx) => {
  try {
    logger.info('generateTorg12Command called', {
      hasMessage: !!ctx.message,
      messageText: ctx.message?.text,
      callbackData: ctx.callbackQuery?.data
    });
    
    // Извлекаем orderId из message.text или из callback_query
    let orderId = null;
    
    if (ctx.message?.text) {
      const match = ctx.message.text.match(/\/generate_torg12_(\d+)/);
      orderId = match ? parseInt(match[1]) : null;
    }
    
    // Если не нашли в message, попробуем извлечь из callback_query
    if (!orderId && ctx.callbackQuery?.data) {
      const callbackMatch = ctx.callbackQuery.data.match(/generate_torg12_after:(\d+)/);
      orderId = callbackMatch ? parseInt(callbackMatch[1]) : null;
    }

    logger.info('Extracted orderId', {
      orderId,
      source: ctx.message?.text ? 'message' : 'callback',
      messageText: ctx.message?.text,
      callbackData: ctx.callbackQuery?.data
    });

    if (!orderId) {
      logger.warn('No orderId found', {
        messageText: ctx.message?.text,
        callbackData: ctx.callbackQuery?.data,
        hasMessage: !!ctx.message
      });
      return ctx.reply('❌ Не указан ID заказа для генерации ТОРГ-12');
    }

    logger.info('Generating ТОРГ-12 for order', { orderId, userId: ctx.user.id });

    // Получаем заказ со всеми связанными данными
    const order = await Order.findByPk(orderId, {
      include: [
        { model: OrderItem, as: 'orderItems' },
        { model: Restaurant, as: 'restaurant' },
        { model: User, as: 'user' }
      ]
    });

    if (!order) {
      return ctx.reply('❌ Заказ не найден');
    }

    if (order.status !== 'approved') {
      return ctx.reply('❌ ТОРГ-12 можно создать только для подтвержденных заказов');
    }

    // Получаем данные поставщика (компания, которая поставляет товары)
    // В нашем случае это может быть отдельная таблица поставщиков или константа
    // Пока используем заглушку - нужно будет настроить в зависимости от бизнес-логики
    const supplier = await getSupplierInfo();

    // Покупатель - это ресторан из заказа
    const buyer = order.restaurant;

    // Проверяем готовность данных
    const validation = Torg12GeneratorService.validateDataForGeneration(order, supplier, buyer);
    if (!validation.isValid) {
      let message = '❌ Невозможно создать ТОРГ-12. Не хватает данных:\n\n';
      validation.errors.forEach((error, index) => {
        message += `${index + 1}. ${error}\n`;
      });
      message += '\n💡 Обратитесь к администратору для заполнения недостающих реквизитов.';
      return ctx.reply(message);
    }

    // Отправляем сообщение о начале генерации
    const processingMessage = await ctx.reply('⏳ Генерируем ТОРГ-12...');

    try {
      // Генерируем документ
      const result = await Torg12GeneratorService.generateTorg12(order, supplier, buyer, {
        contractNumber: `ДОГ-${order.restaurant.id}-${new Date().getFullYear()}`,
        contractDate: order.created_at,
        operationType: 'Поставка продуктов питания',
        department: 'Склад продуктов'
      });

      if (result.success) {
        // Отправляем файл пользователю
        await ctx.replyWithDocument(
          { source: result.filePath, filename: result.fileName },
          {
            caption: `📄 <b>ТОРГ-12</b>\n\n` +
                    `🏢 Покупатель: ${buyer.name}\n` +
                    `📋 Заказ: #${order.order_number}\n` +
                    `📅 Дата документа: ${result.documentDate}\n` +
                    `🔢 Номер документа: ${result.documentNumber}`,
            parse_mode: 'HTML'
          }
        );

        // Удаляем временный файл
        setTimeout(() => {
          try {
            if (fs.existsSync(result.filePath)) {
              fs.unlinkSync(result.filePath);
            }
          } catch (error) {
            logger.warn('Failed to delete temp file', { filePath: result.filePath, error: error.message });
          }
        }, 60000); // Удаляем через минуту

        // Удаляем сообщение о генерации
        try {
          await ctx.deleteMessage(processingMessage.message_id);
        } catch (error) {
          // Игнорируем ошибку удаления
        }

        logger.info('ТОРГ-12 sent successfully', {
          orderId,
          fileName: result.fileName,
          userId: ctx.user.id
        });

        // Добавляем кнопку "Готово" для продолжения работы с заказами
        await ctx.reply('✅ Накладная ТОРГ-12 успешно сгенерирована.\n\nПроверьте документ и нажмите "Готово" для продолжения.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Готово', callback_data: `torg12_complete:${orderId}` }]
            ]
          }
        });

      } else {
        await ctx.editMessageText('❌ Ошибка при генерации ТОРГ-12');
      }

    } catch (generateError) {
      logger.error('Error generating ТОРГ-12', { orderId, error: generateError.message });
      await ctx.editMessageText('❌ Произошла ошибка при генерации документа');
    }

  } catch (error) {
    logger.error('Error in generateTorg12Command', { error: error.message, stack: error.stack });
    ctx.reply('❌ Произошла ошибка при генерации ТОРГ-12');
  }
};

/**
 * Обработчик завершения работы с накладной ТОРГ-12
 */
const handleTorg12Complete = async (ctx) => {
  try {
    await ctx.answerCbQuery('Ищем следующие заказы...');
    
    const currentOrderId = parseInt(ctx.match[1]);
    
    logger.info('Processing TORG-12 completion', {
      currentOrderId,
      userId: ctx.user?.id
    });

    // Помечаем текущий заказ как обработанный (добавим поле torg12_generated)
    await Order.update(
      { torg12_generated: true },
      { where: { id: currentOrderId } }
    );

    // Ищем следующие подтвержденные заказы без ТОРГ-12
    const nextOrders = await Order.findAll({
      where: {
        status: 'approved',
        torg12_generated: { [require('sequelize').Op.or]: [false, null] }
      },
      include: [
        { model: Restaurant, as: 'restaurant' }
      ],
      order: [['created_at', 'ASC']],
      limit: 5
    });

    if (nextOrders.length === 0) {
      await ctx.editMessageText('✅ Все накладные ТОРГ-12 сгенерированы.\n\n🎉 Работа с заказами завершена!');
      return;
    }

    // Показываем список следующих заказов
    let message = `📋 Найдено заказов для генерации ТОРГ-12: ${nextOrders.length}\n\n`;
    
    const keyboard = [];
    
    nextOrders.forEach((order, index) => {
      message += `${index + 1}. Заказ #${order.order_number}\n`;
      message += `   🏢 ${order.restaurant.name}\n`;
      message += `   📅 ${new Date(order.created_at).toLocaleDateString('ru-RU')}\n\n`;
      
      keyboard.push([{
        text: `📄 Создать ТОРГ-12 для заказа #${order.order_number}`,
        callback_data: `generate_torg12_after:${order.id}`
      }]);
    });

    // Добавляем кнопку "Завершить"
    keyboard.push([{ text: '🏁 Завершить работу', callback_data: 'torg12_finish' }]);

    await ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

  } catch (error) {
    logger.error('Error in handleTorg12Complete', { error: error.message });
    await ctx.reply('❌ Ошибка при поиске следующих заказов');
  }
};

/**
 * Обработчик завершения работы с ТОРГ-12
 */
const handleTorg12Finish = async (ctx) => {
  try {
    await ctx.answerCbQuery('Работа завершена');
    await ctx.editMessageText('✅ Работа с накладными ТОРГ-12 завершена.\n\n💼 Возвращайтесь к основному меню.');
  } catch (error) {
    logger.error('Error in handleTorg12Finish', { error: error.message });
  }
};

/**
 * Получает информацию о поставщике
 * TODO: Нужно настроить в зависимости от бизнес-модели
 */
async function getSupplierInfo() {
  try {
    // Получаем данные поставщика из базы
    let supplier = await Supplier.findOne();
    
    // Если данных нет, создаем запись с дефолтными значениями
    if (!supplier) {
      logger.info('Creating default supplier record');
      supplier = await Supplier.create({
        name: 'ООО "ПОСТАВЩИК ПРОДУКТОВ"',
        inn: '1234567890',
        kpp: '123456789',
        ogrn: '1234567890123',
        okpo: '12345678',
        okved: '01234567',
        legal_address: '123456, г. Москва, ул. Поставщиков, д. 1',
        postal_address: '123456, г. Москва, ул. Поставщиков, д. 1',
        contact_phone: '+7 (495) 123-45-67',
        fax: '+7 (495) 123-45-68',
        contact_email: 'info@supplier.ru',
        bank_name: 'ПАО "БАНК ПОСТАВЩИКА"',
        bank_bik: '044525225',
        bank_account: '40702810100000000001',
        bank_corr_account: '30101810400000000225',
        director_name: 'Иванов Иван Иванович',
        director_position: 'Генеральный директор',
        accountant_name: 'Петрова Анна Сергеевна',
        accountant_position: 'Главный бухгалтер',
        warehouse_responsible: 'Сидоров Петр Васильевич',
        warehouse_position: 'Заведующий складом'
      });
    }
    
    // Возвращаем с правильными именами полей для ТОРГ-12
    return {
      legal_name: supplier.name,
      name: supplier.name,
      inn: supplier.inn,
      kpp: supplier.kpp,
      ogrn: supplier.ogrn,
      okpo: supplier.okpo,
      okdp: supplier.okved,
      address: supplier.legal_address,
      legal_address: supplier.legal_address,
      postal_address: supplier.postal_address,
      contact_phone: supplier.contact_phone,
      fax: supplier.fax,
      contact_email: supplier.contact_email,
      bank_name: supplier.bank_name,
      bank_bik: supplier.bank_bik,
      bank_account: supplier.bank_account,
      bank_corr_account: supplier.bank_corr_account,
      director_name: supplier.director_name,
      director_position: supplier.director_position,
      accountant_name: supplier.accountant_name,
      accountant_position: supplier.accountant_position,
      warehouse_responsible: supplier.warehouse_responsible,
      warehouse_position: supplier.warehouse_position
    };
  } catch (error) {
    logger.error('Error getting supplier info:', error);
    // В случае ошибки возвращаем дефолтные значения
    return {
      legal_name: 'ООО "ПОСТАВЩИК ПРОДУКТОВ"',
      name: 'Поставщик Продуктов',
      inn: '1234567890',
      kpp: '123456789',
      ogrn: '1234567890123',
      okpo: '12345678',
      okdp: '01234567',
      address: '123456, г. Москва, ул. Поставщиков, д. 1',
      postal_address: '123456, г. Москва, ул. Поставщиков, д. 1',
      contact_phone: '+7 (495) 123-45-67',
      fax: '+7 (495) 123-45-68',
      contact_email: 'info@supplier.ru',
      bank_name: 'ПАО "БАНК ПОСТАВЩИКА"',
      bank_bik: '044525225',
      bank_account: '40702810100000000001',
      bank_corr_account: '30101810400000000225',
      director_name: 'Иванов Иван Иванович',
      director_position: 'Генеральный директор',
      accountant_name: 'Петрова Анна Сергеевна',
      accountant_position: 'Главный бухгалтер',
      warehouse_responsible: 'Сидоров Петр Васильевич',
      warehouse_position: 'Заведующий складом'
    };
  }
}

/**
 * Меню документов
 */
const documentsMenu = async (ctx) => {
  const message = '📄 <b>Документы</b>\n\n' +
                  'Выберите тип документа для создания:';
  
  const keyboard = [
    [{ text: '📋 ТОРГ-12 по заказу', callback_data: 'doc_torg12_by_order' }],
    [{ text: '📊 Отчет по закупкам', callback_data: 'doc_purchase_report' }],
    [{ text: '🔙 Назад в меню', callback_data: 'back_to_main' }]
  ];

  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard }
  });
};

/**
 * Выбор заказа для генерации ТОРГ-12
 */
const selectOrderForTorg12 = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    
    // Получаем подтвержденные заказы
    const orders = await Order.findAll({
      where: { status: 'approved' },
      include: [
        { model: Restaurant, as: 'restaurant' },
        { model: OrderItem, as: 'orderItems' }
      ],
      order: [['created_at', 'DESC']],
      limit: 10
    });

    if (orders.length === 0) {
      return ctx.editMessageText('❌ Нет подтвержденных заказов для создания ТОРГ-12');
    }

    let message = '📋 <b>Выберите заказ для создания ТОРГ-12:</b>\n\n';
    const keyboard = [];

    orders.forEach((order, index) => {
      const totalAmount = order.orderItems.reduce((sum, item) => sum + (item.total || 0), 0);
      message += `${index + 1}. Заказ #${order.order_number}\n`;
      message += `   🏢 ${order.restaurant.name}\n`;
      message += `   💰 ${totalAmount.toFixed(2)} ₽\n\n`;
      
      keyboard.push([{
        text: `📄 ТОРГ-12 для #${order.order_number}`,
        callback_data: `generate_torg12:${order.id}`
      }]);
    });

    keyboard.push([{ text: '🔙 Назад', callback_data: 'documents_menu' }]);

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    });

  } catch (error) {
    logger.error('Error in selectOrderForTorg12', error);
    ctx.reply('❌ Ошибка при загрузке заказов');
  }
};

/**
 * Генерация ТОРГ-12 через callback
 */
const generateTorg12Callback = async (ctx) => {
  try {
    const orderId = parseInt(ctx.match[1]);
    await ctx.answerCbQuery('Генерируем ТОРГ-12...');
    
    // Используем ту же логику что и в команде
    ctx.message = { text: `/generate_torg12_${orderId}` };
    return generateTorg12Command(ctx);
    
  } catch (error) {
    logger.error('Error in generateTorg12Callback', error);
    ctx.reply('❌ Ошибка при генерации ТОРГ-12');
  }
};

module.exports = {
  generateTorg12Command,
  documentsMenu,
  selectOrderForTorg12,
  generateTorg12Callback,
  handleTorg12Complete,
  handleTorg12Finish,
  getSupplierInfo
};