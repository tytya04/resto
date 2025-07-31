const { DraftOrder, DraftOrderItem, User, Restaurant, RestaurantBranch, NomenclatureCache, ScheduledOrder, sequelize } = require('../database/models');
const { Op, Transaction } = require('sequelize');
const logger = require('../utils/logger');
const moment = require('moment');
const { momentInTimezone, toUTC } = require('../utils/timezone');
const productMatcher = require('./ProductMatcher');

class DraftOrderService {
  /**
   * Выполнить операцию с повторными попытками при SQLITE_BUSY
   */
  async executeWithRetry(operation, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (error.message.includes('SQLITE_BUSY') && i < maxRetries - 1) {
          logger.warn(`SQLITE_BUSY detected, retry ${i + 1}/${maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 1.5; // Увеличиваем задержку с каждой попыткой
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Получить или создать черновик заказа на сегодня
   */
  async getOrCreateDraftOrder(restaurantId, userId, branchId = null, preferExisting = true) {
    try {
      // Всегда ищем существующий черновик для этого ресторана
      const where = {
        restaurant_id: restaurantId,
        status: 'draft'
      };
      
      if (branchId) {
        where.branch_id = branchId;
      }
      
      let draftOrder = await DraftOrder.findOne({
        where,
        include: [
          {
            model: DraftOrderItem,
            as: 'draftOrderItems',
            required: false,
            include: [{
              model: NomenclatureCache,
              as: 'matchedProduct'
            }]
          },
          {
            model: RestaurantBranch,
            as: 'branch'
          }
        ],
        order: [
          ['created_at', 'DESC'] // Самый свежий
        ]
      });

      if (draftOrder) {
        logger.info('Found existing draft:', {
          id: draftOrder.id,
          itemsCount: draftOrder.draftOrderItems ? draftOrder.draftOrderItems.length : 0,
          scheduledFor: draftOrder.scheduled_for
        });
        
        // Обновляем время отправки если нужно
        const nextScheduledTime = await this.getNextScheduledTime(restaurantId);
        if (draftOrder.scheduled_for.getTime() !== nextScheduledTime.getTime()) {
          try {
            draftOrder.scheduled_for = nextScheduledTime;
            await draftOrder.save();
            logger.info('Updated draft scheduled time:', { 
              id: draftOrder.id, 
              newTime: nextScheduledTime 
            });
          } catch (error) {
            // Если не удалось обновить время из-за уникального ограничения - продолжаем с текущим временем
            logger.warn('Could not update scheduled time due to constraint:', { 
              id: draftOrder.id,
              error: error.message 
            });
          }
        }
      } else {
        // Если нет - создаем новый
        const nextScheduledTime = await this.getNextScheduledTime(restaurantId);
        
        // Проверяем, есть ли уже черновик или отправленный заказ на эту дату
        const existingWhere = {
          restaurant_id: restaurantId,
          scheduled_for: nextScheduledTime
        };
        
        if (branchId) {
          existingWhere.branch_id = branchId;
        }
        
        const existingOnDate = await DraftOrder.findOne({
          where: existingWhere
        });
        
        if (existingOnDate) {
          if (existingOnDate.status === 'sent') {
            // Если на эту дату уже отправлен заказ, создаем на следующую доступную дату
            const newScheduledTime = moment(nextScheduledTime).add(1, 'day').toDate();
            
            logger.info('Order already sent for scheduled time, creating for next day', {
              restaurantId,
              originalTime: nextScheduledTime,
              newTime: newScheduledTime
            });
            
            draftOrder = await DraftOrder.create({
              restaurant_id: restaurantId,
              branch_id: branchId,
              user_id: userId,
              scheduled_for: newScheduledTime,
              status: 'draft'
            });
          } else {
            // Если черновик существует, возвращаем его
            draftOrder = existingOnDate;
          }
        } else {
          logger.info('No existing draft found, creating new one', {
            restaurantId,
            scheduledFor: nextScheduledTime
          });
          
          draftOrder = await DraftOrder.create({
            restaurant_id: restaurantId,
            branch_id: branchId,
            user_id: userId,
            scheduled_for: nextScheduledTime,
            status: 'draft'
          });
        }
        
        logger.info('Created new draft:', { id: draftOrder.id });
        
        draftOrder = await DraftOrder.findByPk(draftOrder.id, {
          include: [
            {
              model: DraftOrderItem,
              as: 'draftOrderItems',
              include: [{
                model: NomenclatureCache,
                as: 'matchedProduct'
              }]
            }
          ]
        });
      }

      return draftOrder;
    } catch (error) {
      logger.error('Error getting/creating draft order:', error);
      throw error;
    }
  }

  /**
   * Получить время следующей отправки для ресторана
   */
  async getNextScheduledTime(restaurantId) {
    const schedule = await ScheduledOrder.findOne({
      where: {
        restaurant_id: restaurantId,
        is_active: true
      }
    });

    if (!schedule) {
      // Если нет расписания - по умолчанию завтра в 10:00 по Самарскому времени
      const defaultTime = momentInTimezone()
        .add(1, 'day')
        .hour(10)
        .minute(0)
        .second(0)
        .millisecond(0);
      
      const utcTime = defaultTime.utc().toDate();
      logger.info('No schedule found, using default:', { 
        restaurantId, 
        localTime: defaultTime.format('DD.MM.YYYY HH:mm Z'),
        utcTime 
      });
      return utcTime;
    }

    // Если есть next_run - используем его
    if (schedule.next_run) {
      logger.info('Using next_run from schedule:', { 
        restaurantId, 
        nextRun: schedule.next_run 
      });
      return schedule.next_run;
    }

    const now = momentInTimezone();
    const currentDay = now.day(); // 0 = воскресенье
    const currentTime = now.format('HH:mm');
    
    // Проверяем, есть ли отправка сегодня
    const scheduleDays = JSON.parse(schedule.schedule_days || '[]');
    const scheduleTime = schedule.schedule_time;

    // Преобразуем дни недели (в БД: 1=Пн, 7=Вс; в moment: 0=Вс, 6=Сб)
    const todayScheduleDay = currentDay === 0 ? 7 : currentDay;
    
    if (scheduleDays.includes(todayScheduleDay) && currentTime < scheduleTime) {
      // Отправка сегодня
      const [hours, minutes] = scheduleTime.split(':');
      const scheduledTime = now
        .hour(parseInt(hours))
        .minute(parseInt(minutes))
        .second(0)
        .millisecond(0);
      
      return scheduledTime.utc().toDate();
    }

    // Ищем следующий день отправки
    for (let i = 1; i <= 7; i++) {
      const checkDay = (currentDay + i) % 7;
      const scheduleDay = checkDay === 0 ? 7 : checkDay;
      
      if (scheduleDays.includes(scheduleDay)) {
        const [hours, minutes] = scheduleTime.split(':');
        const scheduledTime = momentInTimezone()
          .add(i, 'days')
          .hour(parseInt(hours))
          .minute(parseInt(minutes))
          .second(0)
          .millisecond(0);
        
        return scheduledTime.utc().toDate();
      }
    }

    // Если расписание пустое - завтра в указанное время
    const [hours, minutes] = scheduleTime.split(':');
    const scheduledTime = momentInTimezone()
      .add(1, 'day')
      .hour(parseInt(hours))
      .minute(parseInt(minutes))
      .second(0)
      .millisecond(0);
    
    return scheduledTime.utc().toDate();
  }

  /**
   * Парсинг текста и добавление продуктов в черновик
   */
  async parseAndAddProducts(draftOrderId, text, userId) {
    const lines = text.trim().split('\n').filter(line => line.trim());
    const results = {
      matched: [],
      unmatched: [],
      needsUnitClarification: [],
      duplicates: [],
      errors: []
    };

    for (const line of lines) {
      try {
        const parsed = this.parseProductLine(line);
        if (!parsed) {
          results.errors.push({ line, error: 'Не удалось распознать формат' });
          continue;
        }

        logger.info('Parsed product line:', {
          line,
          parsed: {
            name: parsed.name,
            quantity: parsed.quantity,
            unit: parsed.unit,
            needsUnitClarification: parsed.needsUnitClarification,
            possibleUnits: parsed.possibleUnits
          }
        });

        // Если нужно уточнение единицы измерения
        if (parsed.needsUnitClarification) {
          logger.info('Product needs unit clarification:', {
            name: parsed.name,
            quantity: parsed.quantity,
            possibleUnits: parsed.possibleUnits
          });
          
          // Проверяем, есть ли уже такой продукт в базе
          const potentialMatch = await productMatcher.findExactMatch(parsed.name);
          logger.info('Potential match found:', {
            found: !!potentialMatch,
            productId: potentialMatch?.id,
            productName: potentialMatch?.product_name
          });
          
          if (potentialMatch) {
            // Проверяем дубликат
            const existingItem = await DraftOrderItem.findOne({
              where: {
                draft_order_id: draftOrderId,
                matched_product_id: potentialMatch.id,
                status: { [Op.in]: ['matched', 'confirmed'] }
              }
            });
            
            logger.info('Checking for existing item:', {
              draftOrderId,
              productId: potentialMatch.id,
              found: !!existingItem,
              existingId: existingItem?.id,
              existingQuantity: existingItem?.quantity
            });
            
            if (existingItem) {
              logger.info('Duplicate found for product with unit clarification:', {
                productName: potentialMatch.product_name,
                existingQuantity: existingItem.quantity,
                newQuantity: parsed.quantity
              });
              
              // Если продукт уже есть, добавляем в дубликаты
              results.duplicates = results.duplicates || [];
              results.duplicates.push({
                existing: existingItem,
                newQuantity: parsed.quantity,
                product: potentialMatch,
                needsUnit: true,
                possibleUnits: parsed.possibleUnits
              });
              continue;
            }
          }
          
          // Только если продукт не найден в черновике, добавляем для уточнения единицы
          results.needsUnitClarification.push({
            line,
            parsed
          });
          continue;
        }

        // Ищем продукт в базе
        const matchedProduct = await productMatcher.findExactMatch(parsed.name);
        
        if (matchedProduct) {
          // Проверяем, есть ли альтернативные варианты этого продукта
          const suggestions = await productMatcher.suggestProducts(parsed.name, 10);
          const alternativeVariants = suggestions.filter(s => 
            s.id !== matchedProduct.id && 
            s.product_name.toLowerCase().includes(parsed.name.toLowerCase()) &&
            (s.product_name.includes('стандарт') || s.product_name.includes('отбор') || 
             s.product_name.includes('премиум') || s.product_name.includes('эконом'))
          );
          
          // Если найдены альтернативные варианты качества, предлагаем выбор
          if (alternativeVariants.length > 0) {
            logger.info('Found alternative variants:', {
              query: parsed.name,
              exactMatch: matchedProduct.product_name,
              alternatives: alternativeVariants.map(a => a.product_name)
            });
            
            // Добавляем основной продукт в начало списка предложений
            const allVariants = [
              { 
                id: matchedProduct.id,
                product_name: matchedProduct.product_name,
                category: matchedProduct.category,
                unit: matchedProduct.unit,
                last_purchase_price: matchedProduct.last_purchase_price,
                score: 0, 
                match_type: 'exact', 
                matched_term: matchedProduct.product_name 
              },
              ...alternativeVariants
            ];
            
            const item = await DraftOrderItem.create({
              draft_order_id: draftOrderId,
              product_name: parsed.name,
              original_name: parsed.name,
              quantity: parsed.quantity,
              unit: parsed.unit,
              status: 'unmatched',
              matched_product_id: null,
              added_by: userId
            });

            results.unmatched.push({
              item,
              suggestions: allVariants
            });
            continue;
          }
          
          // Проверяем, есть ли уже такой продукт в черновике
          const existingItem = await DraftOrderItem.findOne({
            where: {
              draft_order_id: draftOrderId,
              matched_product_id: matchedProduct.id,
              status: { [Op.in]: ['matched', 'confirmed'] }
            }
          });
          
          logger.info('Checking for duplicate:', {
            draftOrderId,
            productId: matchedProduct.id,
            productName: matchedProduct.product_name,
            existingItem: existingItem ? { id: existingItem.id, quantity: existingItem.quantity } : null
          });
          
          if (existingItem) {
            // Продукт уже есть - добавляем к результатам для уточнения
            results.duplicates = results.duplicates || [];
            results.duplicates.push({
              existing: existingItem,
              newQuantity: parsed.quantity,
              product: matchedProduct
            });
            logger.info('Duplicate found:', { productName: matchedProduct.product_name });
          } else {
            // Проверяем, нужно ли уточнить единицу измерения
            const { getPossibleUnits } = require('../config/productUnits');
            const possibleUnits = getPossibleUnits(matchedProduct.product_name);
            
            // Если единица не указана и есть несколько вариантов - запрашиваем уточнение
            if (!parsed.unit && possibleUnits.length > 1) {
              results.needsUnitClarification.push({
                line,
                parsed: {
                  ...parsed,
                  name: matchedProduct.product_name,
                  possibleUnits,
                  matchedProductId: matchedProduct.id
                }
              });
              continue;
            }
            
            // Продукт найден - добавляем с соответствием
            const item = await DraftOrderItem.create({
              draft_order_id: draftOrderId,
              product_name: matchedProduct.product_name,
              original_name: parsed.name,
              quantity: parsed.quantity,
              unit: parsed.unit || matchedProduct.unit,
              status: 'matched',
              matched_product_id: matchedProduct.id,
              added_by: userId
            });

            results.matched.push({
              item,
              matchedProduct
            });
          }
        } else {
          // Продукт не найден - ищем похожие
          const suggestions = await productMatcher.suggestProducts(parsed.name, 5);
          
          // Добавляем отладку
          if (suggestions.length > 0) {
            logger.info('Found suggestions:', {
              query: parsed.name,
              count: suggestions.length,
              first: suggestions[0]
            });
          }
          
          const item = await DraftOrderItem.create({
            draft_order_id: draftOrderId,
            product_name: parsed.name,
            original_name: parsed.name,
            quantity: parsed.quantity,
            unit: parsed.unit,
            status: 'unmatched',
            matched_product_id: null,
            added_by: userId
          });

          results.unmatched.push({
            item,
            suggestions
          });
        }
      } catch (error) {
        logger.error('Error parsing product line:', error);
        results.errors.push({ line, error: error.message });
      }
    }

    return results;
  }

  /**
   * Парсинг строки с продуктом
   */
  parseProductLine(line) {
    const trimmed = line.trim();
    const { getPossibleUnits } = require('../config/productUnits');
    
    // Паттерны для распознавания
    const patterns = [
      // Название - количество - единица
      /^(.+?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*[-–—]?\s*(.+?)$/,
      // Название количество единица
      /^(.+?)\s+(\d+(?:[.,]\d+)?)\s+(кг|г|гр|грамм|л|литр|мл|шт|штук|уп|упак|кор|короб|пач|пачка|бут|бутыл)/i,
      // Количество единица название
      /^(\d+(?:[.,]\d+)?)\s+(кг|г|гр|грамм|л|литр|мл|шт|штук|уп|упак|кор|короб|пач|пачка|бут|бутыл)\s+(.+)/i
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        let name, quantity, unit;
        
        if (pattern === patterns[2]) {
          // Если количество в начале
          quantity = parseFloat(match[1].replace(',', '.'));
          unit = this.normalizeUnit(match[2]);
          name = match[3].trim();
        } else {
          name = match[1].trim();
          quantity = parseFloat(match[2].replace(',', '.'));
          unit = match[3] ? this.normalizeUnit(match[3]) : null;
        }

        if (!isNaN(quantity) && quantity > 0) {
          // Если единица не указана, определяем возможные варианты
          if (!unit) {
            const possibleUnits = getPossibleUnits(name);
            if (possibleUnits.length === 1) {
              unit = possibleUnits[0];
            } else {
              // Нужно уточнение единицы измерения
              return { name, quantity, unit: null, needsUnitClarification: true, possibleUnits };
            }
          }
          return { name, quantity, unit };
        }
      }
    }

    // Если не удалось распознать - пробуем простой вариант
    const words = trimmed.split(/\s+/);
    if (words.length >= 2) {
      // Проверяем, есть ли число в строке
      for (let i = 0; i < words.length; i++) {
        const num = parseFloat(words[i].replace(',', '.'));
        if (!isNaN(num) && num > 0) {
          // Нашли число
          const name = words.slice(0, i).join(' ') || words.slice(i + 1).join(' ');
          
          // Проверяем, указана ли единица после числа
          let unit = null;
          if (i + 1 < words.length && this.isUnit(words[i + 1])) {
            unit = this.normalizeUnit(words[i + 1]);
          }
          
          if (name) {
            if (!unit) {
              const possibleUnits = getPossibleUnits(name);
              logger.info('parseProductLine - checking units:', {
                name: name.trim(),
                possibleUnits,
                count: possibleUnits.length
              });
              if (possibleUnits.length === 1) {
                unit = possibleUnits[0];
              } else {
                // Нужно уточнение единицы измерения
                return { name: name.trim(), quantity: num, unit: null, needsUnitClarification: true, possibleUnits };
              }
            }
            return { name: name.trim(), quantity: num, unit };
          }
        }
      }
    }
    
    // Если в строке только название продукта без количества
    if (words.length >= 1 && !trimmed.match(/\d/)) {
      const name = trimmed;
      const possibleUnits = getPossibleUnits(name);
      
      // Возвращаем с количеством 1 и требованием уточнения единицы
      return { 
        name: name.trim(), 
        quantity: 1, 
        unit: null, 
        needsUnitClarification: true, 
        possibleUnits: possibleUnits.length > 0 ? possibleUnits : ['кг', 'шт']
      };
    }

    return null;
  }
  
  /**
   * Проверка, является ли слово единицей измерения
   */
  isUnit(word) {
    const units = ['кг', 'г', 'гр', 'грамм', 'л', 'литр', 'мл', 'шт', 'штук', 'уп', 'упак', 'кор', 'короб', 'пач', 'пачка', 'бут', 'бутыл'];
    return units.some(u => word.toLowerCase().includes(u));
  }

  /**
   * Нормализация единиц измерения
   */
  normalizeUnit(unit) {
    const unitMap = {
      'г': 'г',
      'гр': 'г',
      'грамм': 'г',
      'кг': 'кг',
      'килограмм': 'кг',
      'л': 'л',
      'литр': 'л',
      'мл': 'мл',
      'миллилитр': 'мл',
      'шт': 'шт',
      'штук': 'шт',
      'штука': 'шт',
      'уп': 'уп',
      'упак': 'уп',
      'упаковка': 'уп',
      'кор': 'кор',
      'короб': 'кор',
      'коробка': 'кор',
      'пач': 'пач',
      'пачка': 'пач',
      'бут': 'бут',
      'бутыл': 'бут',
      'бутылка': 'бут'
    };

    const lower = unit.toLowerCase().replace(/\./g, '');
    return unitMap[lower] || unit;
  }

  /**
   * Подтверждение выбора продукта для нераспознанной позиции
   */
  async confirmProductMatch(itemId, productId) {
    logger.info('Confirming product match:', { itemId, productId });
    
    const item = await DraftOrderItem.findByPk(itemId);
    if (!item) {
      throw new Error('Позиция не найдена');
    }

    const product = await NomenclatureCache.findByPk(productId);
    if (!product) {
      logger.error('Product not found:', { productId });
      throw new Error('Продукт не найден');
    }

    item.matched_product_id = productId;
    item.product_name = product.product_name;
    item.unit = product.unit;
    item.status = 'confirmed';
    await item.save();

    return item;
  }

  /**
   * Получить черновик по ID
   */
  async getDraftById(draftId) {
    return await DraftOrder.findByPk(draftId, {
      include: [
        {
          model: DraftOrderItem,
          as: 'draftOrderItems',
          include: [{
            model: NomenclatureCache,
            as: 'matchedProduct'
          }]
        },
        {
          model: RestaurantBranch,
          as: 'branch'
        }
      ]
    });
  }

  /**
   * Получить текущий черновик для пользователя
   */
  async getCurrentDraft(userId, draftId = null, branchId = null) {
    logger.info('Getting current draft for user:', { userId, draftId, branchId });
    
    // Если передан ID черновика, пробуем получить его
    if (draftId) {
      const draft = await this.getDraftById(draftId);
      if (draft && draft.status === 'draft') {
        logger.info('Found draft by ID:', {
          draftId: draft.id,
          itemsCount: draft.draftOrderItems ? draft.draftOrderItems.length : 0
        });
        return draft;
      }
    }
    
    const user = await User.findByPk(userId, {
      include: ['restaurant']
    });

    if (!user || !user.restaurant_id) {
      throw new Error('Пользователь не привязан к ресторану');
    }

    logger.info('User restaurant:', { restaurantId: user.restaurant_id });
    
    const draft = await this.getOrCreateDraftOrder(user.restaurant_id, userId, branchId);
    
    logger.info('Retrieved draft:', {
      draftId: draft.id,
      status: draft.status,
      itemsCount: draft.draftOrderItems ? draft.draftOrderItems.length : 0,
      scheduledFor: draft.scheduled_for
    });
    
    return draft;
  }

  /**
   * Удалить позицию из черновика
   */
  async removeItem(itemId, userId) {
    const item = await DraftOrderItem.findByPk(itemId, {
      include: ['draftOrder']
    });

    if (!item) {
      throw new Error('Позиция не найдена');
    }

    // Проверяем права
    const user = await User.findByPk(userId);
    if (item.draftOrder.restaurant_id !== user.restaurant_id) {
      throw new Error('Нет прав на удаление этой позиции');
    }

    await item.destroy();
    return true;
  }

  /**
   * Обновить количество позиции
   */
  async updateItemQuantity(itemId, quantity, userId) {
    const item = await DraftOrderItem.findByPk(itemId, {
      include: ['draftOrder']
    });

    if (!item) {
      throw new Error('Позиция не найдена');
    }

    // Проверяем права
    const user = await User.findByPk(userId);
    if (item.draftOrder.restaurant_id !== user.restaurant_id) {
      throw new Error('Нет прав на изменение этой позиции');
    }

    item.quantity = quantity;
    await item.save();
    
    return item;
  }

  /**
   * Преобразовать черновик в заказ
   */
  async convertToOrder(draftOrderId) {
    // Оборачиваем в повторные попытки для обработки SQLITE_BUSY
    return this.executeWithRetry(async () => {
      return this._convertToOrderInternal(draftOrderId);
    });
  }

  async _convertToOrderInternal(draftOrderId) {
    const transaction = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
      autocommit: false
    });
    
    try {
      const draftOrder = await DraftOrder.findByPk(draftOrderId, {
        include: [{
          model: DraftOrderItem,
          as: 'draftOrderItems',
          where: {
            status: { [Op.in]: ['matched', 'confirmed'] }
          }
        }],
        transaction,
        lock: Transaction.LOCK.UPDATE
      });

      if (!draftOrder || !draftOrder.draftOrderItems.length) {
        throw new Error('Нет подтвержденных позиций для отправки');
      }

      // Создаем заказ
      const { Order, OrderItem } = require('../database/models');
      const order = await Order.create({
        restaurant_id: draftOrder.restaurant_id,
        user_id: draftOrder.user_id,
        status: 'sent',
        sent_at: new Date(),
        items_json: JSON.stringify(draftOrder.draftOrderItems.map(item => ({
          name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          product_id: item.matched_product_id
        }))),
        total_amount: 0,
        branch_id: draftOrder.branch_id
      }, { transaction });
      
      // Создаем позиции заказа с отключенными хуками
      for (const draftItem of draftOrder.draftOrderItems) {
        await OrderItem.create({
          order_id: order.id,
          product_name: draftItem.product_name,
          quantity: draftItem.quantity,
          unit: draftItem.unit,
          price: null, // Цена будет установлена менеджером
          total: 0,
          matched_product_id: draftItem.matched_product_id,
          status: 'pending'
        }, { 
          transaction,
          hooks: false // Отключаем хуки чтобы избежать конфликтов с транзакцией
        });
      }

      // Обновляем статус черновика
      draftOrder.status = 'sent';
      await draftOrder.save({ transaction });

      await transaction.commit();
      
      // Отправляем уведомления менеджерам
      const { notificationService } = require('./NotificationService');
      await notificationService.notifyManagers(order, draftOrder);
      
      return order;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = new DraftOrderService();