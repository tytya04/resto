const moment = require('moment-timezone');

// Устанавливаем часовой пояс по умолчанию
const TIMEZONE = 'Europe/Samara'; // UTC+4

/**
 * Форматировать дату в часовом поясе Самары
 * @param {Date|string} date - Дата для форматирования
 * @param {string} format - Формат вывода
 * @returns {string} Отформатированная дата
 */
const formatInTimezone = (date, format = 'DD.MM.YYYY HH:mm') => {
  return moment(date).tz(TIMEZONE).format(format);
};

/**
 * Получить текущее время в часовом поясе Самары
 * @returns {moment.Moment} Момент времени
 */
const nowInTimezone = () => {
  return moment().tz(TIMEZONE);
};

/**
 * Создать момент времени в часовом поясе Самары
 * @param {Date|string} date - Дата
 * @returns {moment.Moment} Момент времени
 */
const momentInTimezone = (date) => {
  if (date) {
    return moment(date).tz(TIMEZONE);
  }
  return moment().tz(TIMEZONE);
};

/**
 * Конвертировать локальное время в UTC для сохранения в БД
 * @param {Date|string} localTime - Локальное время
 * @returns {Date} UTC время
 */
const toUTC = (localTime) => {
  return moment.tz(localTime, TIMEZONE).utc().toDate();
};

/**
 * Парсить время из строки в часовом поясе Самары
 * @param {string} timeStr - Строка времени
 * @param {string} format - Формат строки
 * @returns {Date} UTC время
 */
const parseInTimezone = (timeStr, format) => {
  return moment.tz(timeStr, format, TIMEZONE).utc().toDate();
};

module.exports = {
  TIMEZONE,
  formatInTimezone,
  nowInTimezone,
  momentInTimezone,
  toUTC,
  parseInTimezone
};