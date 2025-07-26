require('dotenv').config();
const { ProductSynonym } = require('./src/database/models');
const logger = require('./src/utils/logger');

const commonSynonyms = [
  // Овощи
  { original: 'Помидоры', synonyms: ['томаты', 'помидорки', 'помидор'] },
  { original: 'Помидоры черри', synonyms: ['черри', 'помидоры чери', 'томаты черри'] },
  { original: 'Огурцы', synonyms: ['огурчики', 'огурец'] },
  { original: 'Огурцы гладкие', synonyms: ['огурцы гладк', 'гладкие огурцы'] },
  { original: 'Морковь', synonyms: ['морковка', 'маркошка'] },
  { original: 'Капуста белокочанная', synonyms: ['капуста', 'капуста белая', 'белокочанка'] },
  { original: 'Свёкла', synonyms: ['свекла', 'буряк'] },
  { original: 'Баклажаны', synonyms: ['баклажан', 'синенькие'] },
  { original: 'Кабачки', synonyms: ['кабачок'] },
  { original: 'Перец болгарский красный', synonyms: ['перец красный', 'болгарский красный'] },
  { original: 'Перец болгарский жёлтый', synonyms: ['перец жёлтый', 'болгарский жёлтый'] },
  { original: 'Перец болгарский зелёный', synonyms: ['перец зелёный', 'болгарский зелёный'] },
  
  // Зелень
  { original: 'Укроп весовой', synonyms: ['укроп', 'укропчик'] },
  { original: 'Петрушка весовая', synonyms: ['петрушка'] },
  { original: 'Кинза весовая', synonyms: ['кинза', 'кориандр'] },
  { original: 'Лук зелёный', synonyms: ['лук зеленый', 'зеленый лук', 'лучок'] },
  { original: 'Лук репчатый', synonyms: ['лук', 'луковица', 'репчатый лук'] },
  
  // Фрукты
  { original: 'Яблоки красные', synonyms: ['яблоки красн', 'красные яблоки'] },
  { original: 'Яблоки зелёные', synonyms: ['яблоки зелен', 'зеленые яблоки'] },
  { original: 'Апельсины', synonyms: ['апельсин'] },
  { original: 'Мандарины', synonyms: ['мандарин', 'мандаринки'] },
  { original: 'Бананы', synonyms: ['банан'] },
  { original: 'Виноград белый', synonyms: ['виноград бел', 'белый виноград'] },
  { original: 'Виноград красный', synonyms: ['виноград красн', 'красный виноград'] },
  { original: 'Виноград чёрный', synonyms: ['виноград черн', 'черный виноград'] },
  
  // Мясо
  { original: 'Говядина мякоть', synonyms: ['говядина', 'говяжье мясо'] },
  { original: 'Свинина мякоть', synonyms: ['свинина', 'свиное мясо'] },
  { original: 'Курица', synonyms: ['курятина', 'куриное мясо', 'курочка'] },
  { original: 'Курица грудка', synonyms: ['куриная грудка', 'грудка куриная', 'грудка'] },
  { original: 'Курица бедро', synonyms: ['куриное бедро', 'бедро куриное', 'бедрышки'] },
  { original: 'Курица голень', synonyms: ['куриная голень', 'голень куриная', 'голяшки'] },
  { original: 'Говядина фарш', synonyms: ['фарш говяжий', 'говяжий фарш'] },
  { original: 'Свинина фарш', synonyms: ['фарш свиной', 'свиной фарш'] },
  { original: 'Курица фарш', synonyms: ['фарш куриный', 'куриный фарш'] },
  
  // Рыба
  { original: 'Сёмга', synonyms: ['семга', 'лосось атлантический'] },
  { original: 'Форель', synonyms: ['форелька'] },
  { original: 'Горбуша', synonyms: ['горбушка'] },
  { original: 'Креветки', synonyms: ['креветка'] },
  { original: 'Кальмар', synonyms: ['кальмары'] },
  
  // Молочные
  { original: 'Молоко 3.2%', synonyms: ['молоко', 'молочко'] },
  { original: 'Сметана 20%', synonyms: ['сметана', 'сметанка'] },
  { original: 'Масло сливочное 82.5%', synonyms: ['масло сливочное', 'сливочное масло', 'масло'] },
  { original: 'Творог 9%', synonyms: ['творог', 'творожок'] },
  { original: 'Сливки 33%', synonyms: ['сливки', 'сливки жирные'] },
  
  // Яйца
  { original: 'Яйца куриные С1', synonyms: ['яйца', 'яйцо', 'яички'] },
  { original: 'Яйца куриные С0', synonyms: ['яйца отборные', 'яйца с0'] },
  
  // Бакалея
  { original: 'Мука пшеничная в/с', synonyms: ['мука', 'мука высший сорт', 'мука в/с'] },
  { original: 'Сахар', synonyms: ['сахар-песок', 'сахарный песок'] },
  { original: 'Рис длиннозерный', synonyms: ['рис длиннозерн', 'рис длинный'] },
  { original: 'Рис круглозерный', synonyms: ['рис круглозерн', 'рис круглый'] },
  { original: 'Гречка', synonyms: ['греча', 'гречневая крупа', 'гречка ядрица'] },
  
  // Масла
  { original: 'Масло подсолнечное', synonyms: ['подсолнечное масло', 'масло растительное'] },
  { original: 'Масло оливковое', synonyms: ['оливковое масло'] },
  
  // Специи
  { original: 'Соль поваренная', synonyms: ['соль', 'соль обычная'] },
  { original: 'Перец чёрный молотый', synonyms: ['перец черный', 'черный перец', 'перец молотый'] },
  { original: 'Лавровый лист', synonyms: ['лаврушка', 'лавровый', 'лавр'] }
];

(async () => {
  try {
    let totalAdded = 0;
    let totalSkipped = 0;

    console.log('Adding common synonyms...\n');

    for (const item of commonSynonyms) {
      for (const synonym of item.synonyms) {
        try {
          const [syn, created] = await ProductSynonym.findOrCreate({
            where: {
              original: item.original,
              synonym: synonym.toLowerCase()
            },
            defaults: {
              weight: 1.0,
              usage_count: 0
            }
          });

          if (created) {
            console.log(`+ Added synonym: "${synonym}" -> "${item.original}"`);
            totalAdded++;
          } else {
            totalSkipped++;
          }
        } catch (error) {
          console.error(`Error adding synonym "${synonym}":`, error.message);
        }
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('Synonym import completed!');
    console.log(`Total synonyms added: ${totalAdded}`);
    console.log(`Total synonyms skipped: ${totalSkipped}`);

    process.exit(0);
  } catch (error) {
    logger.error('Failed to add synonyms:', error);
    process.exit(1);
  }
})();