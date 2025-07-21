const logger = require('./logger');

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Типы ошибок
class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400);
    this.type = 'ValidationError';
    this.field = field;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Необходима авторизация') {
    super(message, 401);
    this.type = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Недостаточно прав') {
    super(message, 403);
    this.type = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Ресурс') {
    super(`${resource} не найден`, 404);
    this.type = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409);
    this.type = 'ConflictError';
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Ошибка базы данных', originalError = null) {
    super(message, 500);
    this.type = 'DatabaseError';
    this.isOperational = false;
    this.originalError = originalError;
  }
}

class ExternalServiceError extends AppError {
  constructor(service, message, originalError = null) {
    super(`Ошибка внешнего сервиса ${service}: ${message}`, 503);
    this.type = 'ExternalServiceError';
    this.service = service;
    this.originalError = originalError;
  }
}

// Централизованный обработчик ошибок для Telegram бота
const handleTelegramError = async (error, ctx) => {
  const errorId = `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Логируем ошибку с контекстом
  const errorContext = {
    errorId,
    userId: ctx.from?.id,
    username: ctx.from?.username,
    chatId: ctx.chat?.id,
    updateType: ctx.updateType,
    update: ctx.update,
    session: ctx.session
  };
  
  // Определяем критичность
  const isCritical = !error.isOperational || error instanceof DatabaseError;
  
  logger.logError(error, {
    ...errorContext,
    critical: isCritical
  });
  
  // Формируем сообщение для пользователя
  let userMessage = '❌ Произошла ошибка при обработке вашего запроса.';
  
  if (error instanceof AppError) {
    switch (error.constructor) {
      case ValidationError:
        userMessage = `⚠️ ${error.message}`;
        break;
      case AuthenticationError:
        userMessage = '🔒 Необходима авторизация. Используйте /start';
        break;
      case AuthorizationError:
        userMessage = '🚫 У вас недостаточно прав для выполнения этой операции';
        break;
      case NotFoundError:
        userMessage = `🔍 ${error.message}`;
        break;
      case ConflictError:
        userMessage = `⚠️ ${error.message}`;
        break;
      case DatabaseError:
        userMessage = '❌ Ошибка при работе с базой данных. Попробуйте позже.';
        break;
      case ExternalServiceError:
        userMessage = `❌ ${error.message}`;
        break;
      default:
        if (error.isOperational) {
          userMessage = `❌ ${error.message}`;
        }
    }
  }
  
  // В режиме разработки показываем ID ошибки
  if (process.env.NODE_ENV !== 'production') {
    userMessage += `\n\n🆔 ID ошибки: ${errorId}`;
  }
  
  // Отправляем сообщение пользователю
  try {
    await ctx.reply(userMessage);
  } catch (replyError) {
    logger.logError(replyError, {
      context: 'Failed to send error message to user',
      originalError: error.message
    });
  }
  
  // Для критических ошибок отправляем уведомление администраторам
  if (isCritical) {
    const { notifyAdminsAboutError } = require('../services/NotificationService');
    await notifyAdminsAboutError(error, errorContext);
  }
};

// Обработчик для Express (health check endpoint)
const handleExpressError = (err, req, res, next) => {
  const errorId = `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  logger.logError(err, {
    errorId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  // Определяем статус код
  const statusCode = err.statusCode || 500;
  
  // Формируем ответ
  const response = {
    error: {
      id: errorId,
      message: process.env.NODE_ENV === 'production' 
        ? 'Internal Server Error' 
        : err.message,
      timestamp: new Date().toISOString()
    }
  };
  
  if (process.env.NODE_ENV !== 'production') {
    response.error.stack = err.stack;
  }
  
  res.status(statusCode).json(response);
};

// Middleware для отлова ошибок в async функциях
const asyncHandler = (fn) => (ctx, next) => {
  return Promise.resolve(fn(ctx, next)).catch(error => {
    handleTelegramError(error, ctx);
  });
};

// Обертка для сцен Telegraf
const wrapScene = (scene) => {
  const originalEnter = scene.enter.bind(scene);
  const originalLeave = scene.leave.bind(scene);
  
  scene.enter = (handler) => {
    originalEnter(asyncHandler(handler));
  };
  
  scene.leave = (handler) => {
    originalLeave(asyncHandler(handler));
  };
  
  // Обертываем все обработчики в сцене
  const originalOn = scene.on.bind(scene);
  scene.on = (...args) => {
    const handler = args[args.length - 1];
    if (typeof handler === 'function') {
      args[args.length - 1] = asyncHandler(handler);
    }
    return originalOn(...args);
  };
  
  return scene;
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
  handleTelegramError,
  handleExpressError,
  asyncHandler,
  wrapScene
};