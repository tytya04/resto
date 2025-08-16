const XLSX = require('xlsx');
const path = require('path');

const workbook = XLSX.readFile('/tmp/torg12.xls');

console.log('Листы в файле:', Object.keys(workbook.Sheets));

// Анализируем первый лист
const sheetName = Object.keys(workbook.Sheets)[0];
const sheet = workbook.Sheets[sheetName];

// Преобразуем в JSON для анализа
const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

console.log('\nРазмер таблицы:', data.length, 'x', data[0] ? data[0].length : 0);
console.log('\nПервые 35 строк (поиск реквизитов):');
for (let i = 0; i < Math.min(35, data.length); i++) {
  const row = data[i].filter(cell => cell !== '');
  if (row.length > 0) {
    console.log(`Строка ${i}:`, JSON.stringify(row.slice(0, 8)));
  }
}

// Ищем ключевые элементы формы
console.log('\n\nАнализ ключевых полей ТОРГ-12:');
for (let i = 0; i < data.length; i++) {
  const row = data[i];
  for (let j = 0; j < row.length; j++) {
    const cell = String(row[j]).toLowerCase();
    if (cell.includes('инн') || cell.includes('кпп') || cell.includes('окпо') || 
        cell.includes('грузоотправитель') || cell.includes('грузополучатель') ||
        cell.includes('поставщик') || cell.includes('плательщик') ||
        cell.includes('основание') || cell.includes('транспортная накладная')) {
      console.log(`Строка ${i}, колонка ${j}: "${row[j]}"`);
    }
  }
}