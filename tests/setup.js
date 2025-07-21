// Настройка окружения для тестов
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Отключаем логи во время тестов

// Mock для Telegraf
jest.mock('telegraf', () => {
  const mockBot = {
    telegram: {
      sendMessage: jest.fn().mockResolvedValue(true),
      editMessageText: jest.fn().mockResolvedValue(true),
      sendDocument: jest.fn().mockResolvedValue(true)
    },
    launch: jest.fn().mockResolvedValue(true),
    stop: jest.fn().mockResolvedValue(true),
    catch: jest.fn()
  };

  return {
    Telegraf: jest.fn(() => mockBot),
    Markup: {
      keyboard: jest.fn(() => ({ resize: jest.fn() })),
      inlineKeyboard: jest.fn(() => ({})),
      button: {
        callback: jest.fn((text, data) => ({ text, callback_data: data }))
      }
    },
    Scenes: {
      Stage: jest.fn(),
      BaseScene: jest.fn()
    },
    session: jest.fn()
  };
});

// Глобальные mock функции
global.mockCtx = (overrides = {}) => ({
  from: { id: 123456789, username: 'testuser', first_name: 'Test', last_name: 'User' },
  chat: { id: 123456789 },
  message: { text: '/start' },
  updateType: 'message',
  session: {},
  user: null,
  reply: jest.fn().mockResolvedValue(true),
  replyWithHTML: jest.fn().mockResolvedValue(true),
  answerCbQuery: jest.fn().mockResolvedValue(true),
  editMessageText: jest.fn().mockResolvedValue(true),
  deleteMessage: jest.fn().mockResolvedValue(true),
  scene: {
    enter: jest.fn().mockResolvedValue(true),
    leave: jest.fn().mockResolvedValue(true)
  },
  ...overrides
});

// Очистка базы данных перед каждым тестом
const { sequelize } = require('../src/database/init');

beforeEach(async () => {
  // Очищаем все таблицы
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  // Закрываем соединение с БД после всех тестов
  await sequelize.close();
});