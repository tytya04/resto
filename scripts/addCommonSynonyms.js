require('dotenv').config();
const { ProductSynonym, NomenclatureCache, sequelize } = require('../src/database/models');
const logger = require('../src/utils/logger');

const commonSynonyms = [
  // Овощи
  { original: 'Картофель любой', synonyms: ['картошка', 'картофель', 'картоха'] },
  { original: 'Картофель белый', synonyms: ['картошка белая', 'белая картошка'] },
  { original: 'Картофель красный', synonyms: ['картошка красная', 'красная картошка'] },
  { original: 'Морковь', synonyms: ['морковка'] },
  { original: 'Лук репчатый', synonyms: ['лук', 'репчатый лук', 'лук обычный'] },
  { original: 'Свекла', synonyms: ['свёкла', 'буряк'] },
  { original: 'Капуста белокочанная', synonyms: ['капуста', 'белокочанная'] },
  { original: 'Перец местный', synonyms: ['перец', 'болгарский перец', 'сладкий перец'] },
  
  // Зелень
  { original: 'Укроп весовой', synonyms: ['укроп'] },
  { original: 'Петрушка весовая', synonyms: ['петрушка'] },
  { original: 'Кинза весовая', synonyms: ['кинза', 'кориандр зелень'] },
  { original: 'Лук зелёный', synonyms: ['зеленый лук', 'лучок'] },
  
  // Фрукты  
  { original: 'Яблоки зелёные', synonyms: ['зеленые яблоки', 'яблоки зел'] },
  { original: 'Яблоки красные', synonyms: ['красные яблоки', 'яблоки кр'] },
  
  // Специи
  { original: 'Лавровый лист', synonyms: ['лаврушка', 'лавр'] },
  { original: 'Перец чёрный горошек', synonyms: ['черный перец', 'перец горошком'] },
  { original: 'Перец чёрный молотый', synonyms: ['черный перец молотый', 'молотый перец'] }
];

async function addSynonyms() {
  try {
    logger.info('Adding common synonyms...');
    
    let added = 0;
    let skipped = 0;
    
    for (const group of commonSynonyms) {
      // Находим продукт в базе - используем точное совпадение
      const product = await NomenclatureCache.findOne({
        where: { product_name: group.original }
      });
      
      if (!product) {
        logger.warn(`Product not found: ${group.original}`);
        skipped++;
        continue;
      }
      
      // Добавляем синонимы
      for (const synonym of group.synonyms) {
        try {
          await ProductSynonym.create({
            original: product.product_name,
            synonym: synonym.toLowerCase(),
            weight: 1.0
          });
          added++;
          logger.info(`Added synonym: ${synonym} -> ${product.product_name}`);
        } catch (error) {
          if (error.name === 'SequelizeUniqueConstraintError') {
            logger.debug(`Synonym already exists: ${synonym}`);
          } else {
            logger.error('Error adding synonym:', error);
          }
        }
      }
    }
    
    logger.info(`Synonyms added: ${added}, Products not found: ${skipped}`);
    
  } catch (error) {
    logger.error('Error adding synonyms:', error);
  } finally {
    await sequelize.close();
  }
}

addSynonyms();