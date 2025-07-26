require('dotenv').config();
const { NomenclatureCache, ProductSynonym } = require('./src/database/models');
const logger = require('./src/utils/logger');

const productsData = {
  "Зелень": [
    { name: "Базилик красный", unit: "кг" },
    { name: "Дайкон", unit: "кг" },
    { name: "Имбирь корень", unit: "кг" },
    { name: "Кинза весовая", unit: "кг" },
    { name: "Кинза пучки", unit: "шт" },
    { name: "Лист салата", unit: "шт" },
    { name: "Лук зелёный", unit: "кг" },
    { name: "Мята свежая", unit: "кг" },
    { name: "Огурцы гладкие", unit: "кг" },
    { name: "Перец стручковый зелёный острый", unit: "кг" },
    { name: "Перец стручковый красный острый", unit: "кг" },
    { name: "Петрушка весовая", unit: "кг" },
    { name: "Петрушка пучки", unit: "шт" },
    { name: "Редис", unit: "кг" },
    { name: "Тархун свежий", unit: "кг" },
    { name: "Укроп пучки", unit: "шт" },
    { name: "Укроп весовой", unit: "кг" },
    { name: "Чеснок крупный", unit: "кг" },
    { name: "Шпинат весовой", unit: "кг" },
    { name: "Щавель", unit: "кг" }
  ],
  "Специи": [
    { name: "Арахис очищенный", unit: "кг" },
    { name: "Арахис солёный", unit: "кг" },
    { name: "Барбарис", unit: "кг" },
    { name: "Базилик сушёный", unit: "кг" },
    { name: "Ваниль", unit: "кг" },
    { name: "Ванилин", unit: "кг" },
    { name: "Гвоздика", unit: "кг" },
    { name: "Желатин", unit: "кг" },
    { name: "Зира", unit: "кг" },
    { name: "Имбирь молотый", unit: "кг" },
    { name: "Карри", unit: "кг" },
    { name: "Кориандр", unit: "кг" },
    { name: "Корица", unit: "кг" },
    { name: "Кунжут белый", unit: "кг" },
    { name: "Кунжут чёрный", unit: "кг" },
    { name: "Куркума", unit: "кг" },
    { name: "Лавровый лист", unit: "кг" },
    { name: "Мак", unit: "кг" },
    { name: "Мускатный орех", unit: "кг" },
    { name: "Орегано", unit: "кг" },
    { name: "Паприка", unit: "кг" },
    { name: "Перец белый молотый", unit: "кг" },
    { name: "Перец душистый", unit: "кг" },
    { name: "Перец розовый", unit: "кг" },
    { name: "Перец чёрный горошек", unit: "кг" },
    { name: "Перец чёрный молотый", unit: "кг" },
    { name: "Петрушка сушёная", unit: "кг" },
    { name: "Приправа для курицы", unit: "кг" },
    { name: "Приправа для мяса", unit: "кг" },
    { name: "Приправа для плова", unit: "кг" },
    { name: "Приправа для рыбы", unit: "кг" },
    { name: "Розмарин", unit: "кг" },
    { name: "Сахар ванильный", unit: "кг" },
    { name: "Семена горчицы", unit: "кг" },
    { name: "Смесь итальянских трав", unit: "кг" },
    { name: "Смесь перцев", unit: "кг" },
    { name: "Соль морская", unit: "кг" },
    { name: "Соль поваренная", unit: "кг" },
    { name: "Сумак", unit: "кг" },
    { name: "Тимьян", unit: "кг" },
    { name: "Тмин", unit: "кг" },
    { name: "Укроп сушёный", unit: "кг" },
    { name: "Уксус 6%", unit: "л" },
    { name: "Уксус 9%", unit: "л" },
    { name: "Уксус яблочный", unit: "л" },
    { name: "Фенхель", unit: "кг" },
    { name: "Хмели-сунели", unit: "кг" },
    { name: "Чабрец", unit: "кг" },
    { name: "Чеснок сушёный", unit: "кг" },
    { name: "Шафран", unit: "кг" }
  ],
  "Овощи": [
    { name: "Баклажаны", unit: "кг" },
    { name: "Брокколи", unit: "кг" },
    { name: "Кабачки", unit: "кг" },
    { name: "Капуста белокочанная", unit: "кг" },
    { name: "Капуста пекинская", unit: "кг" },
    { name: "Капуста цветная", unit: "кг" },
    { name: "Картофель", unit: "кг" },
    { name: "Картофель красный", unit: "кг" },
    { name: "Картофель молодой", unit: "кг" },
    { name: "Кукуруза початки", unit: "шт" },
    { name: "Лук красный", unit: "кг" },
    { name: "Лук репчатый", unit: "кг" },
    { name: "Морковь", unit: "кг" },
    { name: "Огурцы", unit: "кг" },
    { name: "Перец болгарский жёлтый", unit: "кг" },
    { name: "Перец болгарский зелёный", unit: "кг" },
    { name: "Перец болгарский красный", unit: "кг" },
    { name: "Помидоры", unit: "кг" },
    { name: "Помидоры розовые", unit: "кг" },
    { name: "Помидоры черри", unit: "кг" },
    { name: "Свёкла", unit: "кг" },
    { name: "Сельдерей корень", unit: "кг" },
    { name: "Сельдерей стебель", unit: "кг" },
    { name: "Тыква", unit: "кг" },
    { name: "Фасоль стручковая", unit: "кг" },
    { name: "Цукини", unit: "кг" },
    { name: "Чеснок", unit: "кг" }
  ],
  "Фрукты": [
    { name: "Абрикосы", unit: "кг" },
    { name: "Авокадо", unit: "шт" },
    { name: "Ананас", unit: "шт" },
    { name: "Апельсины", unit: "кг" },
    { name: "Арбуз", unit: "кг" },
    { name: "Бананы", unit: "кг" },
    { name: "Виноград белый", unit: "кг" },
    { name: "Виноград красный", unit: "кг" },
    { name: "Виноград чёрный", unit: "кг" },
    { name: "Вишня", unit: "кг" },
    { name: "Гранат", unit: "кг" },
    { name: "Грейпфрут", unit: "кг" },
    { name: "Груши", unit: "кг" },
    { name: "Дыня", unit: "кг" },
    { name: "Киви", unit: "кг" },
    { name: "Клубника", unit: "кг" },
    { name: "Лайм", unit: "кг" },
    { name: "Лимон", unit: "кг" },
    { name: "Малина", unit: "кг" },
    { name: "Манго", unit: "шт" },
    { name: "Мандарины", unit: "кг" },
    { name: "Персики", unit: "кг" },
    { name: "Слива", unit: "кг" },
    { name: "Хурма", unit: "кг" },
    { name: "Черешня", unit: "кг" },
    { name: "Яблоки зелёные", unit: "кг" },
    { name: "Яблоки красные", unit: "кг" }
  ],
  "Мясо": [
    { name: "Баранина", unit: "кг" },
    { name: "Говядина вырезка", unit: "кг" },
    { name: "Говядина грудинка", unit: "кг" },
    { name: "Говядина мякоть", unit: "кг" },
    { name: "Говядина на кости", unit: "кг" },
    { name: "Говядина фарш", unit: "кг" },
    { name: "Кролик", unit: "кг" },
    { name: "Свинина вырезка", unit: "кг" },
    { name: "Свинина корейка", unit: "кг" },
    { name: "Свинина мякоть", unit: "кг" },
    { name: "Свинина на кости", unit: "кг" },
    { name: "Свинина рёбра", unit: "кг" },
    { name: "Свинина фарш", unit: "кг" },
    { name: "Свинина шея", unit: "кг" },
    { name: "Телятина", unit: "кг" },
    { name: "Фарш домашний", unit: "кг" },
    { name: "Язык говяжий", unit: "кг" }
  ],
  "Птица": [
    { name: "Гусь", unit: "кг" },
    { name: "Индейка", unit: "кг" },
    { name: "Индейка грудка", unit: "кг" },
    { name: "Индейка фарш", unit: "кг" },
    { name: "Курица", unit: "кг" },
    { name: "Курица бедро", unit: "кг" },
    { name: "Курица голень", unit: "кг" },
    { name: "Курица грудка", unit: "кг" },
    { name: "Курица крылья", unit: "кг" },
    { name: "Курица окорочка", unit: "кг" },
    { name: "Курица фарш", unit: "кг" },
    { name: "Перепёлка", unit: "шт" },
    { name: "Утка", unit: "кг" },
    { name: "Цыплёнок корнишон", unit: "шт" },
    { name: "Цыплёнок табака", unit: "шт" }
  ],
  "Рыба и морепродукты": [
    { name: "Горбуша", unit: "кг" },
    { name: "Дорадо", unit: "кг" },
    { name: "Икра красная", unit: "кг" },
    { name: "Икра чёрная", unit: "кг" },
    { name: "Кальмар", unit: "кг" },
    { name: "Камбала", unit: "кг" },
    { name: "Карп", unit: "кг" },
    { name: "Краб", unit: "кг" },
    { name: "Крабовые палочки", unit: "кг" },
    { name: "Креветки", unit: "кг" },
    { name: "Лосось", unit: "кг" },
    { name: "Мидии", unit: "кг" },
    { name: "Минтай", unit: "кг" },
    { name: "Морской окунь", unit: "кг" },
    { name: "Окунь речной", unit: "кг" },
    { name: "Осетрина", unit: "кг" },
    { name: "Палтус", unit: "кг" },
    { name: "Сёмга", unit: "кг" },
    { name: "Сёмга слабосолёная", unit: "кг" },
    { name: "Сельдь", unit: "кг" },
    { name: "Сибас", unit: "кг" },
    { name: "Скумбрия", unit: "кг" },
    { name: "Судак", unit: "кг" },
    { name: "Тунец", unit: "кг" },
    { name: "Угорь", unit: "кг" },
    { name: "Форель", unit: "кг" },
    { name: "Щука", unit: "кг" }
  ],
  "Молочные продукты": [
    { name: "Йогурт натуральный", unit: "л" },
    { name: "Кефир 1%", unit: "л" },
    { name: "Кефир 2.5%", unit: "л" },
    { name: "Кефир 3.2%", unit: "л" },
    { name: "Масло сливочное 72.5%", unit: "кг" },
    { name: "Масло сливочное 82.5%", unit: "кг" },
    { name: "Молоко 2.5%", unit: "л" },
    { name: "Молоко 3.2%", unit: "л" },
    { name: "Молоко 3.5%", unit: "л" },
    { name: "Молоко топлёное", unit: "л" },
    { name: "Ряженка", unit: "л" },
    { name: "Сливки 10%", unit: "л" },
    { name: "Сливки 20%", unit: "л" },
    { name: "Сливки 33%", unit: "л" },
    { name: "Сметана 10%", unit: "кг" },
    { name: "Сметана 15%", unit: "кг" },
    { name: "Сметана 20%", unit: "кг" },
    { name: "Сметана 25%", unit: "кг" },
    { name: "Творог 5%", unit: "кг" },
    { name: "Творог 9%", unit: "кг" },
    { name: "Творог обезжиренный", unit: "кг" }
  ],
  "Сыры": [
    { name: "Брынза", unit: "кг" },
    { name: "Гауда", unit: "кг" },
    { name: "Дор блю", unit: "кг" },
    { name: "Камамбер", unit: "кг" },
    { name: "Маасдам", unit: "кг" },
    { name: "Моцарелла", unit: "кг" },
    { name: "Пармезан", unit: "кг" },
    { name: "Российский", unit: "кг" },
    { name: "Рикотта", unit: "кг" },
    { name: "Сулугуни", unit: "кг" },
    { name: "Сыр козий", unit: "кг" },
    { name: "Сыр плавленый", unit: "кг" },
    { name: "Фета", unit: "кг" },
    { name: "Филадельфия", unit: "кг" },
    { name: "Чеддер", unit: "кг" },
    { name: "Эдам", unit: "кг" },
    { name: "Эмменталь", unit: "кг" }
  ],
  "Яйца": [
    { name: "Яйца куриные С0", unit: "дес" },
    { name: "Яйца куриные С1", unit: "дес" },
    { name: "Яйца куриные С2", unit: "дес" },
    { name: "Яйца куриные деревенские", unit: "дес" },
    { name: "Яйца перепелиные", unit: "дес" }
  ],
  "Бакалея": [
    { name: "Булгур", unit: "кг" },
    { name: "Горох колотый", unit: "кг" },
    { name: "Гречка", unit: "кг" },
    { name: "Киноа", unit: "кг" },
    { name: "Кускус", unit: "кг" },
    { name: "Манка", unit: "кг" },
    { name: "Мука пшеничная в/с", unit: "кг" },
    { name: "Мука пшеничная 1 сорт", unit: "кг" },
    { name: "Мука ржаная", unit: "кг" },
    { name: "Овсянка", unit: "кг" },
    { name: "Перловка", unit: "кг" },
    { name: "Пшено", unit: "кг" },
    { name: "Рис басмати", unit: "кг" },
    { name: "Рис длиннозерный", unit: "кг" },
    { name: "Рис круглозерный", unit: "кг" },
    { name: "Фасоль белая", unit: "кг" },
    { name: "Фасоль красная", unit: "кг" },
    { name: "Чечевица зелёная", unit: "кг" },
    { name: "Чечевица красная", unit: "кг" }
  ],
  "Масла": [
    { name: "Масло кокосовое", unit: "л" },
    { name: "Масло кукурузное", unit: "л" },
    { name: "Масло льняное", unit: "л" },
    { name: "Масло оливковое", unit: "л" },
    { name: "Масло подсолнечное", unit: "л" },
    { name: "Масло рапсовое", unit: "л" }
  ]
};

