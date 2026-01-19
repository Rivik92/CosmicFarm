const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const winston = require('winston');

// Настройки Redis для rate limiting
let redisClient = null;
let redisStore = null;

if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false
    });
    
    redisStore = new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: 'rate-limit:'
    });
    
    redisClient.on('error', (error) => {
      winston.error('Redis connection error:', error);
    });
    
    redisClient.on('connect', () => {
      winston.info('✅ Redis подключен для rate limiting');
    });
  } catch (error) {
    winston.error('Ошибка инициализации Redis:', error);
  }
}

// Базовые настройки rate limiting
const defaultOptions = {
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // 100 запросов за 15 минут
  message: {
    error: 'Слишком много запросов, попробуйте позже'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    // Используем IP + user ID если пользователь авторизован
    return req.user ? `${req.user.userId}:${req.ip}` : req.ip;
  },
  handler: (req, res, next, options) => {
    winston.warn(`Rate limit exceeded: ${req.ip} - ${req.method} ${req.url}`);
    res.status(options.statusCode).json(options.message);
  }
};

// Разные лимиты для разных типов запросов
const limiters = {
  // Базовый лимит для API
  api: rateLimit({
    ...defaultOptions,
    windowMs: 15 * 60 * 1000,
    max: 100,
    store: redisStore
  }),
  
  // Строгий лимит для аутентификации
  auth: rateLimit({
    ...defaultOptions,
    windowMs: 60 * 60 * 1000, // 1 час
    max: 10, // 10 попыток входа в час
    message: {
      error: 'Слишком много попыток входа, попробуйте через час'
    },
    store: redisStore,
    skipSuccessfulRequests: true // Не считаем успешные попытки
  }),
  
  // Лимит для кликов в игре
  clicks: rateLimit({
    ...defaultOptions,
    windowMs: 1000, // 1 секунда
    max: 10, // 10 кликов в секунду
    message: {
      error: 'Слишком много кликов, подождите'
    },
    store: redisStore
  }),
  
  // Лимит для рекламы
  ads: rateLimit({
    ...defaultOptions,
    windowMs: 5 * 60 * 1000, // 5 минут
    max: 10, // 10 запросов рекламы за 5 минут
    message: {
      error: 'Слишком много запросов рекламы, подождите'
    },
    store: redisStore
  }),
  
  // Лимит для магазина
  shop: rateLimit({
    ...defaultOptions,
    windowMs: 60 * 1000, // 1 минута
    max: 20, // 20 покупок в минуту
    message: {
      error: 'Слишком много покупок, подождите'
    },
    store: redisStore
  }),
  
  // Лимит для административных функций
  admin: rateLimit({
    ...defaultOptions,
    windowMs: 60 * 1000, // 1 минута
    max: 30, // 30 запросов в минуту
    store: redisStore
  }),
  
  // Лимит для публичных эндпоинтов
  public: rateLimit({
    ...defaultOptions,
    windowMs: 60 * 1000, // 1 минута
    max: 60, // 60 запросов в минуту
    store: redisStore
  })
};

// Middleware для применения лимитов в зависимости от пути
const dynamicLimiter = (req, res, next) => {
  const path = req.path;
  
  // Определяем какой лимитер использовать
  let limiter;
  
  if (path.startsWith('/api/auth')) {
    limiter = limiters.auth;
  } else if (path.startsWith('/api/game/click')) {
    limiter = limiters.clicks;
  } else if (path.startsWith('/api/ads')) {
    limiter = limiters.ads;
  } else if (path.startsWith('/api/shop')) {
    limiter = limiters.shop;
  } else if (path.startsWith('/api/admin')) {
    limiter = limiters.admin;
  } else if (path.startsWith('/api/')) {
    limiter = limiters.api;
  } else {
    limiter = limiters.public;
  }
  
  // Применяем лимитер
  limiter(req, res, next);
};

// Функция для сброса лимитов (для админов)
const resetLimits = async (key) => {
  if (!redisClient) {
    return { success: false, error: 'Redis не настроен' };
  }
  
  try {
    const pattern = key ? `rate-limit:${key}*` : 'rate-limit:*';
    const keys = await redisClient.keys(pattern);
    
    if (keys.length > 0) {
      await redisClient.del(keys);
      return {
        success: true,
        message: `Сброшено ${keys.length} лимитов`,
        keys: keys
      };
    }
    
    return {
      success: true,
      message: 'Лимиты не найдены'
    };
  } catch (error) {
    winston.error('Ошибка сброса лимитов:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Функция для получения статистики лимитов
const getLimitStats = async () => {
  if (!redisClient) {
    return { success: false, error: 'Redis не настроен' };
  }
  
  try {
    const keys = await redisClient.keys('rate-limit:*');
    const stats = {};
    
    for (const key of keys) {
      const value = await redisClient.get(key);
      if (value) {
        const [remaining, resetTime] = value.split(':');
        stats[key.replace('rate-limit:', '')] = {
          remaining: parseInt(remaining),
          resetTime: new Date(parseInt(resetTime))
        };
      }
    }
    
    return {
      success: true,
      total: keys.length,
      stats: stats
    };
  } catch (error) {
    winston.error('Ошибка получения статистики лимитов:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Экспорт
module.exports = {
  dynamicLimiter,
  limiters,
  resetLimits,
  getLimitStats,
  redisClient
};