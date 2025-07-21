# 🚀 Инструкция по деплою Restaurant Bot на Ubuntu 24.04

## 📋 Требования к серверу

- **ОС**: Ubuntu 24.04 LTS
- **RAM**: минимум 2GB (рекомендуется 4GB)
- **CPU**: 2 vCPU
- **Диск**: 20GB SSD
- **Сеть**: Статический IP, открытые порты 80, 443, 22

## 🔧 Подготовка сервера

### 1. Базовая настройка

```bash
# Подключение к серверу
ssh root@YOUR_SERVER_IP

# Обновление системы
apt update && apt upgrade -y

# Создание пользователя для деплоя
adduser deploy
usermod -aG sudo deploy
su - deploy
```

### 2. Настройка SSH ключей

```bash
# На локальной машине
ssh-copy-id deploy@YOUR_SERVER_IP

# На сервере - отключение входа по паролю
sudo nano /etc/ssh/sshd_config
# Установите: PasswordAuthentication no
sudo systemctl restart sshd
```

## 📦 Установка приложения

### 1. Клонирование репозитория

```bash
cd ~
git clone https://github.com/yourusername/restaurant-bot.git
cd restaurant-bot
```

### 2. Настройка переменных окружения

```bash
cp .env.production.example .env.production
nano .env.production
```

Обязательные переменные:
- `BOT_TOKEN` - токен Telegram бота
- `BOT_WEBHOOK_DOMAIN` - ваш домен (например, bot.example.com)
- `GOOGLE_SHEETS_ID` - ID Google таблицы с номенклатурой
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - email сервисного аккаунта
- `GOOGLE_PRIVATE_KEY` - приватный ключ сервисного аккаунта

### 3. Запуск деплой-скрипта

```bash
sudo ./scripts/deploy.sh yourdomain.com admin@yourdomain.com
```

Скрипт автоматически:
- Установит все зависимости
- Настроит файрвол и fail2ban
- Создаст SSL сертификаты
- Запустит все контейнеры
- Настроит автоматические бекапы

## 🔐 Настройка SSL

### Автоматическая настройка (рекомендуется)

```bash
./scripts/setup-ssl.sh yourdomain.com admin@yourdomain.com
```

### Ручная настройка

1. Получение сертификата:
```bash
docker-compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email admin@yourdomain.com \
    --agree-tos \
    --no-eff-email \
    -d yourdomain.com \
    -d www.yourdomain.com
```

2. Обновление nginx конфигурации:
```bash
sed -i 's/yourdomain.com/YOUR_ACTUAL_DOMAIN/g' nginx/sites-enabled/restaurant-bot.conf
docker-compose restart nginx
```

## 🤖 Настройка Telegram Webhook

```bash
# Установка webhook
curl -F "url=https://yourdomain.com/webhook" \
     https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook

# Проверка webhook
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

## 👤 Создание первого администратора

```bash
docker-compose exec app node test_admin.js YOUR_TELEGRAM_ID
```

Узнать свой Telegram ID можно у бота @userinfobot

## 📊 Мониторинг

### Grafana
- URL: `https://yourdomain.com/grafana/`
- Логин/пароль настраиваются при первом входе

### Просмотр логов
```bash
# Все сервисы
docker-compose logs -f

# Только приложение
docker-compose logs -f app

# Последние 100 строк
docker-compose logs --tail=100 app
```

### Health Check
```bash
# Проверка состояния
curl https://yourdomain.com/health

# Метрики Prometheus
curl https://yourdomain.com/metrics
```

## 💾 Резервное копирование

### Ручной бекап
```bash
./scripts/backup.sh
```

### Автоматические бекапы
Настраиваются через cron (уже включено в деплой-скрипт):
- База данных: ежедневно в 2:00
- Логи: еженедельно
- Загрузка в S3 (если настроено)

### Восстановление из бекапа
```bash
# Остановка приложения
docker-compose stop app

# Восстановление базы данных
sqlite3 data/database.sqlite < backups/db_backup_20240101_020000.sqlite

# Запуск приложения
docker-compose start app
```

## 🔄 Обновление приложения

### Автоматическое обновление
```bash
./scripts/update.sh
```

### Ручное обновление
```bash
# Получение изменений
git pull origin main

# Пересборка контейнера
docker-compose build --no-cache app

# Перезапуск с нулевым даунтаймом
docker-compose up -d app
```

## 🛠 Управление через PM2 (альтернативный вариант)

Если предпочитаете PM2 вместо Docker:

```bash
# Установка зависимостей
npm install

# Запуск через PM2
pm2 start ecosystem.config.js --env production

# Сохранение конфигурации
pm2 save
pm2 startup
```

## 🚨 Решение проблем

### Бот не отвечает
1. Проверьте webhook:
```bash
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

2. Проверьте логи:
```bash
docker-compose logs --tail=50 app | grep ERROR
```

3. Проверьте SSL сертификат:
```bash
echo | openssl s_client -servername yourdomain.com -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates
```

### Ошибки базы данных
```bash
# Проверка целостности БД
docker-compose exec app sqlite3 /app/data/database.sqlite "PRAGMA integrity_check;"

# Восстановление из последнего бекапа
cp backups/db_backup_latest.sqlite data/database.sqlite
docker-compose restart app
```

### Нехватка памяти
```bash
# Проверка использования памяти
docker stats

# Настройка swap (если нужно)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

## 📈 Оптимизация производительности

### 1. Настройка Redis для кеширования
В `.env.production`:
```
REDIS_URL=redis://redis:6379
CACHE_TTL=3600
```

### 2. Настройка PM2 кластера
В `ecosystem.config.js`:
```javascript
instances: process.env.PM2_INSTANCES || 'max'
```

### 3. Оптимизация Nginx
```nginx
# Включение кеширования
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## 🔒 Безопасность

### Обязательные шаги:
1. ✅ Смените стандартные пароли
2. ✅ Настройте файрвол (ufw)
3. ✅ Включите fail2ban
4. ✅ Используйте SSL сертификаты
5. ✅ Регулярно обновляйте систему
6. ✅ Настройте автоматические бекапы

### Дополнительная защита:
```bash
# Установка дополнительных инструментов безопасности
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Настройка аудита
sudo apt install -y auditd
sudo systemctl enable auditd
```

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи: `docker-compose logs -f`
2. Проверьте документацию: [DOCUMENTATION.md](DOCUMENTATION.md)
3. Создайте issue на GitHub
4. Telegram поддержка: @your_support_bot

---

🎉 **Поздравляем!** Ваш Restaurant Bot успешно развернут и готов к работе!