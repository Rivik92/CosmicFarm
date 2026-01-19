const crypto = require('crypto');

// Валидация данных от Telegram
const validateTelegramData = (req, res, next) => {
  try {
    const { initData } = req.body;
    
    if (!initData) {
      return res.status(400).json({ error: 'Требуются данные от Telegram' });
    }
    
    // В режиме разработки пропускаем проверку
    if (process.env.NODE_ENV === 'development' && process.env.SKIP_TELEGRAM_VALIDATION === 'true') {
      console.log('⚠️ Пропущена валидация Telegram данных (режим разработки)');
      return next();
    }
    
    // Проверяем подпись Telegram
    if (process.env.TELEGRAM_BOT_TOKEN) {
      const isValid = verifyTelegramWebAppData(initData, process.env.TELEGRAM_BOT_TOKEN);
      
      if (!isValid) {
        return res.status(401).json({ error: 'Неверная подпись Telegram' });
      }
    }
    
    next();
  } catch (error) {
    console.error('Ошибка валидации Telegram данных:', error);
    res.status(400).json({ error: 'Некорректные данные от Telegram' });
  }
};

// Верификация данных Web App Telegram
function verifyTelegramWebAppData(initData, botToken) {
  try {
    const urlParams = new URLSearchParams(initData);
    
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    
    // Сортируем параметры
    const dataCheckArr = [];
    urlParams.sort();
    urlParams.forEach((val, key) => {
      if (key !== 'hash') {
        dataCheckArr.push(`${key}=${val}`);
      }
    });
    
    const dataCheckString = dataCheckArr.join('\n');
    
    // Вычисляем секретный ключ
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    
    // Вычисляем хеш
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    return calculatedHash === hash;
  } catch (error) {
    console.error('Ошибка верификации Telegram данных:', error);
    return false;
  }
}

// Валидация игровых данных
const validateGameData = (schema) => {
  return (req, res, next) => {
    try {
      const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
      });
      
      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        
        return res.status(400).json({
          error: 'Ошибка валидации',
          details: errors
        });
      }
      
      req.validatedData = value;
      next();
    } catch (error) {
      console.error('Ошибка валидации:', error);
      res.status(500).json({ error: 'Ошибка сервера при валидации' });
    }
  };
};

// Валидация числовых параметров
const validateNumber = (field, min = 0, max = Infinity) => {
  return (req, res, next) => {
    const value = req.body[field] || req.query[field];
    
    if (value !== undefined) {
      const num = Number(value);
      
      if (isNaN(num)) {
        return res.status(400).json({ 
          error: `Поле ${field} должно быть числом` 
        });
      }
      
      if (num < min) {
        return res.status(400).json({ 
          error: `Поле ${field} должно быть не меньше ${min}` 
        });
      }
      
      if (num > max) {
        return res.status(400).json({ 
          error: `Поле ${field} должно быть не больше ${max}` 
        });
      }
      
      req[field] = num;
    }
    
    next();
  };
};

// Валидация строковых параметров
const validateString = (field, minLength = 1, maxLength = 255) => {
  return (req, res, next) => {
    const value = req.body[field] || req.query[field];
    
    if (value !== undefined) {
      if (typeof value !== 'string') {
        return res.status(400).json({ 
          error: `Поле ${field} должно быть строкой` 
        });
      }
      
      if (value.length < minLength) {
        return res.status(400).json({ 
          error: `Поле ${field} должно содержать минимум ${minLength} символов` 
        });
      }
      
      if (value.length > maxLength) {
        return res.status(400).json({ 
          error: `Поле ${field} должно содержать максимум ${maxLength} символов` 
        });
      }
      
      req[field] = value.trim();
    }
    
    next();
  };
};

// Валидация массива
const validateArray = (field, itemValidator = null, minLength = 0, maxLength = 1000) => {
  return (req, res, next) => {
    const value = req.body[field];
    
    if (value !== undefined) {
      if (!Array.isArray(value)) {
        return res.status(400).json({ 
          error: `Поле ${field} должно быть массивом` 
        });
      }
      
      if (value.length < minLength) {
        return res.status(400).json({ 
          error: `Массив ${field} должен содержать минимум ${minLength} элементов` 
        });
      }
      
      if (value.length > maxLength) {
        return res.status(400).json({ 
          error: `Массив ${field} должен содержать максимум ${maxLength} элементов` 
        });
      }
      
      if (itemValidator) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          const error = itemValidator(item, i);
          
          if (error) {
            return res.status(400).json({ 
              error: `Ошибка в элементе ${i} массива ${field}: ${error}` 
            });
          }
        }
      }
      
      req[field] = value;
    }
    
    next();
  };
};

// Валидация объекта
const validateObject = (field, schema = null) => {
  return (req, res, next) => {
    const value = req.body[field];
    
    if (value !== undefined) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return res.status(400).json({ 
          error: `Поле ${field} должно быть объектом` 
        });
      }
      
      if (schema) {
        const { error } = schema.validate(value, { abortEarly: false });
        
        if (error) {
          const errors = error.details.map(detail => ({
            field: `${field}.${detail.path.join('.')}`,
            message: detail.message
          }));
          
          return res.status(400).json({
            error: 'Ошибка валидации объекта',
            details: errors
          });
        }
      }
      
      req[field] = value;
    }
    
    next();
  };
};

// Экспорт middleware
module.exports = {
  validateTelegramData,
  verifyTelegramWebAppData,
  validateGameData,
  validateNumber,
  validateString,
  validateArray,
  validateObject
};