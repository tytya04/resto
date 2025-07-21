// Тестовые данные для всех сценариев

const testRestaurants = [
  {
    id: 1,
    name: 'Ресторан "Вкусная еда"',
    legal_name: 'ООО "Вкусная еда"',
    inn: '7701234567',
    kpp: '770101001',
    ogrn: '1027700123456',
    address: 'г. Москва, ул. Тестовая, д. 1',
    phone: '+7 (495) 123-45-67',
    email: 'test@restaurant1.ru',
    bank_name: 'ПАО Сбербанк',
    bank_bik: '044525225',
    bank_account: '40702810123450000001',
    bank_corr_account: '30101810400000000225',
    director: 'Иванов И.И.',
    accountant: 'Петрова А.А.',
    is_active: true
  },
  {
    id: 2,
    name: 'Кафе "У дома"',
    legal_name: 'ИП Сидоров С.С.',
    inn: '770212345678',
    kpp: null,
    ogrn: '304770200012345',
    address: 'г. Москва, ул. Домашняя, д. 5',
    phone: '+7 (495) 987-65-43',
    email: 'test@cafe2.ru',
    bank_name: 'АО "Альфа-Банк"',
    bank_bik: '044525593',
    bank_account: '40802810123450000002',
    bank_corr_account: '30101810200000000593',
    director: 'Сидоров С.С.',
    accountant: 'Сидоров С.С.',
    is_active: true
  }
];

const testUsers = [
  // Администратор
  {
    id: 1,
    telegram_id: '100000001',
    username: 'admin_test',
    first_name: 'Admin',
    last_name: 'Test',
    phone: '+7 (900) 000-00-01',
    role: 'admin',
    restaurant_id: null,
    is_active: true
  },
  // Менеджеры
  {
    id: 2,
    telegram_id: '100000002',
    username: 'manager_test',
    first_name: 'Manager',
    last_name: 'Test',
    phone: '+7 (900) 000-00-02',
    role: 'manager',
    restaurant_id: null,
    is_active: true
  },
  // Закупщики
  {
    id: 3,
    telegram_id: '100000003',
    username: 'buyer_test',
    first_name: 'Buyer',
    last_name: 'Test',
    phone: '+7 (900) 000-00-03',
    role: 'buyer',
    restaurant_id: null,
    is_active: true
  },
  // Пользователи ресторанов
  {
    id: 4,
    telegram_id: '100000004',
    username: 'restaurant1_user',
    first_name: 'Иван',
    last_name: 'Иванов',
    phone: '+7 (900) 000-00-04',
    role: 'restaurant',
    restaurant_id: 1,
    is_active: true
  },
  {
    id: 5,
    telegram_id: '100000005',
    username: 'restaurant2_user',
    first_name: 'Петр',
    last_name: 'Петров',
    phone: '+7 (900) 000-00-05',
    role: 'restaurant',
    restaurant_id: 2,
    is_active: true
  }
];

const testProducts = [
  // Овощи
  {
    product_name: 'Картофель',
    category: 'Овощи',
    unit: 'кг',
    price: 35.00
  },
  {
    product_name: 'Морковь',
    category: 'Овощи',
    unit: 'кг',
    price: 40.00
  },
  {
    product_name: 'Лук репчатый',
    category: 'Овощи',
    unit: 'кг',
    price: 30.00
  },
  {
    product_name: 'Помидоры',
    category: 'Овощи',
    unit: 'кг',
    price: 120.00
  },
  {
    product_name: 'Огурцы',
    category: 'Овощи',
    unit: 'кг',
    price: 100.00
  },
  // Мясо
  {
    product_name: 'Говядина',
    category: 'Мясо',
    unit: 'кг',
    price: 450.00
  },
  {
    product_name: 'Свинина',
    category: 'Мясо',
    unit: 'кг',
    price: 350.00
  },
  {
    product_name: 'Курица',
    category: 'Мясо',
    unit: 'кг',
    price: 150.00
  },
  // Молочные продукты
  {
    product_name: 'Молоко 3.2%',
    category: 'Молочные продукты',
    unit: 'л',
    price: 70.00
  },
  {
    product_name: 'Сметана 20%',
    category: 'Молочные продукты',
    unit: 'кг',
    price: 180.00
  },
  {
    product_name: 'Сыр Российский',
    category: 'Молочные продукты',
    unit: 'кг',
    price: 450.00
  },
  {
    product_name: 'Масло сливочное 82.5%',
    category: 'Молочные продукты',
    unit: 'кг',
    price: 600.00
  },
  // Бакалея
  {
    product_name: 'Мука пшеничная в/с',
    category: 'Бакалея',
    unit: 'кг',
    price: 45.00
  },
  {
    product_name: 'Сахар-песок',
    category: 'Бакалея',
    unit: 'кг',
    price: 65.00
  },
  {
    product_name: 'Соль поваренная',
    category: 'Бакалея',
    unit: 'кг',
    price: 20.00
  },
  {
    product_name: 'Масло подсолнечное',
    category: 'Бакалея',
    unit: 'л',
    price: 110.00
  },
  {
    product_name: 'Рис длиннозерный',
    category: 'Бакалея',
    unit: 'кг',
    price: 95.00
  },
  {
    product_name: 'Макароны',
    category: 'Бакалея',
    unit: 'кг',
    price: 80.00
  }
];

