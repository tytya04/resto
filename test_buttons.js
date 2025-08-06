const { Markup } = require('telegraf');

// Тестируем создание кнопок как в сцене
const suggestedPrice = 450;
const currentPrice = null;

console.log('=== Тест формирования кнопок ===\n');
console.log('suggestedPrice:', suggestedPrice);
console.log('currentPrice:', currentPrice);
console.log('Условие для кнопки "Применить":', suggestedPrice && currentPrice !== suggestedPrice);

const buttons = [
  [Markup.button.callback('💰 Изменить цену', 'change_price')],
  suggestedPrice && currentPrice !== suggestedPrice ? 
    [Markup.button.callback(`✅ Применить ${suggestedPrice} ₽`, 'apply_suggested')] : [],
  [
    Markup.button.callback('⬅️ Назад', 'prev_item'),
    Markup.button.callback('➡️ Далее', 'next_item')
  ],
  [Markup.button.callback('📋 К итогу', 'show_summary')]
].filter(row => row.length > 0);

console.log('\nКнопки до создания keyboard:');
buttons.forEach((row, i) => {
  console.log(`Ряд ${i + 1}:`, row.map(btn => btn.text));
});

const keyboard = Markup.inlineKeyboard(buttons);

console.log('\nОбъект keyboard:');
console.log(keyboard);

console.log('\nИтоговая структура:');
console.log(JSON.stringify(keyboard.reply_markup.inline_keyboard, null, 2));

process.exit(0);