const express = require('express');
const router = express.Router();
const User = require('../models/User');
const GameState = require('../models/GameState');
const { authenticate } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limiting для кликов
const clickLimiter = rateLimit({
  windowMs: 1000, // 1 секунда
  max: 10, // 10 кликов в секунду
  message: { error: 'Слишком много кликов, подождите' }
});

// Обработка клика
router.post('/click', authenticate, clickLimiter, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Находим пользователя
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    if (user.isBanned) {
      return res.status(403).json({ error: 'Аккаунт заблокирован' });
    }
    
    // Обрабатываем клик
    const result = user.handleClick();
    
    // Обновляем время активности
    user.gameState.lastActive = new Date();
    
    await user.save();
    
    res.json({
      success: true,
      stars: result.stars,
      energy: result.energy,
      clickValue: result.clickValue,
      userLevel: user.gameState.userLevel,
      experience: user.gameState.experience,
      experienceNeeded: user.gameState.userLevel * 1000
    });
    
  } catch (error) {
    console.error('Ошибка обработки клика:', error);
    
    if (error.message === 'Недостаточно энергии') {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Сохранение игрового состояния
router.post('/save', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { gameState } = req.body;
    
    if (!gameState || typeof gameState !== 'object') {
      return res.status(400).json({ error: 'Некорректное состояние игры' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Обновляем состояние игры
    user.gameState = {
      ...user.gameState,
      ...gameState,
      lastActive: new Date()
    };
    
    // Проверяем валидность данных
    if (user.gameState.stars < 0) user.gameState.stars = 0;
    if (user.gameState.energy < 0) user.gameState.energy = 0;
    if (user.gameState.energy > user.gameState.maxEnergy) {
      user.gameState.energy = user.gameState.maxEnergy;
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Игра сохранена',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Ошибка сохранения игры:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Загрузка игрового состояния
router.get('/state', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Восстанавливаем оффлайн доход
    const offlineIncome = user.restoreOfflineIncome();
    
    await user.save();
    
    res.json({
      success: true,
      gameState: user.gameState,
      settings: user.settings,
      referralCode: user.referralCode,
      offlineIncome: offlineIncome,
      lastSave: user.gameState.lastActive
    });
    
  } catch (error) {
    console.error('Ошибка загрузки состояния:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Таблица лидеров
router.get('/leaderboard', async (req, res) => {
  try {
    const { type = 'stars', limit = 100, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let sortField;
    switch (type) {
      case 'stars':
        sortField = 'gameState.stars';
        break;
      case 'level':
        sortField = 'gameState.userLevel';
        break;
      case 'clicks':
        sortField = 'gameState.totalClicks';
        break;
      case 'recent':
        sortField = 'createdAt';
        break;
      default:
        sortField = 'gameState.stars';
    }
    
    // Получаем топ игроков
    const topPlayers = await User.find({ 
      'gameState.stars': { $gt: 0 },
      isBanned: { $ne: true }
    })
    .sort({ [sortField]: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .select('telegramId username firstName lastName gameState.stars gameState.userLevel gameState.totalClicks createdAt')
    .lean();
    
    // Получаем позицию текущего пользователя
    let userPosition = null;
    let userStats = null;
    
    if (req.user && req.user.userId) {
      const currentUser = await User.findById(req.user.userId)
        .select('gameState.stars gameState.userLevel gameState.totalClicks')
        .lean();
      
      if (currentUser) {
        userStats = {
          stars: currentUser.gameState.stars,
          level: currentUser.gameState.userLevel,
          clicks: currentUser.gameState.totalClicks
        };
        
        // Считаем позицию
        const position = await User.countDocuments({
          'gameState.stars': { $gt: currentUser.gameState.stars },
          isBanned: { $ne: true }
        });
        
        userPosition = position + 1;
      }
    }
    
    // Форматируем данные
    const leaderboard = topPlayers.map((player, index) => ({
      rank: skip + index + 1,
      telegramId: player.telegramId,
      username: player.username,
      firstName: player.firstName,
      lastName: player.lastName,
      stars: player.gameState.stars,
      level: player.gameState.userLevel,
      clicks: player.gameState.totalClicks,
      joined: player.createdAt
    }));
    
    // Получаем общую статистику
    const totalPlayers = await User.countDocuments({ 
      'gameState.stars': { $gt: 0 },
      isBanned: { $ne: true }
    });
    
    res.json({
      success: true,
      leaderboard: leaderboard,
      type: type,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPlayers: totalPlayers,
      totalPages: Math.ceil(totalPlayers / parseInt(limit)),
      userPosition: userPosition,
      userStats: userStats
    });
    
  } catch (error) {
    console.error('Ошибка получения таблицы лидеров:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Глобальная статистика
router.get('/global-stats', async (req, res) => {
  try {
    const [userStats, gameStats, recentPlayers] = await Promise.all([
      // Статистика пользователей
      User.aggregate([
        { $match: { isBanned: { $ne: true } } },
        { $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          activeToday: {
            $sum: {
              $cond: [{
                $gte: ['$gameState.lastActive', new Date(Date.now() - 24 * 60 * 60 * 1000)]
              }, 1, 0]
            }
          },
          avgStars: { $avg: '$gameState.stars' },
          avgLevel: { $avg: '$gameState.userLevel' },
          totalStars: { $sum: '$gameState.stars' },
          totalClicks: { $sum: '$gameState.totalClicks' }
        }}
      ]),
      
      // Статистика игры за последние 7 дней
      User.aggregate([
        { $match: { 
          isBanned: { $ne: true },
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }},
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          newUsers: { $sum: 1 },
          totalStars: { $sum: '$gameState.stars' }
        }},
        { $sort: { '_id': 1 } }
      ]),
      
      // Последние активные игроки
      User.find({ 
        isBanned: { $ne: true },
        'gameState.lastActive': { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      })
      .sort({ 'gameState.lastActive': -1 })
      .limit(10)
      .select('telegramId username firstName lastName gameState.stars gameState.userLevel gameState.lastActive')
      .lean()
    ]);
    
    const stats = userStats[0] || {
      totalUsers: 0,
      activeToday: 0,
      avgStars: 0,
      avgLevel: 0,
      totalStars: 0,
      totalClicks: 0
    };
    
    res.json({
      success: true,
      stats: {
        totalPlayers: stats.totalUsers,
        activeToday: stats.activeToday,
        avgStars: Math.round(stats.avgStars),
        avgLevel: Math.round(stats.avgLevel),
        totalStars: stats.totalStars,
        totalClicks: stats.totalClicks,
        dailyGrowth: gameStats,
        recentPlayers: recentPlayers.map(player => ({
          telegramId: player.telegramId,
          username: player.username,
          firstName: player.firstName,
          stars: player.gameState.stars,
          level: player.gameState.userLevel,
          lastActive: player.gameState.lastActive
        }))
      },
      updatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Ошибка получения глобальной статистики:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение улучшений
router.get('/upgrades', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Список всех улучшений
    const allUpgrades = [
      { id: 1, name: 'Базовый клик', description: '+1 к силе клика', cost: 100, type: 'click', value: 1 },
      { id: 2, name: 'Двойной клик', description: '×2 сила клика', cost: 500, type: 'click', multiplier: 2 },
      { id: 3, name: 'Тройной клик', description: '×3 сила клика', cost: 2000, type: 'click', multiplier: 3 },
      { id: 4, name: 'Энергия I', description: '+20 к максимальной энергии', cost: 300, type: 'energy', value: 20 },
      { id: 5, name: 'Энергия II', description: '+50 к максимальной энергии', cost: 1000, type: 'energy', value: 50 },
      { id: 6, name: 'Энергия III', description: '+100 к максимальной энергии', cost: 5000, type: 'energy', value: 100 },
      { id: 7, name: 'Пассивный доход I', description: '+5 к пассивному доходу', cost: 1000, type: 'passive', value: 5 },
      { id: 8, name: 'Пассивный доход II', description: '+15 к пассивному доходу', cost: 5000, type: 'passive', value: 15 },
      { id: 9, name: 'Пассивный доход III', description: '+30 к пассивному доходу', cost: 20000, type: 'passive', value: 30 },
      { id: 10, name: 'Критический удар', description: '10% шанс ×5 критического удара', cost: 10000, type: 'critical', chance: 0.1, multiplier: 5 }
    ];
    
    // Отмечаем купленные улучшения
    const upgrades = allUpgrades.map(upgrade => ({
      ...upgrade,
      purchased: user.gameState.upgrades.includes(upgrade.id),
      canAfford: user.gameState.stars >= upgrade.cost
    }));
    
    res.json({
      success: true,
      upgrades: upgrades,
      userStars: user.gameState.stars
    });
    
  } catch (error) {
    console.error('Ошибка получения улучшений:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Покупка улучшения
router.post('/upgrades/buy', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { upgradeId } = req.body;
    
    if (!upgradeId) {
      return res.status(400).json({ error: 'Требуется ID улучшения' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Проверяем, не куплено ли уже улучшение
    if (user.gameState.upgrades.includes(upgradeId)) {
      return res.status(400).json({ error: 'Улучшение уже куплено' });
    }
    
    // Получаем информацию об улучшении
    const upgrades = [
      { id: 1, cost: 100, type: 'click', value: 1 },
      { id: 2, cost: 500, type: 'click', multiplier: 2 },
      { id: 3, cost: 2000, type: 'click', multiplier: 3 },
      { id: 4, cost: 300, type: 'energy', value: 20 },
      { id: 5, cost: 1000, type: 'energy', value: 50 },
      { id: 6, cost: 5000, type: 'energy', value: 100 },
      { id: 7, cost: 1000, type: 'passive', value: 5 },
      { id: 8, cost: 5000, type: 'passive', value: 15 },
      { id: 9, cost: 20000, type: 'passive', value: 30 },
      { id: 10, cost: 10000, type: 'critical', chance: 0.1, multiplier: 5 }
    ];
    
    const upgrade = upgrades.find(u => u.id === upgradeId);
    
    if (!upgrade) {
      return res.status(404).json({ error: 'Улучшение не найдено' });
    }
    
    // Проверяем достаточно ли звезд
    if (user.gameState.stars < upgrade.cost) {
      return res.status(400).json({ error: 'Недостаточно звезд' });
    }
    
    // Покупаем улучшение
    user.gameState.stars -= upgrade.cost;
    user.gameState.upgrades.push(upgradeId);
    
    // Применяем эффект улучшения
    switch(upgrade.type) {
      case 'click':
        if (upgrade.value) {
          user.gameState.clickPower += upgrade.value;
        }
        if (upgrade.multiplier) {
          user.gameState.clickPower *= upgrade.multiplier;
        }
        break;
        
      case 'energy':
        user.gameState.maxEnergy += upgrade.value;
        break;
        
      case 'passive':
        user.gameState.passiveIncome += upgrade.value;
        break;
        
      case 'critical':
        // Добавляем шанс критического удара
        if (!user.gameState.criticalChance) {
          user.gameState.criticalChance = 0;
        }
        user.gameState.criticalChance += upgrade.chance;
        user.gameState.criticalMultiplier = upgrade.multiplier;
        break;
    }
    
    // Добавляем опыт
    user.gameState.experience += Math.floor(upgrade.cost / 10);
    
    // Проверяем уровень
    user.checkLevelUp();
    
    // Добавляем транзакцию
    user.transactions.push({
      type: 'upgrade',
      amount: -upgrade.cost,
      description: `Покупка улучшения #${upgradeId}`
    });
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Улучшение успешно куплено',
      upgradeId: upgradeId,
      newStars: user.gameState.stars,
      clickPower: user.gameState.clickPower,
      maxEnergy: user.gameState.maxEnergy,
      passiveIncome: user.gameState.passiveIncome
    });
    
  } catch (error) {
    console.error('Ошибка покупки улучшения:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение достижений
router.get('/achievements', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Все возможные достижения
    const allAchievements = [
      { id: 'first_click', name: 'Первый клик', description: 'Сделать первый клик', reward: 100, condition: (user) => user.gameState.totalClicks >= 1 },
      { id: 'clicks_100', name: 'Новичок', description: 'Сделать 100 кликов', reward: 500, condition: (user) => user.gameState.totalClicks >= 100 },
      { id: 'clicks_1000', name: 'Опытный', description: 'Сделать 1000 кликов', reward: 1000, condition: (user) => user.gameState.totalClicks >= 1000 },
      { id: 'clicks_10000', name: 'Мастер', description: 'Сделать 10000 кликов', reward: 5000, condition: (user) => user.gameState.totalClicks >= 10000 },
      { id: 'stars_1000', name: 'Тысячник', description: 'Заработать 1000 звезд', reward: 100, condition: (user) => user.gameState.stars >= 1000 },
      { id: 'stars_10000', name: 'Десятитысячник', description: 'Заработать 10000 звезд', reward: 1000, condition: (user) => user.gameState.stars >= 10000 },
      { id: 'stars_100000', name: 'Сотня', description: 'Заработать 100000 звезд', reward: 10000, condition: (user) => user.gameState.stars >= 100000 },
      { id: 'level_10', name: 'Десятый уровень', description: 'Достигнуть 10 уровня', reward: 1000, condition: (user) => user.gameState.userLevel >= 10 },
      { id: 'level_50', name: 'Полтинник', description: 'Достигнуть 50 уровня', reward: 5000, condition: (user) => user.gameState.userLevel >= 50 },
      { id: 'level_100', name: 'Сотый', description: 'Достигнуть 100 уровня', reward: 10000, condition: (user) => user.gameState.userLevel >= 100 },
      { id: 'first_upgrade', name: 'Первый апгрейд', description: 'Купить первое улучшение', reward: 500, condition: (user) => user.gameState.upgrades.length >= 1 },
      { id: 'upgrades_5', name: 'Коллекционер', description: 'Купить 5 улучшений', reward: 1000, condition: (user) => user.gameState.upgrades.length >= 5 },
      { id: 'upgrades_10', name: 'Инженер', description: 'Купить 10 улучшений', reward: 5000, condition: (user) => user.gameState.upgrades.length >= 10 },
      { id: 'first_ad', name: 'Первый просмотр', description: 'Посмотреть первую рекламу', reward: 500, condition: (user) => user.adStats.totalAdsWatched >= 1 },
      { id: 'ads_10', name: 'Рекламный агент', description: 'Посмотреть 10 реклам', reward: 1000, condition: (user) => user.adStats.totalAdsWatched >= 10 },
      { id: 'ads_100', name: 'Рекламный магнат', description: 'Посмотреть 100 реклам', reward: 10000, condition: (user) => user.adStats.totalAdsWatched >= 100 },
      { id: 'referral_1', name: 'Первый реферал', description: 'Пригласить первого друга', reward: 1000, condition: (user) => user.referrals.length >= 1 },
      { id: 'referral_5', name: 'Социальный', description: 'Пригласить 5 друзей', reward: 5000, condition: (user) => user.referrals.length >= 5 },
      { id: 'referral_10', name: 'Лидер', description: 'Пригласить 10 друзей', reward: 10000, condition: (user) => user.referrals.length >= 10 },
      { id: 'daily_7', name: 'Ежедневный игрок', description: 'Входить в игру 7 дней подряд', reward: 1000, condition: (user) => false } // Нужна логика для отслеживания ежедневных входов
    ];
    
    // Проверяем, какие достижения выполнены
    const achievements = allAchievements.map(achievement => {
      const unlocked = user.gameState.achievements?.some(a => a.achievementId === achievement.id) || false;
      const canUnlock = !unlocked && achievement.condition(user);
      
      return {
        ...achievement,
        unlocked: unlocked,
        canUnlock: canUnlock,
        progress: this.getAchievementProgress(user, achievement)
      };
    });
    
    // Проверяем новые достижения
    const newAchievements = achievements.filter(a => a.canUnlock);
    
    // Разблокируем новые достижения
    for (const achievement of newAchievements) {
      user.gameState.achievements.push({
        achievementId: achievement.id,
        name: achievement.name,
        description: achievement.description,
        unlockedAt: new Date(),
        reward: achievement.reward
      });
      
      if (achievement.reward) {
        user.gameState.stars += achievement.reward;
        user.transactions.push({
          type: 'achievement',
          amount: achievement.reward,
          description: `Награда за достижение: ${achievement.name}`
        });
      }
    }
    
    if (newAchievements.length > 0) {
      await user.save();
    }
    
    res.json({
      success: true,
      achievements: achievements,
      unlockedCount: achievements.filter(a => a.unlocked).length,
      totalCount: achievements.length,
      newAchievements: newAchievements.map(a => ({ id: a.id, name: a.name, reward: a.reward }))
    });
    
  } catch (error) {
    console.error('Ошибка получения достижений:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Вспомогательный метод для прогресса достижений
function getAchievementProgress(user, achievement) {
  switch(achievement.id) {
    case 'clicks_100':
    case 'clicks_1000':
    case 'clicks_10000':
      const target = parseInt(achievement.id.split('_')[1]);
      return {
        current: user.gameState.totalClicks,
        target: target,
        percentage: Math.min(100, (user.gameState.totalClicks / target) * 100)
      };
      
    case 'stars_1000':
    case 'stars_10000':
    case 'stars_100000':
      const starTarget = parseInt(achievement.id.split('_')[1]);
      return {
        current: user.gameState.stars,
        target: starTarget,
        percentage: Math.min(100, (user.gameState.stars / starTarget) * 100)
      };
      
    case 'level_10':
    case 'level_50':
    case 'level_100':
      const levelTarget = parseInt(achievement.id.split('_')[1]);
      return {
        current: user.gameState.userLevel,
        target: levelTarget,
        percentage: Math.min(100, (user.gameState.userLevel / levelTarget) * 100)
      };
      
    case 'first_upgrade':
    case 'upgrades_5':
    case 'upgrades_10':
      const upgradeTarget = achievement.id === 'first_upgrade' ? 1 : 
                           achievement.id === 'upgrades_5' ? 5 : 10;
      return {
        current: user.gameState.upgrades.length,
        target: upgradeTarget,
        percentage: Math.min(100, (user.gameState.upgrades.length / upgradeTarget) * 100)
      };
      
    case 'first_ad':
    case 'ads_10':
    case 'ads_100':
      const adTarget = achievement.id === 'first_ad' ? 1 :
                      achievement.id === 'ads_10' ? 10 : 100;
      return {
        current: user.adStats.totalAdsWatched,
        target: adTarget,
        percentage: Math.min(100, (user.adStats.totalAdsWatched / adTarget) * 100)
      };
      
    case 'referral_1':
    case 'referral_5':
    case 'referral_10':
      const referralTarget = achievement.id === 'referral_1' ? 1 :
                            achievement.id === 'referral_5' ? 5 : 10;
      return {
        current: user.referrals.length,
        target: referralTarget,
        percentage: Math.min(100, (user.referrals.length / referralTarget) * 100)
      };
      
    default:
      return { current: 0, target: 1, percentage: 0 };
  }
}

// Получение ежедневной награды
router.post('/daily-reward', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Проверяем, получал ли пользователь награду сегодня
    const today = new Date().toDateString();
    const lastDailyReward = user.gameState.lastDailyReward;
    
    if (lastDailyReward && new Date(lastDailyReward).toDateString() === today) {
      return res.status(400).json({ error: 'Ежедневная награда уже получена сегодня' });
    }
    
    // Рассчитываем награду
    let reward = 100; // Базовая награда
    
    // Увеличиваем награду в зависимости от уровня
    reward += user.gameState.userLevel * 10;
    
    // Увеличиваем за серию ежедневных входов
    const streak = await calculateDailyStreak(user);
    reward += streak * 50;
    
    // Награда не может быть меньше 100 и больше 5000
    reward = Math.max(100, Math.min(reward, 5000));
    
    // Выдаем награду
    user.gameState.stars += reward;
    user.gameState.lastDailyReward = new Date();
    
    // Добавляем транзакцию
    user.transactions.push({
      type: 'daily_reward',
      amount: reward,
      description: `Ежедневная награда (серия: ${streak} дней)`
    });
    
    await user.save();
    
    res.json({
      success: true,
      reward: reward,
      streak: streak,
      newStars: user.gameState.stars,
      nextRewardAvailable: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    
  } catch (error) {
    console.error('Ошибка получения ежедневной награды:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Вспомогательная функция для расчета серии ежедневных входов
async function calculateDailyStreak(user) {
  const today = new Date();
  let streak = 0;
  let currentDate = today;
  
  // Проверяем последние 30 дней
  for (let i = 0; i < 30; i++) {
    const dateStr = currentDate.toDateString();
    
    // Проверяем, был ли вход в этот день
    const hadDailyReward = user.gameState.dailyRewards?.some(reward => 
      new Date(reward.date).toDateString() === dateStr
    );
    
    if (hadDailyReward || (i === 0 && user.gameState.lastDailyReward)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  return streak;
}

// Получение статистики игрока
router.get('/player-stats/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Проверяем права доступа
    if (req.user.userId !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещен' });
    }
    
    const user = await User.findById(userId)
      .populate('referrals', 'telegramId username firstName lastName gameState.stars')
      .lean();
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Рассчитываем статистику
    const stats = {
      basic: {
        playTime: user.metrics?.playTime || 0,
        sessionsCount: user.metrics?.sessionsCount || 0,
        firstLogin: user.createdAt,
        lastLogin: user.metrics?.lastLogin || user.createdAt,
        daysSinceJoin: Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      },
      
      game: {
        totalClicks: user.gameState.totalClicks,
        clicksPerMinute: user.gameState.totalClicks / Math.max(1, (user.metrics?.playTime || 1) / (1000 * 60)),
        maxStars: Math.max(...(user.transactions?.filter(t => t.amount > 0).map(t => t.balanceAfter) || [0])),
        avgStarsPerDay: user.gameState.stars / Math.max(1, Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
      },
      
      progression: {
        upgradesCount: user.gameState.upgrades.length,
        achievementsCount: user.gameState.achievements.length,
        referralCount: user.referrals?.length || 0,
        levelProgress: (user.gameState.experience / (user.gameState.userLevel * 1000)) * 100
      },
      
      economy: {
        totalEarned: user.transactions?.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0) || 0,
        totalSpent: Math.abs(user.transactions?.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0) || 0),
        adsWatched: user.adStats?.totalAdsWatched || 0,
        earnedFromAds: user.adStats?.totalEarnedFromAds || 0
      }
    };
    
    res.json({
      success: true,
      stats: stats,
      user: {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        level: user.gameState.userLevel
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения статистики игрока:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;