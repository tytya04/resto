const registrationHandlers = require('../../src/handlers/registration');
const { User, Restaurant, RegistrationRequest } = require('../../src/database/models');
const { testRestaurants, createTestUser } = require('../fixtures/testData');
const { seedTestData, clearTestData } = require('../fixtures/seedTestData');

describe('Регистрация пользователей', () => {
  let ctx;

  beforeEach(async () => {
    await clearTestData();
    await seedTestData();
    ctx = global.mockCtx();
  });

  describe('Команда /start', () => {
    test('Новый пользователь видит меню выбора роли', async () => {
      ctx.from.id = 999999999;
      
      await registrationHandlers.startCommand(ctx);
      
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Добро пожаловать'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ text: '🏢 Ресторан' }),
                expect.objectContaining({ text: '👔 Менеджер' })
              ])
            ])
          })
        })
      );
    });

    test('Зарегистрированный пользователь видит главное меню', async () => {
      // Создаем пользователя
      const user = await User.create(createTestUser({
        telegram_id: ctx.from.id.toString()
      }));
      
      await registrationHandlers.startCommand(ctx);
      
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining(`Здравствуйте, ${user.first_name}`),
        expect.any(Object)
      );
    });
  });

  describe('Выбор роли', () => {
    beforeEach(() => {
      ctx.callbackQuery = { data: 'reg_role:restaurant' };
    });

    test('Выбор роли "Ресторан" показывает список ресторанов', async () => {
      await registrationHandlers.handleRoleSelection(ctx);
      
      expect(ctx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Выберите ресторан'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ 
                  text: testRestaurants[0].name,
                  callback_data: `reg_restaurant:${testRestaurants[0].id}`
                })
              ])
            ])
          })
        })
      );
    });

    test('Выбор роли "Менеджер" начинает процесс регистрации', async () => {
      ctx.callbackQuery.data = 'reg_role:manager';
      ctx.session = {};
      
      await registrationHandlers.handleRoleSelection(ctx);
      
      expect(ctx.session.registration).toEqual({
        role: 'manager',
        step: 'phone'
      });
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Введите ваш номер телефона')
      );
    });

    test('Выбор роли "Закупщик" начинает процесс регистрации', async () => {
      ctx.callbackQuery.data = 'reg_role:buyer';
      ctx.session = {};
      
      await registrationHandlers.handleRoleSelection(ctx);
      
      expect(ctx.session.registration).toEqual({
        role: 'buyer',
        step: 'phone'
      });
    });
  });

  describe('Выбор ресторана', () => {
    beforeEach(() => {
      ctx.session = { registration: { role: 'restaurant' } };
    });

    test('Выбор существующего ресторана', async () => {
      ctx.callbackQuery = { data: `reg_restaurant:${testRestaurants[0].id}` };
      
      await registrationHandlers.handleRestaurantSelection(ctx);
      
      expect(ctx.session.registration.restaurant_id).toBe(testRestaurants[0].id);
      expect(ctx.session.registration.step).toBe('phone');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Введите ваш номер телефона')
      );
    });

    test('Запрос на добавление нового ресторана', async () => {
      ctx.callbackQuery = { data: 'reg_new_restaurant' };
      
      await registrationHandlers.handleNewRestaurantRequest(ctx);
      
      expect(ctx.session.registration.step).toBe('new_restaurant_name');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Введите название вашего ресторана')
      );
    });
  });

  describe('Ввод данных при регистрации', () => {
    test('Ввод номера телефона', async () => {
      ctx.session = {
        registration: {
          role: 'restaurant',
          restaurant_id: 1,
          step: 'phone'
        }
      };
      ctx.message = { text: '+7 (999) 123-45-67' };
      
      const handled = await registrationHandlers.handleRegistrationText(ctx);
      
      expect(handled).toBe(true);
      expect(ctx.session.registration.phone).toBe('+7 (999) 123-45-67');
      expect(ctx.session.registration.step).toBe('contact_person');
    });

    test('Некорректный номер телефона', async () => {
      ctx.session = {
        registration: {
          role: 'restaurant',
          restaurant_id: 1,
          step: 'phone'
        }
      };
      ctx.message = { text: '123' };
      
      await registrationHandlers.handleRegistrationText(ctx);
      
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Пожалуйста, введите корректный номер телефона')
      );
      expect(ctx.session.registration.step).toBe('phone');
    });

    test('Ввод контактного лица', async () => {
      ctx.session = {
        registration: {
          role: 'restaurant',
          restaurant_id: 1,
          phone: '+7 (999) 123-45-67',
          step: 'contact_person'
        }
      };
      ctx.message = { text: 'Иванов Иван Иванович' };
      
      await registrationHandlers.handleRegistrationText(ctx);
      
      expect(ctx.session.registration.contact_person).toBe('Иванов Иван Иванович');
      expect(ctx.session.registration.step).toBe('completed');
    });

    test('Завершение регистрации', async () => {
      ctx.session = {
        registration: {
          role: 'restaurant',
          restaurant_id: 1,
          phone: '+7 (999) 123-45-67',
          contact_person: 'Иванов И.И.',
          step: 'completed'
        }
      };
      ctx.from = {
        id: 999999999,
        username: 'newuser',
        first_name: 'Иван',
        last_name: 'Иванов'
      };
      
      await registrationHandlers.handleRegistrationText(ctx);
      
      // Проверяем создание заявки
      const request = await RegistrationRequest.findOne({
        where: { telegram_id: ctx.from.id.toString() }
      });
      
      expect(request).toBeTruthy();
      expect(request.requested_role).toBe('restaurant');
      expect(request.status).toBe('pending');
      expect(request.request_data.restaurant_id).toBe(1);
      
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ваша заявка отправлена'),
        expect.any(Object)
      );
    });
  });

  describe('Команда /profile', () => {
    test('Показывает профиль зарегистрированного пользователя', async () => {
      const user = await User.create(createTestUser({
        telegram_id: ctx.from.id.toString(),
        role: 'restaurant',
        restaurant_id: testRestaurants[0].id
      }));
      
      ctx.user = user;
      
      await registrationHandlers.profileCommand(ctx);
      
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ваш профиль'),
        expect.objectContaining({ parse_mode: 'HTML' })
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining(user.first_name),
        expect.any(Object)
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ресторан'),
        expect.any(Object)
      );
    });

    test('Незарегистрированный пользователь получает предложение зарегистрироваться', async () => {
      ctx.user = null;
      
      await registrationHandlers.profileCommand(ctx);
      
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Вы еще не зарегистрированы'),
        expect.any(Object)
      );
    });
  });
});