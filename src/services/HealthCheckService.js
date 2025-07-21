const express = require('express');
const { sequelize } = require('../database/init');
const logger = require('../utils/logger');
const monitoringService = require('./MonitoringService');
const config = require('../config');

class HealthCheckService {
  constructor() {
    this.app = express();
    this.server = null;
    this.isShuttingDown = false;
    this.healthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {}
    };
    
    this.setupRoutes();
  }
  
  setupRoutes() {
    // Middleware для проверки состояния shutdown
    this.app.use((req, res, next) => {
      if (this.isShuttingDown) {
        res.status(503).json({
          status: 'shutting_down',
          message: 'Server is shutting down'
        });
      } else {
        next();
      }
    });
    
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.checkHealth();
        const statusCode = health.status === 'ok' ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error) {
        logger.logError(error, { context: 'health_check' });
        res.status(503).json({
          status: 'error',
          message: 'Health check failed',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Liveness probe - простая проверка что сервис жив
    this.app.get('/liveness', (req, res) => {
      res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString()
      });
    });
    
    // Readiness probe - проверка готовности принимать трафик
    this.app.get('/readiness', async (req, res) => {
      try {
        const isReady = await this.checkReadiness();
        if (isReady) {
          res.status(200).json({
            status: 'ready',
            timestamp: new Date().toISOString()
          });
        } else {
          res.status(503).json({
            status: 'not_ready',
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        res.status(503).json({
          status: 'error',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Метрики Prometheus
    this.app.get('/metrics', monitoringService.metricsMiddleware());
    
    // Информация о системе
    this.app.get('/info', async (req, res) => {
      try {
        const stats = await monitoringService.getSystemStats();
        res.json({
          version: process.env.npm_package_version || '1.0.0',
          environment: config.nodeEnv,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          stats
        });
      } catch (error) {
        logger.logError(error, { context: 'system_info' });
        res.status(500).json({ error: 'Failed to get system info' });
      }
    });
    
    // Обработка ошибок
    this.app.use((err, req, res, next) => {
      logger.logError(err, { context: 'health_check_error' });
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    });
  }
  
  async checkHealth() {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {}
    };
    
    // Проверка базы данных
    try {
      await sequelize.authenticate();
      health.services.database = {
        status: 'ok',
        message: 'Database connection successful'
      };
    } catch (error) {
      health.status = 'degraded';
      health.services.database = {
        status: 'error',
        message: error.message
      };
    }
    
    // Проверка памяти
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    if (heapUsedPercent > 90) {
      health.status = 'degraded';
      health.services.memory = {
        status: 'warning',
        message: `High memory usage: ${heapUsedPercent.toFixed(2)}%`,
        details: memUsage
      };
    } else {
      health.services.memory = {
        status: 'ok',
        usage: `${heapUsedPercent.toFixed(2)}%`,
        details: memUsage
      };
    }
    
    // Проверка Google Sheets (если включен)
    try {
      const googleSheetsService = require('./GoogleSheetsService');
      if (googleSheetsService.isOnline) {
        health.services.googleSheets = {
          status: 'ok',
          message: 'Google Sheets service is online'
        };
      } else {
        health.services.googleSheets = {
          status: 'offline',
          message: 'Google Sheets service is in offline mode'
        };
      }
    } catch (error) {
      health.services.googleSheets = {
        status: 'unknown',
        message: 'Could not check Google Sheets status'
      };
    }
    
    // Проверка Email сервиса
    try {
      const emailService = require('./EmailService');
      if (emailService.isConfigured()) {
        health.services.email = {
          status: 'ok',
          message: 'Email service is configured'
        };
      } else {
        health.services.email = {
          status: 'not_configured',
          message: 'Email service is not configured'
        };
      }
    } catch (error) {
      health.services.email = {
        status: 'error',
        message: error.message
      };
    }
    
    return health;
  }
  
  async checkReadiness() {
    try {
      // Проверяем подключение к БД
      await sequelize.authenticate();
      
      // Проверяем что нет критических ошибок
      const criticalErrors = logger.getCriticalErrors();
      if (criticalErrors.length > 0) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  start(port = 3000) {
    this.server = this.app.listen(port, () => {
      logger.info(`Health check server started on port ${port}`);
    });
    
    return this.server;
  }
  
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info('Health check server stopped');
          resolve();
        });
      });
    }
  }
  
  setShuttingDown() {
    this.isShuttingDown = true;
  }
}

// Создаем синглтон
const healthCheckService = new HealthCheckService();

module.exports = healthCheckService;