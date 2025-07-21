module.exports = {
  botToken: process.env.BOT_TOKEN,
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  botName: process.env.BOT_NAME || 'RestaurantProcurementBot',
  supportChatId: process.env.SUPPORT_CHAT_ID,
  adminUserIds: process.env.ADMIN_USER_IDS ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id.trim())) : [],
  googleSheets: {
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A:E',
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : ''
  },
  cacheUpdateSchedule: process.env.CACHE_UPDATE_SCHEDULE || '0 */6 * * *',
  
  // Реквизиты компании-поставщика
  supplier: {
    name: process.env.SUPPLIER_NAME || 'ООО "ПродТорг"',
    inn: process.env.SUPPLIER_INN || '7734567890',
    kpp: process.env.SUPPLIER_KPP || '773401001',
    ogrn: process.env.SUPPLIER_OGRN || '1157746123456',
    address: process.env.SUPPLIER_ADDRESS || '109147, г. Москва, ул. Марксистская, д. 34, корп. 2',
    phone: process.env.SUPPLIER_PHONE || '+7 (495) 123-45-67',
    email: process.env.SUPPLIER_EMAIL || 'info@prodtorg.ru',
    bank: {
      name: process.env.SUPPLIER_BANK_NAME || 'АО "Сбербанк России"',
      bik: process.env.SUPPLIER_BANK_BIK || '044525225',
      account: process.env.SUPPLIER_BANK_ACCOUNT || '40702810638000012345',
      corrAccount: process.env.SUPPLIER_BANK_CORR_ACCOUNT || '30101810400000000225'
    },
    director: process.env.SUPPLIER_DIRECTOR || 'Иванов И.И.',
    accountant: process.env.SUPPLIER_ACCOUNTANT || 'Петрова А.А.'
  },
  
  // Email настройки
  email: {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM || 'noreply@prodtorg.ru',
    accountantEmail: process.env.ACCOUNTANT_EMAIL || 'accountant@prodtorg.ru'
  }
};