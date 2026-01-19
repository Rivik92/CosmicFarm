const User = require('../models/User');
const Transaction = require('../models/Transaction');

class UserController {
  // Получение профиля пользователя
  static async getProfile(req, res) {
    try {
      const userId = req.user.userId;
      
      const user = await User.findById(userId)
        .select('-sessions -__v -transactions')
        .lean();
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      // Форматируем данные для ответа
      const profile = {
        id: user._id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        languageCode: user.languageCode,
        gameState: user.gameState,
        settings: user.settings,
        referralCode: user.referralCode,
        role: user.role,
        isBanned: user.isBanned,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        metrics: user.metrics
      };
      
      res.json({
        success: true,
        profile: profile
      });
      
    } catch (error) {
      console.error('Ошибка получения профиля:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Обновление профиля
  static async updateProfile(req, res) {
    try {
      const userId = req.user.userId;
      const updates = req.body;
      
      // Поля, которые можно обновлять
      const allowedUpdates = ['username', 'firstName', 'lastName', 'languageCode', 'settings'];
      const filteredUpdates = {};
      
      Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key)) {
          filteredUpdates[key] = updates[key];
        }
      });
      
      const user = await User.findByIdAndUpdate(
        userId,
        { $set: filteredUpdates },
        { new: true, runValidators: true }
      ).select('-sessions -__v');
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      res.json({
        success: true,
        message: 'Профиль успешно обновлен',
        user: user
      });
      
    } catch (error) {
      console.error('Ошибка обновления профиля:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Получение транзакций пользователя
  static async getTransactions(req, res) {
    try {
      const userId = req.user.userId;
      const { limit = 50, page = 1, type = null } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const transactions = await Transaction.getUserTransactions(userId, {
        limit: parseInt(limit),
        skip: skip,
        type: type
      });
      
      // Получаем общее количество
      const query = { userId: require('mongoose').Types.ObjectId(userId) };
      if (type) query.type = type;
      
      const totalTransactions = await Transaction.countDocuments(query);
      
      // Рассчитываем статистику
      const stats = await Transaction.getUserBalance(userId);
      
      res.json({
        success: true,
        transactions: transactions,
        stats: stats,
        page: parseInt(page),
        limit: parseInt(limit),
        totalTransactions: totalTransactions,
        totalPages: Math.ceil(totalTransactions / parseInt(limit))
      });
      
    } catch (error) {
      console.error('Ошибка получения транзакций:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Получение статистики пользователя
  static async getStats(req, res) {
    try {
      const userId = req.user.userId;
      
      const [user, transactions, adStats] = await Promise.all([
        User.findById(userId).lean(),
        Transaction.find({ userId, status: 'completed' }).lean(),
        User.aggregate([
          { $match: { _id: require('mongoose').Types.ObjectId(userId) } },
          { $project: {
            adStats: 1,
            referrals: { $size: '$referrals' },
            playTime: '$metrics.playTime',
            sessionsCount: '$metrics.sessionsCount'
          }}
        ])
      ]);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      // Рассчитываем статистику
      const incomeTransactions = transactions.filter(t => t.amount > 0);
      const expenseTransactions = transactions.filter(t => t.amount < 0);
      
      const stats = {
        game: {
          totalClicks: user.gameState.totalClicks,
          clicksPerDay: user.gameState.totalClicks / Math.max(1, Math.floor((Date.now() - user.createdAt) / (1000 * 60 * 60 * 24))),
          maxStars: Math.max(...(transactions.map(t => t.balanceAfter) || [0])),
          avgStarsPerClick: user.gameState.totalClicks > 0 ? user.gameState.stars / user.gameState.totalClicks : 0
        },
        
        economy: {
          totalIncome: incomeTransactions.reduce((sum, t) => sum + t.amount, 0),
          totalExpenses: Math.abs(expenseTransactions.reduce((sum, t) => sum + t.amount, 0)),
          currentBalance: user.gameState.stars,
          mostProfitableType: this.getMostProfitableType(incomeTransactions)
        },
        
        progression: {
          level: user.gameState.userLevel,
          experience: user.gameState.experience,
          experienceNeeded: user.gameState.userLevel * 1000,
          upgradesCount: user.gameState.upgrades.length,
          achievementsCount: user.gameState.achievements.length
        },
        
        activity: {
          playTime: adStats[0]?.playTime || 0,
          sessionsCount: adStats[0]?.sessionsCount || 0,
          avgSessionTime: adStats[0]?.sessionsCount > 0 ? (adStats[0].playTime / adStats[0].sessionsCount) / 1000 : 0,
          lastActive: user.gameState.lastActive,
          daysSinceJoin: Math.floor((Date.now() - user.createdAt) / (1000 * 60 * 60 * 24))
        },
        
        social: {
          referrals: adStats[0]?.referrals || 0,
          referralCode: user.referralCode
        },
        
        ads: {
          totalWatched: adStats[0]?.adStats?.totalAdsWatched || 0,
          earnedFromAds: adStats[0]?.adStats?.totalEarnedFromAds || 0,
          avgRewardPerAd: adStats[0]?.adStats?.totalAdsWatched > 0 
            ? adStats[0].adStats.totalEarnedFromAds / adStats[0].adStats.totalAdsWatched 
            : 0
        }
      };
      
      res.json({
        success: true,
        stats: stats,
        user: {
          telegramId: user.telegramId,
          username: user.username,
          level: user.gameState.userLevel
        }
      });
      
    } catch (error) {
      console.error('Ошибка получения статистики:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Вспомогательный метод для определения самого прибыльного типа транзакций
  static getMostProfitableType(transactions) {
    if (transactions.length === 0) return null;
    
    const typeTotals = {};
    
    transactions.forEach(transaction => {
      if (!typeTotals[transaction.type]) {
        typeTotals[transaction.type] = 0;
      }
      typeTotals[transaction.type] += transaction.amount;
    });
    
    let mostProfitableType = null;
    let maxAmount = 0;
    
    Object.entries(typeTotals).forEach(([type, amount]) => {
      if (amount > maxAmount) {
        maxAmount = amount;
        mostProfitableType = type;
      }
    });
    
    return {
      type: mostProfitableType,
      amount: maxAmount
    };
  }
  
  // Экспорт данных пользователя
  static async exportData(req, res) {
    try {
      const userId = req.user.userId;
      
      const [user, transactions, gameState] = await Promise.all([
        User.findById(userId)
          .select('-sessions -__v')
          .populate('referrals', 'telegramId username firstName lastName')
          .populate('referredBy', 'telegramId username firstName lastName')
          .lean(),
        Transaction.find({ userId }).lean(),
        User.findById(userId).select('gameState').lean()
      ]);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      // Формируем данные для экспорта
      const exportData = {
        metadata: {
          exportDate: new Date().toISOString(),
          exportVersion: '1.0',
          userId: userId
        },
        
        profile: {
          telegramId: user.telegramId,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          languageCode: user.languageCode,
          role: user.role,
          isBanned: user.isBanned,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        
        gameData: {
          state: gameState.gameState,
          settings: user.settings,
          metrics: user.metrics
        },
        
        economy: {
          transactions: transactions,
          inventory: Object.fromEntries(gameState.gameState.inventory || new Map()),
          achievements: gameState.gameState.achievements
        },
        
        social: {
          referralCode: user.referralCode,
          referredBy: user.referredBy,
          referrals: user.referrals
        },
        
        advertising: {
          stats: user.adStats,
          totalEarnedFromAds: user.adStats?.totalEarnedFromAds || 0
        }
      };
      
      // Устанавливаем заголовки для скачивания файла
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="cosmic-clicker-export-${userId}.json"`);
      
      res.send(JSON.stringify(exportData, null, 2));
      
    } catch (error) {
      console.error('Ошибка экспорта данных:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Поиск пользователей (для админов)
  static async searchUsers(req, res) {
    try {
      const { query, limit = 50, page = 1 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      if (!query || query.length < 3) {
        return res.status(400).json({ error: 'Запрос должен содержать минимум 3 символа' });
      }
      
      // Проверяем права доступа
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен' });
      }
      
      const searchQuery = {
        $or: [
          { username: { $regex: query, $options: 'i' } },
          { firstName: { $regex: query, $options: 'i' } },
          { lastName: { $regex: query, $options: 'i' } },
          { telegramId: isNaN(parseInt(query)) ? null : parseInt(query) },
          { referralCode: { $regex: query, $options: 'i' } }
        ].filter(condition => condition[Object.keys(condition)[0]] !== null)
      };
      
      const [users, total] = await Promise.all([
        User.find(searchQuery)
          .skip(skip)
          .limit(parseInt(limit))
          .select('telegramId username firstName lastName gameState.stars gameState.userLevel role isBanned createdAt')
          .sort({ 'gameState.stars': -1 })
          .lean(),
        User.countDocuments(searchQuery)
      ]);
      
      res.json({
        success: true,
        users: users,
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: Math.ceil(total / parseInt(limit))
      });
      
    } catch (error) {
      console.error('Ошибка поиска пользователей:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Блокировка/разблокировка пользователя
  static async toggleBan(req, res) {
    try {
      const { userId } = req.params;
      const { ban, reason } = req.body;
      
      // Проверяем права доступа
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен' });
      }
      
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      // Нельзя блокировать администраторов
      if (user.role === 'admin' && req.user.userId !== userId) {
        return res.status(400).json({ error: 'Нельзя блокировать администраторов' });
      }
      
      user.isBanned = ban;
      user.banReason = reason;
      
      await user.save();
      
      res.json({
        success: true,
        message: ban ? 'Пользователь заблокирован' : 'Пользователь разблокирован',
        user: {
          id: user._id,
          telegramId: user.telegramId,
          username: user.username,
          isBanned: user.isBanned,
          banReason: user.banReason
        }
      });
      
    } catch (error) {
      console.error('Ошибка блокировки пользователя:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Изменение роли пользователя
  static async changeRole(req, res) {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      
      // Проверяем права доступа
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен' });
      }
      
      const validRoles = ['user', 'moderator', 'admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Некорректная роль' });
      }
      
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      user.role = role;
      await user.save();
      
      res.json({
        success: true,
        message: `Роль пользователя изменена на "${role}"`,
        user: {
          id: user._id,
          telegramId: user.telegramId,
          username: user.username,
          role: user.role
        }
      });
      
    } catch (error) {
      console.error('Ошибка изменения роли:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Выдача звезд пользователю
  static async grantStars(req, res) {
    try {
      const { userId } = req.params;
      const { amount, reason } = req.body;
      
      // Проверяем права доступа
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен' });
      }
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Некорректная сумма' });
      }
      
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      // Выдаем звезды
      user.gameState.stars += amount;
      
      // Добавляем транзакцию
      user.transactions.push({
        type: 'admin_grant',
        amount: amount,
        description: reason || `Выдано администратором`
      });
      
      await user.save();
      
      // Создаем запись в Transaction
      await Transaction.createTransaction(userId, {
        type: 'admin_grant',
        amount: amount,
        details: {
          adminId: req.user.userId,
          adminNote: reason || 'Выдано администратором'
        }
      });
      
      res.json({
        success: true,
        message: `Выдано ${amount} звезд пользователю`,
        user: {
          id: user._id,
          telegramId: user.telegramId,
          username: user.username,
          newStars: user.gameState.stars
        }
      });
      
    } catch (error) {
      console.error('Ошибка выдачи звезд:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
  
  // Изъятие звезд у пользователя
  static async removeStars(req, res) {
    try {
      const { userId } = req.params;
      const { amount, reason } = req.body;
      
      // Проверяем права доступа
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен' });
      }
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Некорректная сумма' });
      }
      
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      
      // Проверяем достаточно ли звезд
      if (user.gameState.stars < amount) {
        return res.status(400).json({ 
          error: 'Недостаточно звезд у пользователя',
          current: user.gameState.stars,
          required: amount
        });
      }
      
      // Изымаем звезды
      user.gameState.stars -= amount;
      
      // Добавляем транзакцию
      user.transactions.push({
        type: 'admin_remove',
        amount: -amount,
        description: reason || `Изъято администратором`
      });
      
      await user.save();
      
      // Создаем запись в Transaction
      await Transaction.createTransaction(userId, {
        type: 'admin_remove',
        amount: -amount,
        details: {
          adminId: req.user.userId,
          adminNote: reason || 'Изъято администратором'
        }
      });
      
      res.json({
        success: true,
        message: `Изъято ${amount} звезд у пользователя`,
        user: {
          id: user._id,
          telegramId: user.telegramId,
          username: user.username,
          newStars: user.gameState.stars
        }
      });
      
    } catch (error) {
      console.error('Ошибка изъятия звезд:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  }
}

module.exports = UserController;