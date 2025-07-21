require('dotenv').config();
const googleSheetsApiService = require('../src/services/GoogleSheetsApiService');

async function debug() {
  try {
    const products = await googleSheetsApiService.getAllProducts();
    
    // Находим проблемные продукты
    const problematic = products.filter(p => 
      p.product_name.toLowerCase() === 'кг' || 
      p.product_name.toLowerCase() === 'шт' ||
      p.product_name.length <= 2
    );
    
    console.log('Problematic products:', problematic);
    console.log('Total products:', products.length);
    
    // Группируем по категориям
    const byCategory = {};
    products.forEach(p => {
      if (!byCategory[p.category]) byCategory[p.category] = [];
      byCategory[p.category].push(p);
    });
    
    console.log('\nProducts by category:');
    Object.keys(byCategory).forEach(cat => {
      console.log(`${cat}: ${byCategory[cat].length} products`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debug();