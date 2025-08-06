const { Telegraf } = require('telegraf');

// Создаем простой тестовый сценарий
const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN не найден в переменных окружения');
  process.exit(1);
}

console.log('Тестируем отправку сообщения боту...');

// Просто выведем токен (первые и последние символы)
const token = BOT_TOKEN;
console.log(`Токен бота: ${token.substring(0, 8)}...${token.substring(token.length - 8)}`);

// Проверим что бот работает через webhook проверку
const https = require('https');

const url = `https://api.telegram.org/bot${token}/getMe`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.ok) {
        console.log('✅ Бот доступен:', response.result.username);
        console.log('Теперь попробуйте отправить "Черри 2" боту в Telegram');
      } else {
        console.log('❌ Ошибка API:', response.description);
      }
    } catch (error) {
      console.error('❌ Ошибка парсинга ответа:', error);
    }
  });
}).on('error', (error) => {
  console.error('❌ Ошибка сети:', error);
});