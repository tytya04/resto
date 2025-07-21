# Настройка Google Sheets для бота закупок

## 1. Создание Service Account

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Включите Google Sheets API:
   - В меню выберите "APIs & Services" > "Library"
   - Найдите "Google Sheets API" и нажмите "Enable"

4. Создайте Service Account:
   - Перейдите в "APIs & Services" > "Credentials"
   - Нажмите "Create Credentials" > "Service Account"
   - Заполните данные:
     - Service account name: `restaurant-bot-sheets`
     - Service account ID: автоматически генерируется
   - Нажмите "Create and Continue"
   - Пропустите шаги с ролями (необязательно)
   - Нажмите "Done"

5. Создайте ключ для Service Account:
   - Найдите созданный Service Account в списке
   - Нажмите на него
   - Перейдите во вкладку "Keys"
   - Нажмите "Add Key" > "Create new key"
   - Выберите "JSON" и нажмите "Create"
   - Сохраните скачанный JSON файл

## 2. Настройка Google Sheets

1. Создайте новую Google Таблицу
2. Структура таблицы должна быть следующей:

| Название | Категория | Единица измерения | Цена закупки | Цена продажи |
|----------|-----------|-------------------|--------------|--------------|
| Картофель | Овощи | кг | 35 | 50 |
| Морковь | Овощи | кг | 40 | 60 |
| Говядина | Мясо | кг | 450 | 650 |

3. Поделитесь таблицей с Service Account:
   - Нажмите кнопку "Share" в Google Sheets
   - Введите email из JSON файла (поле `client_email`)
   - Дайте права "Viewer" (только чтение)
   - Нажмите "Send"

4. Скопируйте ID таблицы из URL:
   - URL выглядит так: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
   - Скопируйте `SPREADSHEET_ID`

## 3. Настройка переменных окружения

Из скачанного JSON файла возьмите значения и добавьте в `.env`:

```env
# Google Sheets Configuration
GOOGLE_SHEETS_ID=ваш_spreadsheet_id
GOOGLE_SHEETS_RANGE=Sheet1!A:E
GOOGLE_SERVICE_ACCOUNT_EMAIL=ваш_email_из_json@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nваш_приватный_ключ_из_json\n-----END PRIVATE KEY-----"

# Расписание обновления кэша (каждые 6 часов)
CACHE_UPDATE_SCHEDULE="0 */6 * * *"
```

## 4. Формат cron для расписания

Формат: `* * * * *` (минуты часы день месяц день_недели)

Примеры:
- `0 */6 * * *` - каждые 6 часов
- `0 9,15,21 * * *` - в 9:00, 15:00 и 21:00
- `*/30 * * * *` - каждые 30 минут
- `0 0 * * *` - каждый день в полночь

## 5. Проверка работы

После настройки бот будет:
1. Загружать номенклатуру при запуске
2. Обновлять кэш по расписанию
3. Использовать локальный кэш для быстрого поиска
4. Поддерживать нечеткий поиск продуктов

## Возможные проблемы

1. **Ошибка аутентификации**
   - Проверьте правильность `GOOGLE_SERVICE_ACCOUNT_EMAIL` и `GOOGLE_PRIVATE_KEY`
   - Убедитесь, что таблица расшарена на email Service Account

2. **Пустой кэш**
   - Проверьте правильность `GOOGLE_SHEETS_ID` и `GOOGLE_SHEETS_RANGE`
   - Убедитесь, что в таблице есть данные в указанном диапазоне

3. **Не обновляется кэш**
   - Проверьте формат `CACHE_UPDATE_SCHEDULE`
   - Посмотрите логи на наличие ошибок