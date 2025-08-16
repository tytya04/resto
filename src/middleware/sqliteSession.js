const { BotSession } = require('../database/models');
const logger = require('../utils/logger');

class SQLiteSession {
  constructor(options = {}) {
    this.ttl = options.ttl || 24 * 60 * 60 * 1000; // 24 hours default
  }

  async get(key) {
    try {
      const session = await BotSession.findOne({ where: { key } });
      
      if (!session) {
        return undefined;
      }
      
      // Проверяем срок действия
      if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
        await session.destroy();
        return undefined;
      }
      
      return session.data;
    } catch (error) {
      logger.error('Error getting session:', error);
      return undefined;
    }
  }

  async set(key, data) {
    try {
      const expiresAt = new Date(Date.now() + this.ttl);
      
      await BotSession.upsert({
        key,
        data,
        expiresAt
      });
      
      return true;
    } catch (error) {
      logger.error('Error setting session:', error);
      return false;
    }
  }

  async delete(key) {
    try {
      await BotSession.destroy({ where: { key } });
      return true;
    } catch (error) {
      logger.error('Error deleting session:', error);
      return false;
    }
  }

  async cleanup() {
    try {
      // Удаляем истекшие сессии
      const deleted = await BotSession.destroy({
        where: {
          expiresAt: {
            [require('sequelize').Op.lt]: new Date()
          }
        }
      });
      
      logger.info(`Cleaned up ${deleted} expired sessions`);
      return deleted;
    } catch (error) {
      logger.error('Error cleaning up sessions:', error);
      return 0;
    }
  }
}

// Middleware factory
function sqliteSession(options = {}) {
  const store = new SQLiteSession(options);
  
  // Запускаем периодическую очистку
  setInterval(() => {
    store.cleanup();
  }, options.cleanupInterval || 60 * 60 * 1000); // Каждый час
  
  return async (ctx, next) => {
    const key = ctx.from ? `${ctx.from.id}` : null;
    
    if (!key) {
      return next();
    }
    
    // Загружаем сессию
    let session = await store.get(key) || {};
    
    // Добавляем сессию в контекст
    Object.defineProperty(ctx, 'session', {
      get: () => session,
      set: (value) => {
        session = value;
      }
    });
    
    // Выполняем следующий middleware
    await next();
    
    // Сохраняем сессию после обработки
    await store.set(key, session);
  };
}

module.exports = sqliteSession;