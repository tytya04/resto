const logger = require('../utils/logger');
const monitoringService = require('../services/MonitoringService');

const loggerMiddleware = async (ctx, next) => {
  const start = Date.now();
  const messageType = ctx.updateType;
  const userId = ctx.from?.id;
  const username = ctx.from?.username;
  const chatId = ctx.chat?.id;
  const userRole = ctx.user?.role || 'guest';
  
  // Определяем команду
  let command = 'unknown';
  if (ctx.message?.text?.startsWith('/')) {
    command = ctx.message.text.split(' ')[0];
  } else if (ctx.callbackQuery?.data) {
    command = `callback:${ctx.callbackQuery.data.split(':')[0]}`;
  } else if (ctx.message?.text) {
    command = 'text_message';
  }
  
  // Начинаем отслеживание производительности
  const perfKey = monitoringService.startCommand(command, userId, userRole);
  
  // Логируем входящее сообщение
  logger.logCommand(userId, command, {
    messageType,
    username,
    chatId,
    text: ctx.message?.text || ctx.callbackQuery?.data,
    userRole
  });
  
  // Записываем обработанное сообщение
  monitoringService.recordMessage(messageType);
  
  try {
    await next();
    
    const duration = Date.now() - start;
    
    // Завершаем отслеживание производительности
    monitoringService.endCommand(perfKey, 'success');
    
    // Логируем успешную обработку
    logger.info('Request processed successfully', {
      type: 'response',
      userId,
      command,
      duration,
      messageType
    });
    
  } catch (error) {
    const duration = Date.now() - start;
    
    // Завершаем отслеживание с ошибкой
    monitoringService.endCommand(perfKey, 'error');
    
    // Записываем ошибку в метрики
    monitoringService.recordError(error.constructor.name, command);
    
    // Логируем ошибку
    logger.logError(error, {
      type: 'middleware_error',
      userId,
      username,
      command,
      duration,
      messageType,
      chatId
    });
    
    // Пробрасываем ошибку дальше
    throw error;
  }
};

// Middleware для логирования действий пользователя
const actionLogger = (actionName) => {
  return async (ctx, next) => {
    const userId = ctx.from?.id;
    const details = {
      username: ctx.from?.username,
      chatId: ctx.chat?.id,
      data: ctx.callbackQuery?.data || ctx.message?.text
    };
    
    logger.logAction(userId, actionName, details);
    
    return next();
  };
};

module.exports = { 
  loggerMiddleware,
  actionLogger
};