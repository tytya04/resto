const winston = require('winston');
require('winston-daily-rotate-file');
const config = require('../config');
const path = require('path');

// Создаем директорию для логов
const logDir = path.join(__dirname, '../../logs');

// Формат для логов
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] })
);

// Формат для файлов
const fileFormat = winston.format.combine(
  logFormat,
  winston.format.json()
);

// Формат для консоли
const consoleFormat = winston.format.combine(
  logFormat,
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (metadata && Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Настройка ротации файлов
const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, 'application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: fileFormat
});

const errorFileRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
  format: fileFormat
});

// Транспорт для критических ошибок (будет использоваться для Telegram уведомлений)
const criticalErrors = [];

// Создаем writable stream для критических ошибок
const { Writable } = require('stream');
const criticalErrorStream = new Writable({
  write(chunk, encoding, callback) {
    try {
      const message = chunk.toString();
      const log = JSON.parse(message);
      if (log.level === 'error' && log.metadata && log.metadata.critical) {
        criticalErrors.push(log);
      }
    } catch (e) {
      // Игнорируем ошибки парсинга
    }
    callback();
  }
});

const criticalErrorTransport = new winston.transports.Stream({
  stream: criticalErrorStream
});

// Создаем логгер
const logger = winston.createLogger({
  level: config.logLevel || 'info',
  defaultMeta: { service: 'restaurant-procurement-bot' },
  transports: [
    fileRotateTransport,
    errorFileRotateTransport,
    criticalErrorTransport
  ]
});

// В режиме разработки добавляем вывод в консоль
if (config.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    handleExceptions: true,
    handleRejections: true
  }));
}

// В production режиме добавляем консольный транспорт только если stdout доступен
if (config.nodeEnv === 'production' && process.stdout && !process.stdout.destroyed) {
  const consoleTransport = new winston.transports.Console({
    format: consoleFormat,
    handleExceptions: true,
    handleRejections: true
  });
  
  // Обработка ошибок записи в консоль
  consoleTransport.on('error', (err) => {
    if (err.code === 'EPIPE') {
      // Игнорируем EPIPE ошибки
      logger.remove(consoleTransport);
    }
  });
  
  logger.add(consoleTransport);
}

// Методы для структурированного логирования
logger.logCommand = (userId, command, params = {}) => {
  logger.info('Command executed', {
    userId,
    command,
    params,
    type: 'command'
  });
};

logger.logAction = (userId, action, details = {}) => {
  logger.info('User action', {
    userId,
    action,
    details,
    type: 'action'
  });
};

logger.logPerformance = (operation, duration, details = {}) => {
  logger.info('Performance metric', {
    operation,
    duration,
    details,
    type: 'performance'
  });
};

logger.logError = (error, context = {}) => {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    context,
    type: 'error'
  };
  
  // Определяем критичность ошибки
  const isCritical = 
    error.critical || 
    context.critical ||
    error.message.includes('Database') ||
    error.message.includes('Fatal') ||
    error.code === 'ECONNREFUSED';
  
  if (isCritical) {
    errorInfo.critical = true;
  }
  
  logger.error('Application error', errorInfo);
};

// Метод для получения критических ошибок (для отправки в Telegram)
logger.getCriticalErrors = () => {
  const errors = [...criticalErrors];
  criticalErrors.length = 0; // Очищаем массив
  return errors;
};

// Обработка EPIPE ошибок
process.on('EPIPE', () => {
  // Игнорируем EPIPE ошибки
});

process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') {
    // Игнорируем EPIPE ошибки для stdout
    return;
  }
  logger.logError(err, { type: 'stdout_error' });
});

process.stderr.on('error', (err) => {
  if (err.code === 'EPIPE') {
    // Игнорируем EPIPE ошибки для stderr
    return;
  }
  logger.logError(err, { type: 'stderr_error' });
});

// Логирование необработанных исключений
process.on('uncaughtException', (error) => {
  // Игнорируем EPIPE ошибки
  if (error.code === 'EPIPE') {
    return;
  }
  
  logger.logError(error, { 
    type: 'uncaughtException',
    critical: true 
  });
  // Даем время на запись логов перед выходом
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.logError(new Error(`Unhandled Rejection: ${reason}`), {
    type: 'unhandledRejection',
    promise: promise.toString(),
    critical: true
  });
});

module.exports = logger;