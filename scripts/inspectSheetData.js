require('dotenv').config();
const googleSheetsApiService = require('../src/services/GoogleSheetsApiService');
const logger = require('../src/utils/logger');

async function inspectData() {
  try {
    const data = await googleSheetsApiService.getSheetData("'Лист1'!A1:Z20");
    
    console.log('First 20 rows of data:');
    data.forEach((row, index) => {
      console.log(`Row ${index + 1}:`, row);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

inspectData();