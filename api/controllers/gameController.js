const User = require('../models/User');
const GameState = require('../models/GameState');

class GameController {
  // Обработка клика
  static async handleClick(req, res) {
    try {
      const userId = req.user.userId;
      
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      if (user.isBanned) {
        return res.status(403).json({ error: 'Аккаунт заблокирован' });
      }
      
      // Проверяем энергию
      if (user.gameState.energy <= 0) {
        return res.status(400).json({ 
          error: 'Недостаточно энергии',
          energy: user.gameState.energy,
          maxEnergy: user.gameState.maxEnergy
        });
      }
      
      // Рассчитываем значение клика
      let clickValue = user.gameState.clickPower;
      
      // Применяем активные бустеры
      const now = new Date();
      user.gameState.activeBoosters.forEach(booster => {
        if (booster.type === 'click' && booster.expiresAt > now) {
          clickValue = Math.floor(clickValue * booster.multiplier);
        }
      });
      
      // Проверяем критический удар
      let isCritical = false;
      if (user.gameState.criticalChance && Math.random() < user.gameState.criticalChance) {
        clickValue = Math.floor(clickValue * user.gameState.criticalMultiplier);
        isCritical = true;
      }
      
      // Обновляем состояние
      user.gameState.stars += clickValue;
      user.gameState.energy -= 1;
      user.gameState.totalClicks += 1;
      user.gameState.experience += Math.floor(clickValue / 10);
      user.gameState.lastActive = now;
      
      // Проверяем достижения
      const achievementCheck = this.checkClickAchievements(user);
      
      // Проверяем уровень
      const levelUpCheck = user.checkLevelUp();
      
      await user.save();
      
      // Формируем ответ
      const response = {
        success: true,
        click: {
          value: clickValue,
          isCritical: isCritical,
          criticalMultiplier: isCritical ? user.gameState.criticalMultiplier : null
        },
        state: {
          stars: user.gameState.stars,
          energy: user.gameState.energy,
          maxEnergy: user.gameState.maxEnergy,
          totalClicks: user.gameState.totalClicks,
          userLevel: user.gameState.userLevel,
          experience: user.gameState.experience,
          experienceNeeded: user.gameState.userLevel * 1000
        }
      };
      
      // Добавляем информацию о достижениях если есть
      if (achievementCheck.unlocked) {
        response.achievement = achievementCheck;
      }
      
      // Добавляем информацию о повышении уровня если есть
      if (levelUpCheck.leveledUp) {
        response.levelUp = levelUpCheck;
      }
      
      res.json(response);
      
    } catch (error) {
      console.error('Ошибка обработки клика:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Проверка достижений по кликам
  static checkClickAchievements(user) {
    const achievements = [
      { clicks: 100, reward: 500, name: 'Новичок', id: 'clicks_100' },
      { clicks: 500, reward: 1000, name: 'Опытный', id: 'clicks_500' },
      { clicks: 1000, reward: 5000, name: 'Мастер кликов', id: 'clicks_1000' },
      { clicks: 5000, reward: 25000, name: 'Легенда', id: 'clicks_5000' },
      { clicks: 10000, reward: 100000, name: 'Бог кликов', id: 'clicks_10000' }
    ];
    
    for (const achievement of achievements) {
      if (user.gameState.totalClicks === achievement.clicks) {
        // Проверяем, не получено ли уже достижение
        const alreadyUnlocked = user.gameState.achievements?.some(a => a.achievementId === achievement.id);
        
        if (!alreadyUnlocked) {
          // Добавляем достижение
          user.gameState.achievements.push({
            achievementId: achievement.id,
            name: achievement.name,
            unlockedAt: new Date(),
            reward: achievement.reward
          });
          
          // Добавляем награду
          user.gameState.stars += achievement.reward;
          
          return {
            unlocked: true,
            achievement: achievement.name,
            reward: achievement.reward,
            id: achievement.id
          };
        }
      }
    }
    
    return { unlocked: false };
  }
  
  // Сохранение состояния игры
  static async saveState(req, res) {
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
      
      // Валидируем и обновляем состояние
      const validatedState = this.validateGameState(gameState, user.gameState);
      
      user.gameState = {
        ...user.gameState,
        ...validatedState,
        lastActive: new Date(),
        lastSave: new Date()
      };
      
      await user.save();
      
      // Обновляем GameState модель если используется
      await GameState.findOneAndUpdate(
        { userId: userId },
        { $set: user.gameState },
        { upsert: true, new: true }
      );
      
      res.json({
        success: true,
        message: 'Игра сохранена',
        timestamp: new Date().toISOString(),
        state: {
          stars: user.gameState.stars,
          energy: user.gameState.energy,
          lastSave: user.gameState.lastSave
        }
      });
      
    } catch (error) {
      console.error('Ошибка сохранения состояния:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Валидация состояния игры
  static validateGameState(newState, currentState) {
    const validated = {};
    
    // Проверяем основные ресурсы
    if (typeof newState.stars === 'number') {
      validated.stars = Math.max(0, newState.stars);
    }
    
    if (typeof newState.energy === 'number') {
      validated.energy = Math.max(0, Math.min(newState.energy, currentState.maxEnergy));
    }
    
    if (typeof newState.maxEnergy === 'number') {
      validated.maxEnergy = Math.max(10, newState.maxEnergy);
    }
    
    // Проверяем характеристики
    if (typeof newState.clickPower === 'number') {
      validated.clickPower = Math.max(1, newState.clickPower);
    }
    
    if (typeof newState.passiveIncome === 'number') {
      validated.passiveIncome = Math.max(0, newState.passiveIncome);
    }
    
    // Проверяем прогресс
    if (typeof newState.totalClicks === 'number') {
      validated.totalClicks = Math.max(currentState.totalClicks, newState.totalClicks);
    }
    
    if (typeof newState.userLevel === 'number') {
      validated.userLevel = Math.max(1, newState.userLevel);
    }
    
    if (typeof newState.experience === 'number') {
      validated.experience = Math.max(0, newState.experience);
    }
    
    // Проверяем массивы
    if (Array.isArray(newState.upgrades)) {
      validated.upgrades = newState.upgrades.filter(id => 
        typeof id === 'number' && !currentState.upgrades.includes(id)
      ).concat(currentState.upgrades);
    }
    
    if (Array.isArray(newState.achievements)) {
      validated.achievements = newState.achievements.filter(ach => 
        ach && typeof ach === 'object' && ach.achievementId
      );
    }
    
    // Проверяем инвентарь
    if (newState.inventory && typeof newState.inventory === 'object') {
      validated.inventory = new Map();
      Object.entries(newState.inventory).forEach(([key, value]) => {
        if (typeof value === 'object' && typeof value.count === 'number') {
          validated.inventory.set(key, {
            count: Math.max(0, value.count),
            equipped: !!value.equipped,
            lastUsed: value.lastUsed
          });
        }
      });
    }
    
    // Проверяем бустеры
    if (Array.isArray(newState.activeBoosters)) {
      validated.activeBoosters = newState.activeBoosters.filter(booster => 
        booster && 
        typeof booster === 'object' &&
        booster.boosterId &&
        booster.expiresAt &&
        new Date(booster.expiresAt) > new Date()
      );
    }
    
    return validated;
  }
  
  // Загрузка состояния игры
  static async loadState(req, res) {
    try {
      const userId = req.user.userId;
      
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      // Восстанавливаем оффлайн доход
      const offlineIncome = user.restoreOfflineIncome();
      
      // Удаляем просроченные бустеры
      user.gameState.activeBoosters = user.gameState.activeBoosters.filter(
        booster => booster.expiresAt > new Date()
      );
      
      await user.save();
      
      // Формируем ответ
      const response = {
        success: true,
        gameState: {
          stars: user.gameState.stars,
          energy: user.gameState.energy,
          maxEnergy: user.gameState.maxEnergy,
          clickPower: user.gameState.clickPower,
          passiveIncome: user.gameState.passiveIncome,
          totalClicks: user.gameState.totalClicks,
          userLevel: user.gameState.userLevel,
          experience: user.gameState.experience,
          upgrades: user.gameState.upgrades,
          achievements: user.gameState.achievements,
          inventory: Object.fromEntries(user.gameState.inventory || new Map()),
          activeBoosters: user.gameState.activeBoosters,
          criticalChance: user.gameState.criticalChance,
          criticalMultiplier: user.gameState.criticalMultiplier,
          lastActive: user.gameState.lastActive,
          lastSave: user.gameState.lastSave
        },
        settings: user.settings,
        offlineIncome: offlineIncome,
        timestamp: new Date().toISOString()
      };
      
      res.json(response);
      
    } catch (error) {
      console.error('Ошибка загрузки состояния:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Получение таблицы лидеров
  static async getLeaderboard(req, res) {
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
      
      // Получаем лидеров
      const leaders = await User.find({ 
        isBanned: { $ne: true },
        [sortField]: { $exists: true }
      })
      .sort({ [sortField]: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('telegramId username firstName lastName gameState.stars gameState.userLevel gameState.totalClicks createdAt')
      .lean();
      
      // Форматируем данные
      const leaderboard = leaders.map((user, index) => ({
        rank: skip + index + 1,
        telegramId: user.telegramId,
        username: user.username,
        name: `${user.firstName} ${user.lastName}`.trim(),
        stars: user.gameState.stars,
        level: user.gameState.userLevel,
        clicks: user.gameState.totalClicks,
        joined: user.createdAt
      }));
      
      // Получаем общее количество игроков
      const totalPlayers = await User.countDocuments({ 
        isBanned: { $ne: true },
        'gameState.stars': { $gt: 0 }
      });
      
      // Получаем позицию текущего пользователя если он авторизован
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
            [sortField]: { $gt: currentUser.gameState[sortField.replace('gameState.', '')] },
            isBanned: { $ne: true }
          });
          
          userPosition = position + 1;
        }
      }
      
      res.json({
        success: true,
        leaderboard: leaderboard,
        type: type,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPlayers: totalPlayers,
        totalPages: Math.ceil(totalPlayers / parseInt(limit)),
        userPosition: userPosition,
        userStats: userStats,
        updatedAt: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Ошибка получения таблицы лидеров:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Получение глобальной статистики
  static async getGlobalStats(req, res) {
    try {
      const [userStats, dailyStats, recentActivity] = await Promise.all([
        // Основная статистика
        User.aggregate([
          { $match: { isBanned: { $ne: true } } },
          { $group: {
            _id: null,
            totalPlayers: { $sum: 1 },
            activeToday: {
              $sum: {
                $cond: [{
                  $gte: ['$gameState.lastActive', new Date(Date.now() - 24 * 60 * 60 * 1000)]
                }, 1, 0]
              }
            },
            activeWeek: {
              $sum: {
                $cond: [{
                  $gte: ['$gameState.lastActive', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]
                }, 1, 0]
              }
            },
            avgStars: { $avg: '$gameState.stars' },
            avgLevel: { $avg: '$gameState.userLevel' },
            totalStars: { $sum: '$gameState.stars' },
            totalClicks: { $sum: '$gameState.totalClicks' },
            maxStars: { $max: '$gameState.stars' },
            maxLevel: { $max: '$gameState.userLevel' }
          }}
        ]),
        
        // Статистика по дням
        User.aggregate([
          { $match: { 
            isBanned: { $ne: true },
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          }},
          { $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            newPlayers: { $sum: 1 },
            avgStars: { $avg: '$gameState.stars' }
          }},
          { $sort: { '_id': 1 } },
          { $limit: 30 }
        ]),
        
        // Недавняя активность
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
        totalPlayers: 0,
        activeToday: 0,
        activeWeek: 0,
        avgStars: 0,
        avgLevel: 0,
        totalStars: 0,
        totalClicks: 0,
        maxStars: 0,
        maxLevel: 0
      };
      
      // Форматируем ежедневную статистику
      const dailyGrowth = dailyStats.map(day => ({
        date: day._id,
        newPlayers: day.newPlayers,
        avgStars: Math.round(day.avgStars || 0)
      }));
      
      // Форматируем недавнюю активность
      const recentPlayers = recentActivity.map(player => ({
        telegramId: player.telegramId,
        username: player.username,
        name: `${player.firstName} ${player.lastName}`.trim(),
        stars: player.gameState.stars,
        level: player.gameState.userLevel,
        lastActive: player.gameState.lastActive
      }));
      
      // Рассчитываем дополнительные метрики
      const metrics = {
        engagementRate: stats.totalPlayers > 0 ? (stats.activeToday / stats.totalPlayers) * 100 : 0,
        avgClicksPerPlayer: stats.totalPlayers > 0 ? stats.totalClicks / stats.totalPlayers : 0,
        starsPerClick: stats.totalClicks > 0 ? stats.totalStars / stats.totalClicks : 0,
        growthRate: dailyGrowth.length > 1 
          ? ((dailyGrowth[dailyGrowth.length - 1].newPlayers - dailyGrowth[0].newPlayers) / dailyGrowth[0].newPlayers) * 100 
          : 0
      };
      
      res.json({
        success: true,
        stats: {
          players: {
            total: stats.totalPlayers,
            activeToday: stats.activeToday,
            activeWeek: stats.activeWeek,
            newToday: dailyGrowth.length > 0 ? dailyGrowth[dailyGrowth.length - 1].newPlayers : 0
          },
          
          economy: {
            totalStars: stats.totalStars,
            avgStars: Math.round(stats.avgStars),
            maxStars: stats.maxStars,
            starsPerSecond: stats.totalStars > 0 ? stats.totalStars / (30 * 24 * 60 * 60) : 0 // Предполагаем 30 дней
          },
          
          progression: {
            totalClicks: stats.totalClicks,
            avgClicks: Math.round(stats.totalClicks / Math.max(1, stats.totalPlayers)),
            avgLevel: Math.round(stats.avgLevel),
            maxLevel: stats.maxLevel
          },
          
          metrics: metrics,
          dailyGrowth: dailyGrowth,
          recentPlayers: recentPlayers
        },
        updatedAt: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Ошибка получения глобальной статистики:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Получение улучшений
  static async getUpgrades(req, res) {
    try {
      const userId = req.user.userId;
      
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      // Все возможные улучшения
      const allUpgrades = [
        { 
          id: 1, 
          name: 'Базовый клик', 
          description: '+1 к силе клика', 
          cost: 100, 
          type: 'click', 
          value: 1,
          icon: '👆',
          rarity: 'common'
        },
        { 
          id: 2, 
          name: 'Двойной клик', 
          description: '×2 сила клика', 
          cost: 500, 
          type: 'click', 
          multiplier: 2,
          icon: '👆👆',
          rarity: 'uncommon'
        },
        { 
          id: 3, 
          name: 'Тройной клик', 
          description: '×3 сила клика', 
          cost: 2000, 
          type: 'click', 
          multiplier: 3,
          icon: '👆👆👆',
          rarity: 'rare'
        },
        { 
          id: 4, 
          name: 'Энергия I', 
          description: '+20 к максимальной энергии', 
          cost: 300, 
          type: 'energy', 
          value: 20,
          icon: '⚡',
          rarity: 'common'
        },
        { 
          id: 5, 
          name: 'Энергия II', 
          description: '+50 к максимальной энергии', 
          cost: 1000, 
          type: 'energy', 
          value: 50,
          icon: '⚡⚡',
          rarity: 'uncommon'
        },
        { 
          id: 6, 
          name: 'Энергия III', 
          description: '+100 к максимальной энергии', 
          cost: 5000, 
          type: 'energy', 
          value: 100,
          icon: '⚡⚡⚡',
          rarity: 'rare'
        },
        { 
          id: 7, 
          name: 'Пассивный доход I', 
          description: '+5 к пассивному доходу', 
          cost: 1000, 
          type: 'passive', 
          value: 5,
          icon: '💎',
          rarity: 'uncommon'
        },
        { 
          id: 8, 
          name: 'Пассивный доход II', 
          description: '+15 к пассивному доходу', 
          cost: 5000, 
          type: 'passive', 
          value: 15,
          icon: '💎💎',
          rarity: 'rare'
        },
        { 
          id: 9, 
          name: 'Пассивный доход III', 
          description: '+30 к пассивному доходу', 
          cost: 20000, 
          type: 'passive', 
          value: 30,
          icon: '💎💎💎',
          rarity: 'epic'
        },
        { 
          id: 10, 
          name: 'Критический удар', 
          description: '10% шанс ×5 критического удара', 
          cost: 10000, 
          type: 'critical', 
          chance: 0.1, 
          multiplier: 5,
          icon: '🎯',
          rarity: 'epic'
        },
        { 
          id: 11, 
          name: 'Супер заряд', 
          description: '+200 к максимальной энергии', 
          cost: 15000, 
          type: 'energy', 
          value: 200,
          icon: '⚡⚡⚡⚡',
          rarity: 'epic'
        },
        { 
          id: 12, 
          name: 'Звездный генератор', 
          description: '+50 к пассивному доходу', 
          cost: 50000, 
          type: 'passive', 
          value: 50,
          icon: '⭐',
          rarity: 'legendary'
        },
        { 
          id: 13, 
          name: 'Галактический клик', 
          description: '×10 сила клика', 
          cost: 100000, 
          type: 'click', 
          multiplier: 10,
          icon: '🚀',
          rarity: 'legendary'
        },
        { 
          id: 14, 
          name: 'Квантовый ускоритель', 
          description: '20% шанс ×10 критического удара', 
          cost: 200000, 
          type: 'critical', 
          chance: 0.2, 
          multiplier: 10,
          icon: '⚛️',
          rarity: 'mythical'
        }
      ];
      
      // Отмечаем купленные улучшения и доступность
      const upgrades = allUpgrades.map(upgrade => {
        const purchased = user.gameState.upgrades.includes(upgrade.id);
        const canAfford = user.gameState.stars >= upgrade.cost;
        
        return {
          ...upgrade,
          purchased: purchased,
          canAfford: canAfford,
          available: !purchased,
          nextLevel: purchased ? 2 : 1, // Для будущей системы уровней улучшений
          currentEffect: this.getUpgradeEffect(upgrade, purchased ? 1 : 0),
          nextEffect: this.getUpgradeEffect(upgrade, purchased ? 2 : 1)
        };
      });
      
      // Группируем по категориям
      const categories = {
        click: upgrades.filter(u => u.type === 'click'),
        energy: upgrades.filter(u => u.type === 'energy'),
        passive: upgrades.filter(u => u.type === 'passive'),
        critical: upgrades.filter(u => u.type === 'critical'),
        all: upgrades
      };
      
      res.json({
        success: true,
        upgrades: upgrades,
        categories: categories,
        userStars: user.gameState.stars,
        purchasedCount: user.gameState.upgrades.length,
        totalCount: allUpgrades.length,
        nextUpgrade: upgrades.find(u => !u.purchased && u.canAfford)
      });
      
    } catch (error) {
      console.error('Ошибка получения улучшений:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Вспомогательный метод для получения эффекта улучшения
  static getUpgradeEffect(upgrade, level) {
    switch(upgrade.type) {
      case 'click':
        if (upgrade.value) {
          return `+${upgrade.value * level} к силе клика`;
        }
        if (upgrade.multiplier) {
          return `×${upgrade.multiplier * level} сила клика`;
        }
        break;
        
      case 'energy':
        return `+${upgrade.value * level} к максимальной энергии`;
        
      case 'passive':
        return `+${upgrade.value * level} к пассивному доходу`;
        
      case 'critical':
        return `${(upgrade.chance * level * 100).toFixed(0)}% шанс ×${upgrade.multiplier * level} критического удара`;
    }
    
    return 'Улучшение характеристик';
  }
  
  // Покупка улучшения
  static async purchaseUpgrade(req, res) {
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
        return res.status(400).json({ 
          error: 'Улучшение уже куплено',
          upgradeId: upgradeId
        });
      }
      
      // Получаем информацию об улучшении
      const upgradeInfo = this.getUpgradeInfo(upgradeId);
      
      if (!upgradeInfo) {
        return res.status(404).json({ error: 'Улучшение не найдено' });
      }
      
      // Проверяем достаточно ли звезд
      if (user.gameState.stars < upgradeInfo.cost) {
        return res.status(400).json({ 
          error: 'Недостаточно звезд',
          required: upgradeInfo.cost,
          current: user.gameState.stars
        });
      }
      
      // Проверяем требования для улучшения
      const requirements = this.checkUpgradeRequirements(upgradeId, user.gameState.upgrades);
      if (!requirements.met) {
        return res.status(400).json({ 
          error: 'Требования не выполнены',
          requirements: requirements.required,
          current: requirements.current
        });
      }
      
      // Покупаем улучшение
      user.gameState.stars -= upgradeInfo.cost;
      user.gameState.upgrades.push(upgradeId);
      
      // Применяем эффект улучшения
      this.applyUpgradeEffect(user, upgradeInfo);
      
      // Добавляем опыт
      user.gameState.experience += Math.floor(upgradeInfo.cost / 10);
      
      // Проверяем уровень
      user.checkLevelUp();
      
      // Добавляем транзакцию
      user.transactions.push({
        type: 'upgrade',
        amount: -upgradeInfo.cost,
        description: `Покупка улучшения: ${upgradeInfo.name}`
      });
      
      await user.save();
      
      // Формируем ответ
      const response = {
        success: true,
        message: 'Улучшение успешно куплено',
        upgrade: {
          id: upgradeId,
          name: upgradeInfo.name,
          cost: upgradeInfo.cost
        },
        state: {
          stars: user.gameState.stars,
          clickPower: user.gameState.clickPower,
          maxEnergy: user.gameState.maxEnergy,
          passiveIncome: user.gameState.passiveIncome,
          criticalChance: user.gameState.criticalChance,
          criticalMultiplier: user.gameState.criticalMultiplier,
          upgrades: user.gameState.upgrades
        }
      };
      
      // Проверяем достижения по улучшениям
      const upgradeAchievement = this.checkUpgradeAchievements(user);
      if (upgradeAchievement.unlocked) {
        response.achievement = upgradeAchievement;
      }
      
      res.json(response);
      
    } catch (error) {
      console.error('Ошибка покупки улучшения:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Вспомогательный метод для получения информации об улучшении
  static getUpgradeInfo(upgradeId) {
    const upgrades = {
      1: { id: 1, name: 'Базовый клик', cost: 100, type: 'click', value: 1 },
      2: { id: 2, name: 'Двойной клик', cost: 500, type: 'click', multiplier: 2 },
      3: { id: 3, name: 'Тройной клик', cost: 2000, type: 'click', multiplier: 3 },
      4: { id: 4, name: 'Энергия I', cost: 300, type: 'energy', value: 20 },
      5: { id: 5, name: 'Энергия II', cost: 1000, type: 'energy', value: 50 },
      6: { id: 6, name: 'Энергия III', cost: 5000, type: 'energy', value: 100 },
      7: { id: 7, name: 'Пассивный доход I', cost: 1000, type: 'passive', value: 5 },
      8: { id: 8, name: 'Пассивный доход II', cost: 5000, type: 'passive', value: 15 },
      9: { id: 9, name: 'Пассивный доход III', cost: 20000, type: 'passive', value: 30 },
      10: { id: 10, name: 'Критический удар', cost: 10000, type: 'critical', chance: 0.1, multiplier: 5 },
      11: { id: 11, name: 'Супер заряд', cost: 15000, type: 'energy', value: 200 },
      12: { id: 12, name: 'Звездный генератор', cost: 50000, type: 'passive', value: 50 },
      13: { id: 13, name: 'Галактический клик', cost: 100000, type: 'click', multiplier: 10 },
      14: { id: 14, name: 'Квантовый ускоритель', cost: 200000, type: 'critical', chance: 0.2, multiplier: 10 }
    };
    
    return upgrades[upgradeId];
  }
  
  // Проверка требований для улучшения
  static checkUpgradeRequirements(upgradeId, purchasedUpgrades) {
    const requirements = {
      2: [1], // Для двойного клика нужен базовый клик
      3: [2], // Для тройного клика нужен двойной клик
      5: [4], // Для энергии II нужна энергия I
      6: [5], // Для энергии III нужна энергия II
      8: [7], // Для пассивного дохода II нужен пассивный доход I
      9: [8], // Для пассивного дохода III нужен пассивный доход II
      10: [3], // Для критического удара нужен тройной клик
      11: [6], // Для супер заряда нужна энергия III
      12: [9], // Для звездного генератора нужен пассивный доход III
      13: [3, 10], // Для галактического клика нужны тройной клик и критический удар
      14: [13] // Для квантового ускорителя нужен галактический клик
    };
    
    if (!requirements[upgradeId]) {
      return { met: true, required: [], current: purchasedUpgrades };
    }
    
    const required = requirements[upgradeId];
    const missing = required.filter(req => !purchasedUpgrades.includes(req));
    
    return {
      met: missing.length === 0,
      required: required,
      current: purchasedUpgrades,
      missing: missing
    };
  }
  
  // Применение эффекта улучшения
  static applyUpgradeEffect(user, upgrade) {
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
        if (!user.gameState.criticalChance) {
          user.gameState.criticalChance = 0;
        }
        user.gameState.criticalChance += upgrade.chance;
        user.gameState.criticalMultiplier = upgrade.multiplier;
        break;
    }
  }
  
  // Проверка достижений по улучшениям
  static checkUpgradeAchievements(user) {
    const upgradeCount = user.gameState.upgrades.length;
    const achievements = [
      { count: 1, reward: 500, name: 'Первый апгрейд', id: 'first_upgrade' },
      { count: 5, reward: 1000, name: 'Коллекционер', id: 'upgrades_5' },
      { count: 10, reward: 5000, name: 'Инженер', id: 'upgrades_10' },
      { count: 14, reward: 10000, name: 'Совершенство', id: 'upgrades_all' }
    ];
    
    for (const achievement of achievements) {
      if (upgradeCount === achievement.count) {
        // Проверяем, не получено ли уже достижение
        const alreadyUnlocked = user.gameState.achievements?.some(a => a.achievementId === achievement.id);
        
        if (!alreadyUnlocked) {
          // Добавляем достижение
          user.gameState.achievements.push({
            achievementId: achievement.id,
            name: achievement.name,
            unlockedAt: new Date(),
            reward: achievement.reward
          });
          
          // Добавляем награду
          user.gameState.stars += achievement.reward;
          
          return {
            unlocked: true,
            achievement: achievement.name,
            reward: achievement.reward,
            id: achievement.id
          };
        }
      }
    }
    
    return { unlocked: false };
  }
  
  // Получение достижений
  static async getAchievements(req, res) {
    try {
      const userId = req.user.userId;
      
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      // Все возможные достижения
      const allAchievements = [
        // Клики
        { 
          id: 'first_click', 
          name: 'Первый клик', 
          description: 'Сделать первый клик', 
          reward: 100, 
          type: 'clicks',
          condition: (user) => user.gameState.totalClicks >= 1,
          icon: '👆',
          rarity: 'common'
        },
        { 
          id: 'clicks_100', 
          name: 'Новичок', 
          description: 'Сделать 100 кликов', 
          reward: 500, 
          type: 'clicks',
          condition: (user) => user.gameState.totalClicks >= 100,
          icon: '👆👆',
          rarity: 'uncommon'
        },
        { 
          id: 'clicks_1000', 
          name: 'Опытный', 
          description: 'Сделать 1000 кликов', 
          reward: 1000, 
          type: 'clicks',
          condition: (user) => user.gameState.totalClicks >= 1000,
          icon: '👆👆👆',
          rarity: 'rare'
        },
        { 
          id: 'clicks_10000', 
          name: 'Мастер', 
          description: 'Сделать 10000 кликов', 
          reward: 5000, 
          type: 'clicks',
          condition: (user) => user.gameState.totalClicks >= 10000,
          icon: '👑',
          rarity: 'epic'
        },
        { 
          id: 'clicks_100000', 
          name: 'Легенда', 
          description: 'Сделать 100000 кликов', 
          reward: 25000, 
          type: 'clicks',
          condition: (user) => user.gameState.totalClicks >= 100000,
          icon: '👑👑',
          rarity: 'legendary'
        },
        
        // Звезды
        { 
          id: 'stars_1000', 
          name: 'Тысячник', 
          description: 'Заработать 1000 звезд', 
          reward: 100, 
          type: 'stars',
          condition: (user) => user.gameState.stars >= 1000,
          icon: '⭐',
          rarity: 'common'
        },
        { 
          id: 'stars_10000', 
          name: 'Десятитысячник', 
          description: 'Заработать 10000 звезд', 
          reward: 1000, 
          type: 'stars',
          condition: (user) => user.gameState.stars >= 10000,
          icon: '⭐⭐',
          rarity: 'uncommon'
        },
        { 
          id: 'stars_100000', 
          name: 'Сотня', 
          description: 'Заработать 100000 звезд', 
          reward: 10000, 
          type: 'stars',
          condition: (user) => user.gameState.stars >= 100000,
          icon: '⭐⭐⭐',
          rarity: 'rare'
        },
        { 
          id: 'stars_1000000', 
          name: 'Миллионер', 
          description: 'Заработать 1000000 звезд', 
          reward: 50000, 
          type: 'stars',
          condition: (user) => user.gameState.stars >= 1000000,
          icon: '💰',
          rarity: 'epic'
        },
        
        // Уровни
        { 
          id: 'level_10', 
          name: 'Десятый уровень', 
          description: 'Достигнуть 10 уровня', 
          reward: 1000, 
          type: 'levels',
          condition: (user) => user.gameState.userLevel >= 10,
          icon: '🎖️',
          rarity: 'uncommon'
        },
        { 
          id: 'level_50', 
          name: 'Полтинник', 
          description: 'Достигнуть 50 уровня', 
          reward: 5000, 
          type: 'levels',
          condition: (user) => user.gameState.userLevel >= 50,
          icon: '🎖️🎖️',
          rarity: 'rare'
        },
        { 
          id: 'level_100', 
          name: 'Сотый', 
          description: 'Достигнуть 100 уровня', 
          reward: 10000, 
          type: 'levels',
          condition: (user) => user.gameState.userLevel >= 100,
          icon: '🎖️🎖️🎖️',
          rarity: 'epic'
        },
        
        // Улучшения
        { 
          id: 'first_upgrade', 
          name: 'Первый апгрейд', 
          description: 'Купить первое улучшение', 
          reward: 500, 
          type: 'upgrades',
          condition: (user) => user.gameState.upgrades.length >= 1,
          icon: '🛠️',
          rarity: 'common'
        },
        { 
          id: 'upgrades_5', 
          name: 'Коллекционер', 
          description: 'Купить 5 улучшений', 
          reward: 1000, 
          type: 'upgrades',
          condition: (user) => user.gameState.upgrades.length >= 5,
          icon: '🛠️🛠️',
          rarity: 'uncommon'
        },
        { 
          id: 'upgrades_10', 
          name: 'Инженер', 
          description: 'Купить 10 улучшений', 
          reward: 5000, 
          type: 'upgrades',
          condition: (user) => user.gameState.upgrades.length >= 10,
          icon: '🛠️🛠️🛠️',
          rarity: 'rare'
        },
        
        // Реклама
        { 
          id: 'first_ad', 
          name: 'Первый просмотр', 
          description: 'Посмотреть первую рекламу', 
          reward: 500, 
          type: 'ads',
          condition: (user) => user.adStats.totalAdsWatched >= 1,
          icon: '📺',
          rarity: 'common'
        },
        { 
          id: 'ads_10', 
          name: 'Рекламный агент', 
          description: 'Посмотреть 10 реклам', 
          reward: 1000, 
          type: 'ads',
          condition: (user) => user.adStats.totalAdsWatched >= 10,
          icon: '📺📺',
          rarity: 'uncommon'
        },
        { 
          id: 'ads_100', 
          name: 'Рекламный магнат', 
          description: 'Посмотреть 100 реклам', 
          reward: 10000, 
          type: 'ads',
          condition: (user) => user.adStats.totalAdsWatched >= 100,
          icon: '📺📺📺',
          rarity: 'epic'
        },
        
        // Рефералы
        { 
          id: 'referral_1', 
          name: 'Первый друг', 
          description: 'Пригласить первого друга', 
          reward: 1000, 
          type: 'social',
          condition: (user) => user.referrals.length >= 1,
          icon: '👥',
          rarity: 'uncommon'
        },
        { 
          id: 'referral_5', 
          name: 'Социальный', 
          description: 'Пригласить 5 друзей', 
          reward: 5000, 
          type: 'social',
          condition: (user) => user.referrals.length >= 5,
          icon: '👥👥',
          rarity: 'rare'
        },
        { 
          id: 'referral_10', 
          name: 'Лидер', 
          description: 'Пригласить 10 друзей', 
          reward: 10000, 
          type: 'social',
          condition: (user) => user.referrals.length >= 10,
          icon: '👥👥👥',
          rarity: 'epic'
        }
      ];
      
      // Проверяем прогресс и разблокированные достижения
      const achievements = allAchievements.map(achievement => {
        const unlocked = user.gameState.achievements?.some(a => a.achievementId === achievement.id) || false;
        const progress = this.calculateAchievementProgress(user, achievement);
        const canUnlock = !unlocked && achievement.condition(user);
        
        return {
          ...achievement,
          unlocked: unlocked,
          progress: progress,
          canUnlock: canUnlock,
          progressPercentage: Math.min(100, (progress.current / progress.target) * 100)
        };
      });
      
      // Проверяем и разблокируем новые достижения
      const newAchievements = achievements.filter(a => a.canUnlock);
      
      if (newAchievements.length > 0) {
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
        
        await user.save();
      }
      
      // Группируем по типам
      const groupedAchievements = {
        clicks: achievements.filter(a => a.type === 'clicks'),
        stars: achievements.filter(a => a.type === 'stars'),
        levels: achievements.filter(a => a.type === 'levels'),
        upgrades: achievements.filter(a => a.type === 'upgrades'),
        ads: achievements.filter(a => a.type === 'ads'),
        social: achievements.filter(a => a.type === 'social'),
        all: achievements
      };
      
      // Статистика достижений
      const stats = {
        unlocked: achievements.filter(a => a.unlocked).length,
        total: achievements.length,
        completion: (achievements.filter(a => a.unlocked).length / achievements.length) * 100,
        totalReward: achievements.filter(a => a.unlocked).reduce((sum, a) => sum + a.reward, 0),
        byType: {
          clicks: groupedAchievements.clicks.filter(a => a.unlocked).length,
          stars: groupedAchievements.stars.filter(a => a.unlocked).length,
          levels: groupedAchievements.levels.filter(a => a.unlocked).length,
          upgrades: groupedAchievements.upgrades.filter(a => a.unlocked).length,
          ads: groupedAchievements.ads.filter(a => a.unlocked).length,
          social: groupedAchievements.social.filter(a => a.unlocked).length
        }
      };
      
      res.json({
        success: true,
        achievements: achievements,
        grouped: groupedAchievements,
        stats: stats,
        newAchievements: newAchievements.map(a => ({
          id: a.id,
          name: a.name,
          reward: a.reward
        })),
        nextAchievements: achievements
          .filter(a => !a.unlocked && a.progressPercentage > 0)
          .sort((a, b) => b.progressPercentage - a.progressPercentage)
          .slice(0, 5)
      });
      
    } catch (error) {
      console.error('Ошибка получения достижений:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Вспомогательный метод для расчета прогресса достижения
  static calculateAchievementProgress(user, achievement) {
    switch(achievement.id) {
      case 'first_click':
      case 'clicks_100':
      case 'clicks_1000':
      case 'clicks_10000':
      case 'clicks_100000':
        const target = parseInt(achievement.id.split('_')[1]);
        return {
          current: user.gameState.totalClicks,
          target: target,
          unit: 'кликов'
        };
        
      case 'stars_1000':
      case 'stars_10000':
      case 'stars_100000':
      case 'stars_1000000':
        const starTarget = parseInt(achievement.id.split('_')[1]);
        return {
          current: user.gameState.stars,
          target: starTarget,
          unit: 'звезд'
        };
        
      case 'level_10':
      case 'level_50':
      case 'level_100':
        const levelTarget = parseInt(achievement.id.split('_')[1]);
        return {
          current: user.gameState.userLevel,
          target: levelTarget,
          unit: 'уровень'
        };
        
      case 'first_upgrade':
      case 'upgrades_5':
      case 'upgrades_10':
        const upgradeTarget = achievement.id === 'first_upgrade' ? 1 : 
                             achievement.id === 'upgrades_5' ? 5 : 10;
        return {
          current: user.gameState.upgrades.length,
          target: upgradeTarget,
          unit: 'улучшений'
        };
        
      case 'first_ad':
      case 'ads_10':
      case 'ads_100':
        const adTarget = achievement.id === 'first_ad' ? 1 :
                        achievement.id === 'ads_10' ? 10 : 100;
        return {
          current: user.adStats?.totalAdsWatched || 0,
          target: adTarget,
          unit: 'реклам'
        };
        
      case 'referral_1':
      case 'referral_5':
      case 'referral_10':
        const referralTarget = achievement.id === 'referral_1' ? 1 :
                              achievement.id === 'referral_5' ? 5 : 10;
        return {
          current: user.referrals?.length || 0,
          target: referralTarget,
          unit: 'рефералов'
        };
        
      default:
        return { current: 0, target: 1, unit: '' };
    }
  }
  
  // Получение ежедневной награды
  static async getDailyReward(req, res) {
    try {
      const userId = req.user.userId;
      
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      // Проверяем, получал ли пользователь награду сегодня
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const lastReward = user.gameState.lastDailyReward;
      const gotRewardToday = lastReward && new Date(lastReward) >= today;
      
      if (gotRewardToday) {
        return res.status(400).json({ 
          error: 'Ежедневная награда уже получена сегодня',
          nextReward: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()
        });
      }
      
      // Рассчитываем серию
      const streak = await this.calculateDailyStreak(user);
      
      // Рассчитываем награду
      let reward = 100; // Базовая награда
      reward += user.gameState.userLevel * 10; // Бонус за уровень
      reward += streak * 50; // Бонус за серию
      reward = Math.min(reward, 5000); // Максимум 5000
      
      // Выдаем награду
      user.gameState.stars += reward;
      user.gameState.lastDailyReward = new Date();
      
      // Обновляем серию
      if (!user.gameState.dailyRewards) {
        user.gameState.dailyRewards = [];
      }
      
      user.gameState.dailyRewards.push({
        date: new Date(),
        reward: reward,
        streak: streak
      });
      
      // Ограничиваем историю 30 днями
      if (user.gameState.dailyRewards.length > 30) {
        user.gameState.dailyRewards = user.gameState.dailyRewards.slice(-30);
      }
      
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
        nextReward: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        history: user.gameState.dailyRewards.slice(-7) // Последние 7 дней
      });
      
    } catch (error) {
      console.error('Ошибка получения ежедневной награды:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Расчет серии ежедневных входов
  static async calculateDailyStreak(user) {
    if (!user.gameState.dailyRewards || user.gameState.dailyRewards.length === 0) {
      return 1;
    }
    
    const rewards = [...user.gameState.dailyRewards].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    
    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < rewards.length; i++) {
      const rewardDate = new Date(rewards[i].date);
      rewardDate.setHours(0, 0, 0, 0);
      
      const diffDays = Math.floor((currentDate - rewardDate) / (1000 * 60 * 60 * 24));
      
      if (diffDays === i) {
        streak++;
      } else {
        break;
      }
    }
    
    return Math.max(1, streak);
  }
}

module.exports = GameController;