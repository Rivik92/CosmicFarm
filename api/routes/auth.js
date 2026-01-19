const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { validateTelegramData, verifyTelegramWebAppData } = require('../middleware/validation');

// Вход через Telegram
router.post('/telegram', validateTelegramData, async (req, res) => {
  try {
    const { initData } = req.body;
    
    // Парсим данные из Telegram
    const params = new URLSearchParams(initData);
    const userData = JSON.parse(params.get('user'));
    const hash = params.get('hash');
    
    // Проверяем подпись Telegram (в продакшене)
    if (process.env.NODE_ENV === 'production' && process.env.TELEGRAM_BOT_TOKEN) {
      const isValid = verifyTelegramWebAppData(initData, process.env.TELEGRAM_BOT_TOKEN);
      if (!isValid) {
        return res.status(401).json({ error: 'Неверная подпись Telegram' });
      }
    }
    
    // Ищем или создаем пользователя
    let user = await User.findOne({ telegramId: userData.id });
    
    if (!user) {
      // Создаем нового пользователя
      user = new User({
        telegramId: userData.id,
        username: userData.username,
        firstName: userData.first_name,
        lastName: userData.last_name,
        languageCode: userData.language_code || 'ru',
        metrics: {
          deviceType: req.useragent?.isMobile ? 'mobile' : 'desktop',
          platform: req.useragent?.platform,
          lastLogin: new Date()
        }
      });
      
      // Генерируем реферальный код
      user.referralCode = user.generateReferralCode();
      
      // Проверяем реферальный код из URL
      const referrerCode = req.body.referralCode || req.query.ref;
      if (referrerCode) {
        const referrer = await User.findOne({ referralCode: referrerCode });
        if (referrer && referrer._id.toString() !== user._id.toString()) {
          user.referredBy = referrer._id;
          referrer.referrals.push(user._id);
          await referrer.save();
          
          // Награда за реферала
          referrer.addStars(1000, 'Реферальная награда');
          await referrer.save();
        }
      }
    } else {
      // Обновляем существующего пользователя
      user.username = userData.username || user.username;
      user.firstName = userData.first_name || user.firstName;
      user.lastName = userData.last_name || user.lastName;
      user.metrics.lastLogin = new Date();
      user.metrics.sessionsCount += 1;
    }
    
    // Восстанавливаем оффлайн доход
    user.restoreOfflineIncome();
    
    await user.save();
    
    // Генерируем JWT токены
    const accessToken = jwt.sign(
      { userId: user._id, telegramId: user.telegramId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );
    
    // Сохраняем сессию
    user.sessions.push({
      token: refreshToken,
      device: req.useragent?.browser || 'Unknown',
      ip: req.ip,
      lastUsed: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 дней
    });
    
    await user.save();
    
    // Отправляем ответ
    res.json({
      success: true,
      user: {
        id: user._id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        gameState: user.gameState,
        referralCode: user.referralCode,
        settings: user.settings
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 7 * 24 * 60 * 60 // 7 дней в секундах
      }
    });
    
  } catch (error) {
    console.error('Ошибка аутентификации:', error);
    res.status(500).json({ error: 'Ошибка сервера при аутентификации' });
  }
});

// Обновление токена
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Требуется refresh token' });
    }
    
    // Проверяем refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Ищем пользователя
    const user = await User.findOne({
      _id: decoded.userId,
      'sessions.token': refreshToken,
      'sessions.expiresAt': { $gt: new Date() }
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Недействительный refresh token' });
    }
    
    // Обновляем время использования сессии
    user.sessions = user.sessions.map(session => {
      if (session.token === refreshToken) {
        session.lastUsed = new Date();
      }
      return session;
    });
    
    await user.save();
    
    // Генерируем новый access token
    const newAccessToken = jwt.sign(
      { userId: user._id, telegramId: user.telegramId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    res.json({
      success: true,
      accessToken: newAccessToken,
      expiresIn: 7 * 24 * 60 * 60
    });
    
  } catch (error) {
    console.error('Ошибка обновления токена:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Недействительный токен' });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Срок действия токена истек' });
    }
    
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Выход
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Требуется refresh token' });
    }
    
    // Находим и удаляем сессию
    const user = await User.findOne({ 'sessions.token': refreshToken });
    
    if (user) {
      user.sessions = user.sessions.filter(session => session.token !== refreshToken);
      await user.save();
    }
    
    res.json({ success: true, message: 'Успешный выход из системы' });
    
  } catch (error) {
    console.error('Ошибка выхода:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Выход со всех устройств
router.post('/logout-all', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'Требуется ID пользователя' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Оставляем только текущую сессию (если есть токен в запросе)
    const currentToken = req.headers.authorization?.replace('Bearer ', '');
    
    if (currentToken) {
      user.sessions = user.sessions.filter(session => session.token === currentToken);
    } else {
      user.sessions = [];
    }
    
    await user.save();
    
    res.json({ success: true, message: 'Выполнен выход со всех устройств' });
    
  } catch (error) {
    console.error('Ошибка выхода со всех устройств:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Проверка реферального кода
router.get('/referral/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const user = await User.findOne({ referralCode: code })
      .select('telegramId username firstName lastName gameState.userLevel');
    
    if (!user) {
      return res.status(404).json({ error: 'Реферальный код не найден' });
    }
    
    res.json({
      success: true,
      referrer: {
        id: user._id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        level: user.gameState.userLevel
      }
    });
    
  } catch (error) {
    console.error('Ошибка проверки реферального кода:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение реферальной статистики
router.get('/referral-stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .populate('referrals', 'telegramId username firstName lastName gameState.stars gameState.userLevel createdAt')
      .select('referralCode referrals referredBy');
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    const referrals = user.referrals || [];
    const activeReferrals = referrals.filter(ref => 
      ref.gameState && ref.gameState.stars > 0
    ).length;
    
    const totalEarned = referrals.length * 1000; // По 1000 звезд за каждого реферала
    
    res.json({
      success: true,
      stats: {
        referralCode: user.referralCode,
        totalReferrals: referrals.length,
        activeReferrals: activeReferrals,
        totalEarned: totalEarned,
        referrals: referrals.map(ref => ({
          id: ref._id,
          telegramId: ref.telegramId,
          username: ref.username,
          firstName: ref.firstName,
          lastName: ref.lastName,
          stars: ref.gameState?.stars || 0,
          level: ref.gameState?.userLevel || 1,
          joinedAt: ref.createdAt
        }))
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения реферальной статистики:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Изменение настроек
router.put('/settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Некорректные настройки' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Обновляем настройки
    user.settings = { ...user.settings, ...settings };
    await user.save();
    
    res.json({
      success: true,
      settings: user.settings,
      message: 'Настройки успешно обновлены'
    });
    
  } catch (error) {
    console.error('Ошибка обновления настроек:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удаление аккаунта (запрос)
router.post('/delete-account/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { confirmation } = req.body;
    
    if (confirmation !== 'Я подтверждаю удаление аккаунта') {
      return res.status(400).json({ error: 'Требуется подтверждение' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Вместо удаления помечаем аккаунт как удаленный
    user.isBanned = true;
    user.banReason = 'Аккаунт удален пользователем';
    user.gameState.stars = 0;
    user.sessions = [];
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Аккаунт успешно удален'
    });
    
  } catch (error) {
    console.error('Ошибка удаления аккаунта:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Экспорт данных пользователя
router.get('/export-data/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .select('-sessions -__v')
      .lean();
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Форматируем данные для экспорта
    const exportData = {
      user: {
        id: user._id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      gameState: user.gameState,
      transactions: user.transactions,
      achievements: user.achievements,
      settings: user.settings,
      exportDate: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: exportData,
      format: 'JSON'
    });
    
  } catch (error) {
    console.error('Ошибка экспорта данных:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;