const { NomenclatureCache, ProductSynonym } = require('./src/database/models');
const sequelize = require('./src/database/config');

async function updateWarehouseProducts() {
  try {
    // Распределение продуктов по категориям
    const productsByCategory = {
      'Овощи': [
        { name: 'Салат Айсберг', units: ['кг', 'шт'], defaultUnit: 'кг' },
        { name: 'Баклажан импорт', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Батат', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Картофель беби', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Сельдерей корень', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Авокадо', units: ['кг', 'шт'], defaultUnit: 'кг' },
        { name: 'Лук порей', units: ['кг', 'шт'], defaultUnit: 'кг' },
        { name: 'Перец болгарский красный импорт', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Перец болгарский желтый импорт', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Сельдерей стебель', units: ['кг', 'шт'], defaultUnit: 'кг' },
        { name: 'Чеснок Китай', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Чили мелкий 50 грамм', units: ['шт'], defaultUnit: 'шт' },
        { name: 'Вешенки отбор', units: ['кг', 'ящик'], defaultUnit: 'кг' },
        { name: 'Шампиньоны 2/3 сорт', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Шампиньоны 1 сорт', units: ['кг', 'ящик'], defaultUnit: 'кг' },
        { name: 'Шампиньоны мелкие', units: ['кг', 'ящик'], defaultUnit: 'кг' }
      ],
      'Зелень': [
        { name: 'Базилик зелёный', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Лемонграсс', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Микс салата в пачках', units: ['кг', 'шт'], defaultUnit: 'кг' },
        { name: 'Розмарин свежий', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Романо', units: ['кг', 'шт'], defaultUnit: 'кг' },
        { name: 'Рукола в пачках', units: ['кг', 'шт'], defaultUnit: 'кг' },
        { name: 'Тимьян свежий', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Черемша маринованная', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Шпинат в пачке', units: ['шт'], defaultUnit: 'шт' }
      ],
      'Фрукты': [
        { name: 'Ананас', units: ['шт'], defaultUnit: 'шт' },
        { name: 'Апельсин', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Гранат', units: ['кг', 'шт'], defaultUnit: 'кг' },
        { name: 'Грейпфрут', units: ['кг', 'шт'], defaultUnit: 'кг' },
        { name: 'Груша Конференция', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Груша Пакхам', units: ['кг', 'шт'], defaultUnit: 'кг' },
        { name: 'Киви', units: ['кг', 'шт'], defaultUnit: 'кг' },
        { name: 'Лимон', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Манго желтое', units: ['упаковка'], defaultUnit: 'упаковка' },
        { name: 'Мандарины', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Физалис', units: ['шт'], defaultUnit: 'шт' }
      ],
      'Ягоды': [
        { name: 'Виноград киш миш', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Виноград красный', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Виноград любой', units: ['кг'], defaultUnit: 'кг' },
        { name: 'Клубника Турция', units: ['кг'], defaultUnit: 'кг' }
      ],
      'Хозтовары': [
        { name: 'Варенье малина', units: ['шт'], defaultUnit: 'шт' },
        { name: 'Варенье кизиловое', units: ['шт'], defaultUnit: 'шт' },
        { name: 'Специи для брынзы', units: ['кг', 'шт'], defaultUnit: 'кг' },
        { name: 'Контейнер 0,25', units: ['шт'], defaultUnit: 'шт' },
        { name: 'Контейнер 0,5', units: ['шт'], defaultUnit: 'шт' },
        { name: 'Накладные', units: ['шт'], defaultUnit: 'шт' },
        { name: 'Прихватки', units: ['шт'], defaultUnit: 'шт' },
        { name: 'Ценники', units: ['шт'], defaultUnit: 'шт' }
      ]
    };

    // Синонимы для добавления
    const synonymsToAdd = [
      // Салат Айсберг
      { original: 'Салат Айсберг', synonym: 'Айсберг', weight: 1.0 },
      { original: 'Салат Айсберг', synonym: 'айсберг', weight: 1.0 },
      { original: 'Салат Айсберг', synonym: 'Салат айсберг', weight: 1.0 },
      
      // Ананас
      { original: 'Ананас', synonym: 'ананас', weight: 1.0 },
      { original: 'Ананас', synonym: 'Ананасы', weight: 0.9 },
      
      // Апельсин
      { original: 'Апельсин', synonym: 'апельсин', weight: 1.0 },
      { original: 'Апельсин', synonym: 'Апельсины', weight: 0.9 },
      
      // Базилик
      { original: 'Базилик зелёный', synonym: 'Базилик зеленый', weight: 1.0 },
      { original: 'Базилик зелёный', synonym: 'Базилик', weight: 0.9 },
      { original: 'Базилик зелёный', synonym: 'базилик', weight: 0.9 },
      
      // Батат
      { original: 'Батат', synonym: 'батат', weight: 1.0 },
      { original: 'Батат', synonym: 'Сладкий картофель', weight: 0.8 },
      
      // Виноград
      { original: 'Виноград киш миш', synonym: 'Киш миш', weight: 1.0 },
      { original: 'Виноград киш миш', synonym: 'Кишмиш', weight: 1.0 },
      { original: 'Виноград киш миш', synonym: 'Виноград без косточек', weight: 0.8 },
      
      { original: 'Виноград красный', synonym: 'Красный виноград', weight: 1.0 },
      { original: 'Виноград любой', synonym: 'Виноград', weight: 1.0 },
      { original: 'Виноград любой', synonym: 'виноград', weight: 1.0 },
      
      // Гранат
      { original: 'Гранат', synonym: 'гранат', weight: 1.0 },
      { original: 'Гранат', synonym: 'Гранаты', weight: 0.9 },
      
      // Грейпфрут
      { original: 'Грейпфрут', synonym: 'грейпфрут', weight: 1.0 },
      { original: 'Грейпфрут', synonym: 'Грейпфруты', weight: 0.9 },
      
      // Груша
      { original: 'Груша Конференция', synonym: 'Конференция', weight: 0.9 },
      { original: 'Груша Конференция', synonym: 'Груша конференция', weight: 1.0 },
      { original: 'Груша Пакхам', synonym: 'Пакхам', weight: 0.9 },
      { original: 'Груша Пакхам', synonym: 'Груша пакхам', weight: 1.0 },
      
      // Картофель беби
      { original: 'Картофель беби', synonym: 'Беби картофель', weight: 1.0 },
      { original: 'Картофель беби', synonym: 'Мелкий картофель', weight: 0.8 },
      { original: 'Картофель беби', synonym: 'Baby картофель', weight: 0.9 },
      
      // Киви
      { original: 'Киви', synonym: 'киви', weight: 1.0 },
      
      // Клубника
      { original: 'Клубника Турция', synonym: 'Клубника', weight: 0.9 },
      { original: 'Клубника Турция', synonym: 'клубника', weight: 0.9 },
      { original: 'Клубника Турция', synonym: 'Турецкая клубника', weight: 1.0 },
      
      // Сельдерей
      { original: 'Сельдерей корень', synonym: 'Корень сельдерея', weight: 1.0 },
      { original: 'Сельдерей корень', synonym: 'Сельдерей корневой', weight: 1.0 },
      { original: 'Сельдерей стебель', synonym: 'Стебель сельдерея', weight: 1.0 },
      { original: 'Сельдерей стебель', synonym: 'Сельдерей стеблевой', weight: 1.0 },
      { original: 'Сельдерей стебель', synonym: 'Сельдерей черешковый', weight: 0.9 },
      
      // Авокадо
      { original: 'Авокадо', synonym: 'авокадо', weight: 1.0 },
      
      // Лемонграсс
      { original: 'Лемонграсс', synonym: 'лемонграсс', weight: 1.0 },
      { original: 'Лемонграсс', synonym: 'Лимонная трава', weight: 0.9 },
      { original: 'Лемонграсс', synonym: 'Lemongrass', weight: 0.8 },
      
      // Лимон
      { original: 'Лимон', synonym: 'лимон', weight: 1.0 },
      { original: 'Лимон', synonym: 'Лимоны', weight: 0.9 },
      
      // Лук порей
      { original: 'Лук порей', synonym: 'Порей', weight: 0.9 },
      { original: 'Лук порей', synonym: 'порей', weight: 0.9 },
      { original: 'Лук порей', synonym: 'Лук-порей', weight: 1.0 },
      
      // Манго
      { original: 'Манго желтое', synonym: 'Манго', weight: 0.9 },
      { original: 'Манго желтое', synonym: 'манго', weight: 0.9 },
      { original: 'Манго желтое', synonym: 'Манго жёлтое', weight: 1.0 },
      
      // Мандарины
      { original: 'Мандарины', synonym: 'мандарины', weight: 1.0 },
      { original: 'Мандарины', synonym: 'Мандарин', weight: 1.0 },
      
      // Микс салата
      { original: 'Микс салата в пачках', synonym: 'Микс салата', weight: 0.9 },
      { original: 'Микс салата в пачках', synonym: 'Салатный микс', weight: 0.9 },
      
      // Перец болгарский
      { original: 'Перец болгарский красный импорт', synonym: 'Перец красный', weight: 0.9 },
      { original: 'Перец болгарский красный импорт', synonym: 'Красный перец', weight: 0.9 },
      { original: 'Перец болгарский желтый импорт', synonym: 'Перец желтый', weight: 0.9 },
      { original: 'Перец болгарский желтый импорт', synonym: 'Желтый перец', weight: 0.9 },
      
      // Розмарин
      { original: 'Розмарин свежий', synonym: 'Розмарин', weight: 1.0 },
      { original: 'Розмарин свежий', synonym: 'розмарин', weight: 1.0 },
      
      // Романо
      { original: 'Романо', synonym: 'романо', weight: 1.0 },
      { original: 'Романо', synonym: 'Салат романо', weight: 1.0 },
      { original: 'Романо', synonym: 'Ромэн', weight: 0.8 },
      
      // Рукола
      { original: 'Рукола в пачках', synonym: 'Рукола', weight: 0.9 },
      { original: 'Рукола в пачках', synonym: 'рукола', weight: 0.9 },
      { original: 'Рукола в пачках', synonym: 'Руккола', weight: 0.9 },
      
      // Тимьян
      { original: 'Тимьян свежий', synonym: 'Тимьян', weight: 1.0 },
      { original: 'Тимьян свежий', synonym: 'тимьян', weight: 1.0 },
      { original: 'Тимьян свежий', synonym: 'Чабрец', weight: 0.8 },
      
      // Черемша
      { original: 'Черемша маринованная', synonym: 'Черемша', weight: 0.9 },
      { original: 'Черемша маринованная', synonym: 'черемша', weight: 0.9 },
      
      // Чеснок
      { original: 'Чеснок Китай', synonym: 'Чеснок', weight: 0.9 },
      { original: 'Чеснок Китай', synonym: 'чеснок', weight: 0.9 },
      { original: 'Чеснок Китай', synonym: 'Китайский чеснок', weight: 1.0 },
      
      // Чили
      { original: 'Чили мелкий 50 грамм', synonym: 'Чили', weight: 0.8 },
      { original: 'Чили мелкий 50 грамм', synonym: 'Чили мелкий', weight: 1.0 },
      { original: 'Чили мелкий 50 грамм', synonym: 'Перец чили', weight: 0.8 },
      
      // Шпинат
      { original: 'Шпинат в пачке', synonym: 'Шпинат', weight: 0.9 },
      { original: 'Шпинат в пачке', synonym: 'шпинат', weight: 0.9 },
      
      // Грибы
      { original: 'Вешенки отбор', synonym: 'Вешенки', weight: 0.9 },
      { original: 'Вешенки отбор', synonym: 'вешенки', weight: 0.9 },
      { original: 'Шампиньоны 1 сорт', synonym: 'Шампиньоны', weight: 0.9 },
      { original: 'Шампиньоны 2/3 сорт', synonym: 'Шампиньоны', weight: 0.8 },
      { original: 'Шампиньоны мелкие', synonym: 'Шампиньоны', weight: 0.8 },
      { original: 'Шампиньоны мелкие', synonym: 'Мелкие шампиньоны', weight: 1.0 }
    ];

    const t = await sequelize.transaction();
    
    try {
      let addedCount = 0;
      let updatedCount = 0;
      let variantsCount = 0;
      
      console.log('🏭 Обновление продуктов с пометкой "Склад"...\n');
      
      // Обрабатываем каждую категорию
      for (const [category, products] of Object.entries(productsByCategory)) {
        console.log(`\n📂 Категория "${category}":`);
        
        for (const product of products) {
          // Проверяем существование продукта
          const existing = await NomenclatureCache.findOne({
            where: { product_name: product.name },
            transaction: t
          });
          
          if (!existing) {
            // Создаем новый продукт с технической пометкой
            await sequelize.query(
              `INSERT INTO nomenclature_cache (product_name, category, unit, technical_note, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?)`,
              {
                replacements: [
                  product.name,
                  category,
                  product.defaultUnit,
                  'Склад',
                  new Date(),
                  new Date()
                ],
                type: sequelize.QueryTypes.INSERT,
                transaction: t
              }
            );
            console.log(`✅ Добавлен: ${product.name} (${product.defaultUnit})`);
            addedCount++;
          } else {
            // Обновляем категорию и техническую пометку
            await sequelize.query(
              `UPDATE nomenclature_cache 
               SET category = ?, unit = ?, technical_note = ?, updated_at = ?
               WHERE product_name = ?`,
              {
                replacements: [
                  category,
                  product.defaultUnit,
                  'Склад',
                  new Date(),
                  product.name
                ],
                type: sequelize.QueryTypes.UPDATE,
                transaction: t
              }
            );
            console.log(`✅ Обновлен: ${product.name} → категория "${category}"`);
            updatedCount++;
          }
          
          // Создаем варианты для продуктов с несколькими единицами измерения
          if (product.units.length > 1) {
            for (const unit of product.units) {
              if (unit === product.defaultUnit) continue;
              
              const variantName = `${product.name} (${unit})`;
              const variant = await NomenclatureCache.findOne({
                where: { product_name: variantName },
                transaction: t
              });
              
              if (!variant) {
                await sequelize.query(
                  `INSERT INTO nomenclature_cache (product_name, category, unit, technical_note, created_at, updated_at) 
                   VALUES (?, ?, ?, ?, ?, ?)`,
                  {
                    replacements: [
                      variantName,
                      category,
                      unit,
                      'Склад',
                      new Date(),
                      new Date()
                    ],
                    type: sequelize.QueryTypes.INSERT,
                    transaction: t
                  }
                );
                console.log(`   ➕ Добавлен вариант: ${variantName}`);
                variantsCount++;
                
                // Добавляем синоним для варианта
                await ProductSynonym.create({
                  original: variantName,
                  synonym: product.name,
                  weight: 0.8
                }, { transaction: t }).catch(() => {});
              }
            }
          }
        }
      }
      
      // Добавляем синонимы
      let synonymsAdded = 0;
      for (const syn of synonymsToAdd) {
        try {
          await ProductSynonym.create(syn, { transaction: t });
          synonymsAdded++;
        } catch (error) {
          if (error.name === 'SequelizeUniqueConstraintError') {
            // Синоним уже существует
          } else {
            throw error;
          }
        }
      }
      
      await t.commit();
      
      console.log('\n✨ Обновление завершено успешно!');
      console.log(`📊 Статистика:`);
      console.log(`   - Новых продуктов добавлено: ${addedCount}`);
      console.log(`   - Продуктов обновлено: ${updatedCount}`);
      console.log(`   - Вариантов создано: ${variantsCount}`);
      console.log(`   - Синонимов добавлено: ${synonymsAdded}`);
      
      // Показываем итоговую статистику
      console.log('\n📋 Итоговое распределение продуктов "Склад" по категориям:');
      const stats = await sequelize.query(
        `SELECT category, COUNT(*) as count 
         FROM nomenclature_cache 
         WHERE technical_note = 'Склад' 
         GROUP BY category 
         ORDER BY category`,
        { type: sequelize.QueryTypes.SELECT }
      );
      
      stats.forEach(stat => {
        console.log(`   - ${stat.category}: ${stat.count} продуктов`);
      });
      
    } catch (error) {
      await t.rollback();
      throw error;
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при обновлении:', error);
    process.exit(1);
  }
}

updateWarehouseProducts();