const Fuse = require('fuse.js');
const { Op, Sequelize } = require('sequelize');
const logger = require('../utils/logger');
const { NomenclatureCache, ProductSynonym, sequelize } = require('../database/models');
const googleSheetsService = require('./GoogleSheetsService');

class ProductMatcher {
  constructor() {
    this.fuseInstance = null;
    this.synonymCache = new Map();
    this.categoryCache = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    try {
      await this.loadSynonyms();
      await this.updateSearchIndex();
      this.isInitialized = true;
      logger.info('ProductMatcher initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ProductMatcher:', error);
      throw error;
    }
  }

  async loadSynonyms() {
    try {
      const synonyms = await ProductSynonym.findAll({ raw: true });
      this.synonymCache.clear();
      
      synonyms.forEach(syn => {
        if (!this.synonymCache.has(syn.synonym)) {
          this.synonymCache.set(syn.synonym, []);
        }
        this.synonymCache.get(syn.synonym).push({
          original: syn.original,
          weight: syn.weight
        });
      });
      
      logger.info(`Loaded ${synonyms.length} synonyms`);
    } catch (error) {
      logger.error('Error loading synonyms:', error);
    }
  }

  async updateSearchIndex() {
    try {
      const products = await NomenclatureCache.findAll({
        attributes: ['id', 'product_name', 'category', 'unit', 'last_purchase_price'],
        raw: true
      });

      // Создание расширенного индекса с синонимами
      const searchData = [];
      for (const product of products) {
        searchData.push(product);
        
        // Добавляем записи для каждого синонима
        const synonymsForProduct = await this.getSynonymsForProduct(product.product_name);
        synonymsForProduct.forEach(syn => {
          searchData.push({
            ...product,
            search_term: syn.synonym,
            is_synonym: true,
            original_name: product.product_name
          });
        });
      }

      // Обновление категорий
      this.updateCategoryCache(products);

      // Настройка Fuse с оптимизированными параметрами для русского языка
      this.fuseInstance = new Fuse(searchData, {
        keys: [
          { name: 'product_name', weight: 0.5 },
          { name: 'search_term', weight: 0.3 },
          { name: 'category', weight: 0.2 }
        ],
        includeScore: true,
        threshold: 0.3,
        location: 0,
        distance: 100,
        minMatchCharLength: 2,
        shouldSort: true,
        isCaseSensitive: false,
        findAllMatches: true,
        ignoreLocation: false,
        useExtendedSearch: true
      });

      logger.info(`Search index updated with ${searchData.length} entries`);
    } catch (error) {
      logger.error('Error updating search index:', error);
    }
  }

  updateCategoryCache(products) {
    this.categoryCache.clear();
    products.forEach(product => {
      if (product.category) {
        if (!this.categoryCache.has(product.category)) {
          this.categoryCache.set(product.category, []);
        }
        this.categoryCache.get(product.category).push(product);
      }
    });
  }

  async findById(id) {
    try {
      const product = await NomenclatureCache.findByPk(id);
      return product;
    } catch (error) {
      logger.error('Error finding product by ID:', error);
      return null;
    }
  }

  async findExactMatch(query) {
    if (!query || query.trim().length === 0) return null;

    const normalizedQuery = this.normalizeQuery(query);
    
    // Используем Sequelize Op для поиска (работает лучше с SQLite и кириллицей)
    const { Op } = require('sequelize');
    
    // Сначала ищем точное совпадение
    let product = await NomenclatureCache.findOne({
      where: {
        product_name: {
          [Op.like]: normalizedQuery
        }
      }
    });
    
    // Если не нашли, пробуем с разным регистром
    if (!product) {
      // Ищем с учетом регистра
      const products = await NomenclatureCache.findAll();
      product = products.find(p => 
        p.product_name.toLowerCase() === normalizedQuery ||
        p.product_name.toLowerCase().replace(/ё/g, 'е') === normalizedQuery
      );
    }

    // Если не нашли, проверяем синонимы
    if (!product) {
      const synonyms = await ProductSynonym.findAll();
      const synonymMatch = synonyms.find(s => 
        s.synonym.toLowerCase() === normalizedQuery
      );

      if (synonymMatch) {
        product = await NomenclatureCache.findOne({
          where: { product_name: synonymMatch.original }
        });

        // Увеличиваем счетчик использования синонима
        if (synonymMatch) {
          await synonymMatch.increment('usage_count');
        }
      }
    }

    return product;
  }

