const express = require('express');
const router = express.Router();
const User = require('../models/User');
const AdView = require('../models/AdView');
const Transaction = require('../models/Transaction');
const { authenticate } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limiting для рекламы
const adLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 минут
  max: 10, // 10 запросов за 5 минут
  message: { error: 'Слишком много запросов, подождите' }
});

// Запрос на показ рекламы
router.post('/request', authenticate, adLimiter, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { adType = 'rewarded_video', provider = 'test' } = req.body;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Проверяем, может ли пользователь смотреть рекламу
    if (!user.canWatchAd()) {
      return res.status(400).json({ 
        error: 'Достигнут дневной лимит рекламы',
        adsWatchedToday: user.adStats.adsWatchedToday,
        maxAdsPerDay: 10
      });
    }
    
    // Проверяем минимальную энергию
    if (user.gameState.energy < 10) {
      return res.status(400).json({ 
        error: 'Недостаточно энергии для просмотра рекламы',
        requiredEnergy: 10,
        currentEnergy: user.gameState.energy
      });
    }
    
    // Создаем запись о просмотре
    const adView = await AdView.createAdView(userId, {
      provider: provider,
      adType: adType,
      adUnitId: `${provider}_${adType}`,
      adName: `${provider} ${adType}`,
      rewardAmount: 500 + Math.floor(Math.random() * 500), // 500-1000 звезд
      rewardType: 'stars',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      deviceType: req.useragent?.isMobile ? 'mobile' : 'desktop'
    });
    
    res.json({
      success: true,
      adViewId: adView.adView._id,
      provider: provider,
      adType: adType,
      estimatedReward: adView.adView.rewardAmount,
      energyCost: 10,
      session: adView.session // Для дальнейшего использования
    });
    
  } catch (error) {
    console.error('Ошибка запроса рекламы:', error);
    
    if (error.message === 'Достигнут дневной лимит рекламы') {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Завершение просмотра рекламы
router.post('/complete', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { adViewId, completionPercentage = 100, revenue = 0 } = req.body;
    
    if (!adViewId) {
      return res.status(400).json({ error: 'Требуется ID просмотра рекламы' });
    }
    
    if (completionPercentage < 0 || completionPercentage > 100) {
      return res.status(400).json({ error: 'Некорректный процент завершения' });
    }
    
    // Завершаем просмотр рекламы
    const result = await AdView.completeAdView(adViewId, {
      completionPercentage: completionPercentage,
      revenue: revenue
    });
    
    // Расходуем энергию
    const user = await User.findById(userId);
    if (user && user.gameState.energy >= 10) {
      user.gameState.energy -= 10;
      await user.save();
    }
    
    res.json({
      success: true,
      message: 'Реклама успешно просмотрена',
      reward: result.reward,
      adView: result.adView,
      newEnergy: user?.gameState.energy || 0
    });
    
  } catch (error) {
    console.error('Ошибка завершения просмотра рекламы:', error);
    
    if (error.message === 'Просмотр уже завершен или отменен') {
      return res.status(400).json({ error: error.message });
    }
    
    if (error.message === 'Запись о просмотре не найдена') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Отмена просмотра рекламы
router.post('/cancel', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { adViewId, reason = 'user_cancelled' } = req.body;
    
    if (!adViewId) {
      return res.status(400).json({ error: 'Требуется ID просмотра рекламы' });
    }
    
    // Находим и отменяем запись о просмотре
    const adView = await AdView.findById(adViewId);
    
    if (!adView) {
      return res.status(404).json({ error: 'Запись о просмотре не найдена' });
    }
    
    if (adView.userId.toString() !== userId) {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }
    
    if (adView.status !== 'started') {
      return res.status(400).json({ error: 'Просмотр уже завершен' });
    }
    
    adView.status = 'skipped';
    adView.metadata = { ...adView.metadata, cancelReason: reason };
    
    await adView.save();
    
    res.json({
      success: true,
      message: 'Просмотр рекламы отменен',
      adViewId: adViewId
    });
    
  } catch (error) {
    console.error('Ошибка отмены просмотра рекламы:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Статистика рекламы пользователя
router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const [userStats, adViews, dailyStats] = await Promise.all([
      // Статистика из модели User
      User.findById(userId).select('adStats').lean(),
      
      // Подробная статистика просмотров
      AdView.aggregate([
        { $match: { userId: require('mongoose').Types.ObjectId(userId), status: 'completed' } },
        { $group: {
          _id: {
            provider: '$adProvider',
            type: '$adType'
          },
          views: { $sum: 1 },
          totalReward: { $sum: '$rewardAmount' },
          totalRevenue: { $sum: '$revenue' },
          avgDuration: { $avg: '$duration' },
          avgCompletion: { $avg: '$completionPercentage' }
        }},
        { $sort: { views: -1 } }
      ]),
      
      // Ежедневная статистика за последние 7 дней
      AdView.aggregate([
        { 
          $match: { 
            userId: require('mongoose').Types.ObjectId(userId),
            status: 'completed',
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          views: { $sum: 1 },
          totalReward: { $sum: '$rewardAmount' },
          avgReward: { $avg: '$rewardAmount' }
        }},
        { $sort: { '_id': 1 } }
      ])
    ]);
    
    if (!userStats) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    const stats = {
      basic: {
        adsWatchedToday: userStats.adStats?.adsWatchedToday || 0,
        totalAdsWatched: userStats.adStats?.totalAdsWatched || 0,
        totalEarnedFromAds: userStats.adStats?.totalEarnedFromAds || 0,
        lastAdWatch: userStats.adStats?.lastAdWatch,
        adsLeftToday: Math.max(0, 10 - (userStats.adStats?.adsWatchedToday || 0)),
        dailyReset: userStats.adStats?.dailyReset
      },
      
      detailed: adViews.map(item => ({
        provider: item._id.provider,
        type: item._id.type,
        views: item.views,
        totalReward: item.totalReward,
        totalRevenue: item.totalRevenue,
        avgDuration: item.avgDuration,
        avgCompletion: item.avgCompletion
      })),
      
      daily: dailyStats.map(item => ({
        date: item._id,
        views: item.views,
        totalReward: item.totalReward,
        avgReward: item.avgReward
      })),
      
      summary: {
        totalProviders: new Set(adViews.map(item => item._id.provider)).size,
        totalTypes: new Set(adViews.map(item => item._id.type)).size,
        avgRewardPerAd: userStats.adStats?.totalAdsWatched > 0 
          ? userStats.adStats.totalEarnedFromAds / userStats.adStats.totalAdsWatched 
          : 0,
        bestProvider: adViews.length > 0 ? adViews[0]._id.provider : null,
        mostWatchedType: adViews.length > 0 ? adViews[0]._id.type : null
      }
    };
    
    res.json({
      success: true,
      stats: stats,
      updatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Ошибка получения статистики рекламы:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Настройки рекламы
router.get('/settings', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId).select('settings').lean();
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Настройки рекламы по умолчанию
    const defaultSettings = {
      enabled: true,
      autoPlay: false,
      soundEnabled: true,
      vibrationEnabled: true,
      minEnergyForAds: 10,
      preferredProviders: ['test', 'hilltopads', 'admob'],
      blacklistedCategories: [],
      dailyLimit: 10,
      rewardMultiplier: 1.0
    };
    
    // Объединяем с настройками пользователя
    const adSettings = {
      ...defaultSettings,
      ...(user.settings?.ads || {})
    };
    
    // Доступные провайдеры
    const availableProviders = [
      {
        id: 'test',
        name: 'Тестовая реклама',
        description: 'Используется для разработки и тестирования',
        minReward: 500,
        maxReward: 1000,
        supportedTypes: ['rewarded_video', 'interstitial'],
        enabled: true
      },
      {
        id: 'hilltopads',
        name: 'HilltopAds',
        description: 'Популярная рекламная сеть для Telegram игр',
        minReward: 1000,
        maxReward: 5000,
        supportedTypes: ['rewarded_video', 'interstitial', 'banner'],
        enabled: !!process.env.HILLTOPADS_PUBLISHER_ID
      },
      {
        id: 'admob',
        name: 'Google AdMob',
        description: 'Рекламная сеть от Google для мобильных приложений',
        minReward: 800,
        maxReward: 3000,
        supportedTypes: ['rewarded_video', 'interstitial', 'banner'],
        enabled: !!process.env.ADMOB_APP_ID
      },
      {
        id: 'unity',
        name: 'Unity Ads',
        description: 'Рекламная сеть от Unity для игр',
        minReward: 1000,
        maxReward: 4000,
        supportedTypes: ['rewarded_video', 'interstitial'],
        enabled: !!process.env.UNITY_GAME_ID
      }
    ].filter(provider => provider.enabled);
    
    // Доступные типы рекламы
    const adTypes = [
      {
        id: 'rewarded_video',
        name: 'Видео с наградой',
        description: 'Просмотр видео для получения награды',
        avgDuration: 30,
        energyCost: 10,
        avgReward: 750
      },
      {
        id: 'interstitial',
        name: 'Полноэкранная реклама',
        description: 'Короткая реклама между действиями',
        avgDuration: 5,
        energyCost: 5,
        avgReward: 250
      },
      {
        id: 'banner',
        name: 'Баннерная реклама',
        description: 'Небольшая реклама в интерфейсе',
        avgDuration: 0,
        energyCost: 0,
        avgReward: 10
      }
    ];
    
    res.json({
      success: true,
      settings: adSettings,
      availableProviders: availableProviders,
      adTypes: adTypes,
      limits: {
        maxAdsPerDay: 10,
        minEnergyPerAd: 10,
        cooldownBetweenAds: 30000, // 30 секунд
        maxRewardPerDay: 10000
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения настроек рекламы:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновление настроек рекламы
router.put('/settings', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Некорректные настройки' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Обновляем настройки
    user.settings.ads = {
      ...user.settings.ads,
      ...settings
    };
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Настройки рекламы обновлены',
      settings: user.settings.ads
    });
    
  } catch (error) {
    console.error('Ошибка обновления настроек рекламы:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// История просмотров рекламы
router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 50, page = 1, provider = null, type = null } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Строим запрос
    const query = { userId: require('mongoose').Types.ObjectId(userId) };
    
    if (provider) {
      query.adProvider = provider;
    }
    
    if (type) {
      query.adType = type;
    }
    
    // Получаем историю просмотров
    const adViews = await AdView.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v -verification.flags')
      .lean();
    
    // Получаем общее количество
    const totalViews = await AdView.countDocuments(query);
    
    // Форматируем данные
    const history = adViews.map(view => ({
      id: view._id,
      date: view.createdAt,
      provider: view.adProvider,
      type: view.adType,
      status: view.status,
      reward: view.rewardAmount,
      duration: view.duration,
      completion: view.completionPercentage,
      revenue: view.revenue,
      verified: view.verification?.isVerified || false,
      device: view.deviceType,
      country: view.country
    }));
    
    // Статистика по истории
    const stats = {
      totalViews: totalViews,
      completedViews: history.filter(v => v.status === 'completed').length,
      totalReward: history.reduce((sum, v) => sum + (v.reward || 0), 0),
      totalRevenue: history.reduce((sum, v) => sum + (v.revenue || 0), 0),
      avgCompletion: history.length > 0 
        ? history.reduce((sum, v) => sum + (v.completion || 0), 0) / history.length 
        : 0,
      byProvider: {},
      byType: {}
    };
    
    // Группируем по провайдерам и типам
    history.forEach(view => {
      stats.byProvider[view.provider] = (stats.byProvider[view.provider] || 0) + 1;
      stats.byType[view.type] = (stats.byType[view.type] || 0) + 1;
    });
    
    res.json({
      success: true,
      history: history,
      stats: stats,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(totalViews / parseInt(limit)),
      filters: {
        provider: provider,
        type: type
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения истории просмотров рекламы:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Сброс дневного счетчика (для тестирования)
router.post('/reset-daily', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Проверяем, является ли пользователь администратором
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Только администраторы или в режиме разработки
    if (user.role !== 'admin' && process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }
    
    // Сбрасываем дневной счетчик
    user.adStats.adsWatchedToday = 0;
    user.adStats.dailyReset = new Date();
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Дневной счетчик рекламы сброшен',
      adsWatchedToday: user.adStats.adsWatchedToday,
      dailyReset: user.adStats.dailyReset
    });
    
  } catch (error) {
    console.error('Ошибка сброса дневного счетчика:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Тестовая реклама (для разработки)
router.post('/test', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Только в режиме разработки
    if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
      return res.status(403).json({ error: 'Доступно только в режиме разработки' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Проверяем энергию
    if (user.gameState.energy < 10) {
      return res.status(400).json({ 
        error: 'Недостаточно энергии',
        required: 10,
        current: user.gameState.energy
      });
    }
    
    // Создаем тестовый просмотр
    const testAd = {
      provider: 'test',
      adType: 'rewarded_video',
      adUnitId: 'test_unit',
      adName: 'Тестовая реклама',
      rewardAmount: 750,
      rewardType: 'stars',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      deviceType: 'test'
    };
    
    const adView = await AdView.createAdView(userId, testAd);
    
    // Немедленно завершаем с 100% просмотром
    const result = await AdView.completeAdView(adView.adView._id, {
      completionPercentage: 100,
      revenue: 0.5 // Тестовый доход
    });
    
    // Расходуем энергию
    user.gameState.energy -= 10;
    await user.save();
    
    res.json({
      success: true,
      message: 'Тестовая реклама успешно просмотрена',
      reward: result.reward,
      energyCost: 10,
      newEnergy: user.gameState.energy,
      adView: result.adView
    });
    
  } catch (error) {
    console.error('Ошибка тестовой рекламы:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;