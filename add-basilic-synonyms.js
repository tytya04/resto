const ProductSynonym = require('./src/database/models/ProductSynonym');

async function addBasilicSynonyms() {
  try {
    const synonyms = [
      { original: 'Базилик красный', synonym: 'Базилик', weight: 1.0 },
      { original: 'Базилик красный', synonym: 'базилик', weight: 1.0 },
      { original: 'Базилик красный', synonym: 'Базилик свежий', weight: 0.9 },
      { original: 'Базилик красный', synonym: 'базилик свежий', weight: 0.9 },
      { original: 'Базилик красный', synonym: 'Базилик зеленый', weight: 0.8 },
      { original: 'Базилик красный', synonym: 'базилик зеленый', weight: 0.8 },
    ];

    for (const syn of synonyms) {
      try {
        await ProductSynonym.create(syn);
        console.log(`✅ Добавлен синоним: ${syn.synonym} → ${syn.original}`);
      } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
          console.log(`⚠️ Синоним уже существует: ${syn.synonym} → ${syn.original}`);
        } else {
          console.error(`❌ Ошибка при добавлении синонима ${syn.synonym}:`, error.message);
        }
      }
    }

    console.log('✨ Процесс добавления синонимов завершен');
    process.exit(0);
  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  }
}

addBasilicSynonyms();