const testOrders = [
  {
    id: 1,
    order_number: 'TEST-001',
    restaurant_id: 1,
    user_id: 4,
    status: 'draft',
    total_amount: null,
    notes: 'Тестовый заказ 1',
    items: [
      {
        product_name: 'Картофель',
        quantity: 50,
        unit: 'кг',
        price: null,
        total: null,
        category: 'Овощи'
      },
      {
        product_name: 'Морковь',
        quantity: 20,
        unit: 'кг',
        price: null,
        total: null,
        category: 'Овощи'
      },
      {
        product_name: 'Говядина',
        quantity: 15,
        unit: 'кг',
        price: null,
        total: null,
        category: 'Мясо'
      }
    ]
  },
  {
    id: 2,
    order_number: 'TEST-002',
    restaurant_id: 2,
    user_id: 5,
    status: 'sent',
    total_amount: null,
    notes: 'Срочный заказ',
    sent_at: new Date(),
    items: [
      {
        product_name: 'Молоко 3.2%',
        quantity: 30,
        unit: 'л',
        price: null,
        total: null,
        category: 'Молочные продукты'
      },
      {
        product_name: 'Мука пшеничная в/с',
        quantity: 25,
        unit: 'кг',
        price: null,
        total: null,
        category: 'Бакалея'
      },
      {
        product_name: 'Курица',
        quantity: 20,
        unit: 'кг',
        price: null,
        total: null,
        category: 'Мясо'
      }
    ]
  }
];

// Вспомогательные функции для создания тестовых данных

const createTestOrder = (overrides = {}) => {
  const defaultOrder = {
    order_number: `TEST-${Date.now()}`,
    restaurant_id: 1,
    user_id: 4,
    status: 'draft',
    total_amount: null,
    notes: 'Тестовый заказ',
    items: []
  };
  
  return { ...defaultOrder, ...overrides };
};

const createTestOrderItem = (overrides = {}) => {
  const defaultItem = {
    product_name: 'Картофель',
    quantity: 10,
    unit: 'кг',
    price: 35.00,
    total: 350.00,
    category: 'Овощи'
  };
  
  return { ...defaultItem, ...overrides };
};

const createTestUser = (overrides = {}) => {
  const timestamp = Date.now();
  const defaultUser = {
    telegram_id: `test_${timestamp}`,
    username: `testuser_${timestamp}`,
    first_name: 'Test',
    last_name: 'User',
    phone: '+7 (900) 000-00-00',
    role: 'restaurant',
    restaurant_id: 1,
    is_active: true
  };
  
  return { ...defaultUser, ...overrides };
};

// Mock для сервисов
const mockGoogleSheetsService = {
  initialize: jest.fn().mockResolvedValue(true),
  fetchNomenclature: jest.fn().mockResolvedValue(testProducts),
  updateCache: jest.fn().mockResolvedValue(true),
  getProductsFromCache: jest.fn().mockResolvedValue(testProducts),
  isOnline: true,
  destroy: jest.fn()
};

const mockEmailService = {
  initialize: jest.fn().mockResolvedValue(true),
  isConfigured: jest.fn().mockReturnValue(true),
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
  sendTorg12: jest.fn().mockResolvedValue({ success: true }),
  sendNewOrderNotification: jest.fn().mockResolvedValue({ success: true }),
  testConnection: jest.fn().mockResolvedValue({ success: true })
};

const mockNotificationService = {
  init: jest.fn(),
  sendToUser: jest.fn().mockResolvedValue(true),
  sendToTelegramId: jest.fn().mockResolvedValue(true),
  notifyManagers: jest.fn().mockResolvedValue(3),
  notifyNewOrder: jest.fn().mockResolvedValue(true),
  notifyOrderStatusChange: jest.fn().mockResolvedValue(true)
};

module.exports = {
  testRestaurants,
  testUsers,
  testProducts,
  testOrders,
  createTestOrder,
  createTestOrderItem,
  createTestUser,
  mockGoogleSheetsService,
  mockEmailService,
  mockNotificationService
};