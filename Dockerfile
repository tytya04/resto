# Multi-stage build для оптимизации размера образа
FROM node:18-alpine AS builder

# Установка зависимостей для Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Создание рабочей директории
WORKDIR /app

# Копирование package files
COPY package*.json ./

# Установка зависимостей для продакшена
RUN npm ci --only=production

# Копирование исходного кода
COPY . .

# Production stage
FROM node:18-alpine

# Установка необходимых пакетов
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    tini

# Добавление русских шрифтов
RUN apk add --no-cache font-noto font-noto-cjk && \
    fc-cache -f -v

# Создание пользователя для безопасности
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Создание рабочей директории
WORKDIR /app

# Копирование зависимостей из builder stage
COPY --from=builder /app/node_modules ./node_modules

# Копирование приложения
COPY --chown=nodejs:nodejs . .

# Создание необходимых директорий
RUN mkdir -p logs documents backups temp && \
    chown -R nodejs:nodejs /app

# Переменные окружения для Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

# Переключение на пользователя nodejs
USER nodejs

# Экспозиция порта для health check
EXPOSE 3000

# Использование tini для правильной обработки сигналов
ENTRYPOINT ["/sbin/tini", "--"]

# Запуск приложения
CMD ["node", "index.js"]