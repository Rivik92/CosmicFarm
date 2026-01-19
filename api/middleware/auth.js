const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware для проверки JWT токена
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Токен не предоставлен' });
    }
    
    // Проверяем токен
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Ищем пользователя
    const user = await User.findById(decoded.userId)
      .select('-sessions -__v');
    
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }
    
    if (user.isBanned) {
      return res.status(403).json({ 
        error: 'Аккаунт заблокирован',
        reason: user.banReason
      });
    }
    
// Добавьте эту функцию в существующий файл auth.js
exports.isAdmin = (req, res, next) => {
    try {
        // Предполагаем, что authMiddleware уже добавил данные пользователя в req.user
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: 'Доступ запрещён. Требуются права администратора' 
            });
        }
        next();
    } catch (error) {
        res.status(500).json({ success: false, message: 'Ошибка проверки прав' });
    }
};

    // Проверяем последнюю активность (опционально)
    const maxInactivity = 30 * 24 * 60 * 60 * 1000; // 30 дней
    if (user.gameState.lastActive && (Date.now() - new Date(user.gameState.lastActive).getTime()) > maxInactivity) {
      return res.status(401).json({ error: 'Сессия истекла из-за неактивности' });
    }
    
    // Добавляем пользователя в запрос
    req.user = {
      userId: user._id,
      telegramId: user.telegramId,
      role: user.role
    };
    
    next();
  } catch (error) {
    console.error('Ошибка аутентификации:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Недействительный токен' });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Срок действия токена истек' });
    }
    
    res.status(500).json({ error: 'Ошибка сервера при аутентификации' });
  }
};

// Middleware для проверки ролей
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Недостаточно прав',
        requiredRoles: roles,
        userRole: req.user.role
      });
    }
    
    next();
  };
};

// Middleware для проверки владения ресурсом
const checkOwnership = (model, paramName = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[paramName];
      const userId = req.user.userId;
      
      if (!resourceId) {
        return res.status(400).json({ error: 'Требуется ID ресурса' });
      }
      
      // Ищем ресурс
      const resource = await model.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({ error: 'Ресурс не найден' });
      }
      
      // Проверяем владение (предполагаем, что у ресурса есть поле userId)
      if (resource.userId && resource.userId.toString() !== userId.toString()) {
        // Если пользователь не владелец, проверяем права администратора
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Доступ запрещен' });
        }
      }
      
      // Добавляем ресурс в запрос
      req.resource = resource;
      next();
    } catch (error) {
      console.error('Ошибка проверки владения:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
};

// Middleware для проверки лимитов
const checkLimits = (limits) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;
      
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      // Проверяем каждый лимит
      for (const [key, limit] of Object.entries(limits)) {
        switch(key) {
          case 'dailyClicks':
            const today = new Date().toDateString();
            const lastClickDate = user.gameState.lastClickDate;
            
            if (lastClickDate && new Date(lastClickDate).toDateString() === today) {
              if (user.gameState.dailyClicks >= limit) {
                return res.status(429).json({ 
                  error: 'Достигнут дневной лимит кликов',
                  limit: limit,
                  reset: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                });
              }
            }
            break;
            
          case 'energy':
            if (user.gameState.energy < limit) {
              return res.status(400).json({ 
                error: 'Недостаточно энергии',
                required: limit,
                current: user.gameState.energy
              });
            }
            break;
            
          case 'stars':
            if (user.gameState.stars < limit) {
              return res.status(400).json({ 
                error: 'Недостаточно звезд',
                required: limit,
                current: user.gameState.stars
              });
            }
            break;
        }
      }
      
      next();
    } catch (error) {
      console.error('Ошибка проверки лимитов:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
};

// Middleware для логирования запросов
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Сохраняем оригинальные методы
  const originalSend = res.send;
  const originalJson = res.json;
  
  // Переопределяем res.json для логирования
  res.json = function(data) {
    const duration = Date.now() - start;
    
    console.log({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.userId || 'anonymous',
      userAgent: req.headers['user-agent'],
      ip: req.ip
    });
    
    return originalJson.call(this, data);
  };
  
  // Переопределяем res.send для логирования
  res.send = function(data) {
    const duration = Date.now() - start;
    
    console.log({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.userId || 'anonymous',
      userAgent: req.headers['user-agent'],
      ip: req.ip
    });
    
    return originalSend.call(this, data);
  };
  
  next();
};

// Middleware для проверки состояния игры
const checkGameState = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Восстанавливаем оффлайн доход если нужно
    if (req.method === 'GET' && req.path.includes('/game/state')) {
      user.restoreOfflineIncome();
      await user.save();
    }
    
    // Проверяем валидность состояния игры
    if (user.gameState.stars < 0) user.gameState.stars = 0;
    if (user.gameState.energy < 0) user.gameState.energy = 0;
    if (user.gameState.energy > user.gameState.maxEnergy) {
      user.gameState.energy = user.gameState.maxEnergy;
    }
    
    // Добавляем пользователя в запрос
    req.userGameState = user.gameState;
    next();
  } catch (error) {
    console.error('Ошибка проверки состояния игры:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// Экспорт middleware
module.exports = {
  authenticate,
  authorize,
  checkOwnership,
  checkLimits,
  requestLogger,
  checkGameState
};