const { DataTypes } = require('sequelize');
const sequelize = require('../config');

const Settings = sequelize.define('settings', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  key: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  restaurant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'restaurants',
      key: 'id'
    },
    comment: 'NULL для глобальных настроек'
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  value_type: {
    type: DataTypes.ENUM('string', 'number', 'boolean', 'json', 'time'),
    defaultValue: 'string'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['key', 'restaurant_id']
    },
    {
      fields: ['restaurant_id']
    }
  ]
});

// Статические методы для работы с настройками
Settings.getSetting = async function(key, restaurantId = null) {
  const setting = await this.findOne({
    where: {
      key,
      restaurant_id: restaurantId
    }
  });

  if (!setting) return null;

  // Преобразование значения в зависимости от типа
  switch (setting.value_type) {
    case 'number':
      return parseFloat(setting.value);
    case 'boolean':
      return setting.value === 'true';
    case 'json':
      try {
        return JSON.parse(setting.value);
      } catch {
        return null;
      }
    default:
      return setting.value;
  }
};

Settings.setSetting = async function(key, value, restaurantId = null, valueType = 'string', description = null) {
  // Преобразование значения в строку для хранения
  let stringValue;
  switch (valueType) {
    case 'json':
      stringValue = JSON.stringify(value);
      break;
    case 'boolean':
      stringValue = value ? 'true' : 'false';
      break;
    default:
      stringValue = String(value);
  }

  const [setting, created] = await this.upsert({
    key,
    value: stringValue,
    restaurant_id: restaurantId,
    value_type: valueType,
    description
  }, {
    where: {
      key,
      restaurant_id: restaurantId
    }
  });

  return setting;
};

// Получение времени автоматической отправки для ресторана
Settings.getAutoSendTime = async function(restaurantId) {
  const time = await this.getSetting('auto_send_time', restaurantId);
  return time || '00:00'; // По умолчанию полночь
};

// Установка времени автоматической отправки
Settings.setAutoSendTime = async function(restaurantId, time) {
  return await this.setSetting(
    'auto_send_time', 
    time, 
    restaurantId, 
    'time',
    'Время автоматической отправки заявок (HH:MM)'
  );
};

// Проверка, включена ли автоматическая отправка
Settings.isAutoSendEnabled = async function(restaurantId) {
  const enabled = await this.getSetting('auto_send_enabled', restaurantId);
  return enabled !== false; // По умолчанию включено
};

// Включение/выключение автоматической отправки
Settings.setAutoSendEnabled = async function(restaurantId, enabled) {
  return await this.setSetting(
    'auto_send_enabled',
    enabled,
    restaurantId,
    'boolean',
    'Включена ли автоматическая отправка заявок'
  );
};

// Методы для упрощенного доступа к настройкам
Settings.getValue = async function(key, restaurantId = null) {
  return this.getSetting(key, restaurantId);
};

Settings.setValue = async function(key, value, restaurantId = null, valueType = null) {
  // Определяем тип автоматически, если не указан
  if (!valueType) {
    if (typeof value === 'number') valueType = 'number';
    else if (typeof value === 'boolean') valueType = 'boolean';
    else if (typeof value === 'object') valueType = 'json';
    else valueType = 'string';
  }
  
  return this.setSetting(key, value, restaurantId, valueType);
};

// Email настройки
Settings.getEmailSettings = async function() {
  const settings = {
    smtp_host: await this.getValue('smtp_host'),
    smtp_port: await this.getValue('smtp_port'),
    smtp_secure: await this.getValue('smtp_secure'),
    smtp_user: await this.getValue('smtp_user'),
    smtp_pass: await this.getValue('smtp_pass'),
    smtp_from: await this.getValue('smtp_from'),
    accountant_email: await this.getValue('accountant_email'),
    manager_emails: await this.getValue('manager_emails'),
    notification_emails: await this.getValue('notification_emails')
  };
  
  return settings;
};

Settings.setEmailSetting = async function(key, value) {
  const emailKeys = ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from', 
                     'accountant_email', 'manager_emails', 'notification_emails'];
  
  if (!emailKeys.includes(key)) {
    throw new Error(`Invalid email setting key: ${key}`);
  }
  
  let valueType = 'string';
  if (key === 'smtp_port') valueType = 'number';
  if (key === 'smtp_secure') valueType = 'boolean';
  
  return this.setValue(key, value, null, valueType);
};

module.exports = Settings;