(async () => {
  try {
    let totalAdded = 0;
    let totalSkipped = 0;
    let totalUpdated = 0;

    console.log('Starting product import from Google Sheets data...\n');

    for (const [category, products] of Object.entries(productsData)) {
      console.log(`\nProcessing category: ${category}`);
      console.log('='.repeat(50));

      for (const product of products) {
        try {
          // Проверяем существует ли продукт
          const existingProduct = await NomenclatureCache.findOne({
            where: { product_name: product.name }
          });

          if (existingProduct) {
            // Обновляем только если изменились данные
            if (existingProduct.category !== category || 
                existingProduct.unit !== product.unit) {
              await existingProduct.update({
                category: category,
                unit: product.unit
              });
              console.log(`✓ Updated: ${product.name}`);
              totalUpdated++;
            } else {
              totalSkipped++;
            }
          } else {
            // Создаем новый продукт
            await NomenclatureCache.create({
              product_name: product.name,
              category: category,
              unit: product.unit,
              last_purchase_price: 0
            });
            console.log(`+ Added: ${product.name} (${product.unit})`);
            totalAdded++;
          }

          // Добавляем базовые синонимы для некоторых продуктов
          if (product.name.includes('картофель') || product.name.includes('Картофель')) {
            const synonyms = [];
            if (product.name === 'Картофель') {
              synonyms.push('картошка', 'картоха', 'картофан');
            } else if (product.name === 'Картофель красный') {
              synonyms.push('картошка красная', 'красная картошка', 'картофель красн');
            } else if (product.name === 'Картофель молодой') {
              synonyms.push('молодая картошка', 'картошка молодая', 'молодой картофель');
            }

            for (const syn of synonyms) {
              await ProductSynonym.findOrCreate({
                where: {
                  original: product.name,
                  synonym: syn
                },
                defaults: {
                  weight: 1.0,
                  usage_count: 0
                }
              });
            }
          }
        } catch (error) {
          console.error(`Error processing ${product.name}:`, error.message);
        }
      }
    }

    // Показываем итоги
    console.log('\n' + '='.repeat(50));
    console.log('Import completed!');
    console.log(`Total products added: ${totalAdded}`);
    console.log(`Total products updated: ${totalUpdated}`);
    console.log(`Total products skipped: ${totalSkipped}`);
    console.log(`Total products in database: ${await NomenclatureCache.count()}`);

    process.exit(0);
  } catch (error) {
    logger.error('Failed to import products:', error);
    process.exit(1);
  }
})();