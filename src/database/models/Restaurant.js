const { DataTypes } = require('sequelize');
const sequelize = require('../config');

const Restaurant = sequelize.define('restaurants', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  legal_name: {
    type: DataTypes.STRING(300),
    allowNull: true
  },
  inn: {
    type: DataTypes.STRING(12),
    allowNull: true,
    unique: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  contact_person: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  contact_phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  contact_email: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  delivery_address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // Дополнительные реквизиты для документов
  kpp: {
    type: DataTypes.STRING(9),
    allowNull: true
  },
  ogrn: {
    type: DataTypes.STRING(15),
    allowNull: true
  },
  bank_name: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  bank_bik: {
    type: DataTypes.STRING(9),
    allowNull: true
  },
  bank_account: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  bank_corr_account: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  director_name: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  accountant_name: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  accountant_email: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  // Дополнительные реквизиты для ТОРГ-12 (временно отключены)
  /*
  okpo: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Код по ОКПО'
  },
  okdp: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Код вида деятельности по ОКДП'
  },
  postal_address: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Почтовый адрес (может отличаться от юридического)'
  },
  fax: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Факс'
  },
  director_position: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: 'Генеральный директор',
    comment: 'Должность руководителя'
  },
  accountant_position: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: 'Главный бухгалтер',
    comment: 'Должность главного бухгалтера'
  },
  warehouse_responsible: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: 'Ответственное лицо склада'
  },
  warehouse_position: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: 'Заведующий складом',
    comment: 'Должность ответственного лица склада'
  },
  */
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  indexes: [
    {
      fields: ['name']
    },
    {
      unique: true,
      fields: ['inn'],
      where: {
        inn: {
          [sequelize.Sequelize.Op.ne]: null
        }
      }
    }
  ]
});

module.exports = Restaurant;