  async suggestProducts(query, limit = 5) {
    if (!query || query.trim().length < 2) return [];

    const normalizedQuery = this.normalizeQuery(query);
    
    // Расширяем запрос синонимами
    const expandedQueries = await this.expandQueryWithSynonyms(normalizedQuery);
    
    // Используем Fuse для поиска
    const results = [];
    const seenProducts = new Set();

    // Поиск по основному запросу
    if (this.fuseInstance) {
      const fuseResults = this.fuseInstance.search(normalizedQuery, { limit: limit * 2 });
      
      fuseResults.forEach(result => {
        const product = result.item;
        const productName = product.original_name || product.product_name;
        
        if (!seenProducts.has(productName)) {
          seenProducts.add(productName);
          results.push({
            id: product.id, // Важно: добавляем ID
            product_name: productName,
            category: product.category,
            unit: product.unit,
            last_purchase_price: product.last_purchase_price,
            score: result.score,
            match_type: product.is_synonym ? 'synonym' : 'direct',
            matched_term: product.search_term || product.product_name
          });
        }
      });
    }

    // Дополнительный поиск по SQL для частичных совпадений
    if (results.length < limit) {
      const sqlResults = await NomenclatureCache.findAll({
        where: {
          [Op.or]: [
            sequelize.where(
              sequelize.fn('LOWER', sequelize.col('product_name')),
              { [Op.like]: `%${normalizedQuery.toLowerCase()}%` }
            ),
            sequelize.where(
              sequelize.fn('LOWER', sequelize.col('category')),
              { [Op.like]: `%${normalizedQuery.toLowerCase()}%` }
            )
          ]
        },
        limit: limit - results.length
      });

      sqlResults.forEach(product => {
        if (!seenProducts.has(product.product_name)) {
          seenProducts.add(product.product_name);
          results.push({
            ...product.toJSON(),
            score: 0.5,
            match_type: 'partial',
            matched_term: product.product_name
          });
        }
      });
    }

    // Сортировка по релевантности
    return results
      .sort((a, b) => (a.score || 0) - (b.score || 0))
      .slice(0, limit);
  }

  async getProductsByCategory(category) {
    if (!category) return [];

    return await NomenclatureCache.findAll({
      where: { category },
      order: [['product_name', 'ASC']]
    });
  }

  async addSynonym(original, synonym, weight = 1.0) {
    try {
      const normalizedOriginal = this.normalizeQuery(original);
      const normalizedSynonym = this.normalizeQuery(synonym);

      // Проверяем, существует ли продукт
      const product = await NomenclatureCache.findOne({
        where: {
          product_name: {
            [Op.iLike]: normalizedOriginal
          }
        }
      });

      if (!product) {
        throw new Error(`Product "${original}" not found`);
      }

      // Создаем или обновляем синоним
      const [synonymRecord, created] = await ProductSynonym.upsert({
        original: product.product_name,
        synonym: normalizedSynonym,
        weight
      }, {
        returning: true
      });

      // Обновляем кэш
      await this.loadSynonyms();
      await this.updateSearchIndex();

      return { success: true, created, synonym: synonymRecord };
    } catch (error) {
      logger.error('Error adding synonym:', error);
      return { success: false, error: error.message };
    }
  }

  async getSynonymsForProduct(productName) {
    return await ProductSynonym.findAll({
      where: { original: productName },
      order: [['weight', 'DESC'], ['usage_count', 'DESC']]
    });
  }

  async expandQueryWithSynonyms(query) {
    const queries = [query];
    
    if (this.synonymCache.has(query)) {
      const synonyms = this.synonymCache.get(query);
      synonyms.forEach(syn => queries.push(syn.original));
    }

    return queries;
  }

  normalizeQuery(query) {
    return query
      .trim()
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ');
  }

  async getCategories() {
    const categories = await NomenclatureCache.findAll({
      attributes: [[NomenclatureCache.sequelize.fn('DISTINCT', NomenclatureCache.sequelize.col('category')), 'category']],
      where: {
        category: {
          [Op.ne]: null
        }
      },
      order: [['category', 'ASC']],
      raw: true
    });

    return categories.map(c => c.category).filter(Boolean);
  }

  async searchWithAutoComplete(query, limit = 10) {
    if (!query || query.length < 2) return [];

    const normalizedQuery = this.normalizeQuery(query);
    const suggestions = await this.suggestProducts(normalizedQuery, limit);

    // Форматируем для автокомплита
    return suggestions.map(product => ({
      id: product.id, // Используем ID продукта
      product_name: product.product_name,
      text: product.product_name,
      category: product.category,
      unit: product.unit,
      price: product.last_purchase_price,
      match_info: `${product.match_type === 'synonym' ? `(синоним: ${product.matched_term})` : ''}`
    }));
  }

  // Метод для обучения на основе выбора пользователей
  async learnFromUserChoice(query, chosenProduct) {
    try {
      const normalizedQuery = this.normalizeQuery(query);
      const normalizedProduct = this.normalizeQuery(chosenProduct);

      // Если пользователь выбрал продукт по запросу, который не является точным совпадением
      if (normalizedQuery !== normalizedProduct) {
        // Проверяем, не является ли это уже синонимом
        const existingSynonym = await ProductSynonym.findOne({
          where: {
            synonym: normalizedQuery,
            original: chosenProduct
          }
        });

        if (!existingSynonym) {
          // Добавляем как синоним с низким весом для последующей проверки
          await this.addSynonym(chosenProduct, normalizedQuery, 0.5);
          logger.info(`Learned new potential synonym: "${normalizedQuery}" -> "${chosenProduct}"`);
        } else {
          // Увеличиваем вес существующего синонима
          await existingSynonym.increment('usage_count');
          if (existingSynonym.weight < 1.0) {
            existingSynonym.weight = Math.min(1.0, existingSynonym.weight + 0.1);
            await existingSynonym.save();
          }
        }
      }
    } catch (error) {
      logger.error('Error in learning from user choice:', error);
    }
  }
}

// Создание синглтона
const productMatcher = new ProductMatcher();

module.exports = productMatcher;