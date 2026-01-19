const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  
  username: {
    type: String,
    trim: true
  },
  
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  
  lastName: {
    type: String,
    trim: true
  },
  
  languageCode: {
    type: String,
    default: 'ru'
  },
  
  // Игровые данные
  gameState: {
    stars: {
      type: Number,
      default: 1000,
      min: 0
    },
    
    energy: {
      type: Number,
      default: 100,
      min: 0
    },
    
    maxEnergy: {
      type: Number,
      default: 100,
      min: 10
    },
    
    clickPower: {
      type: Number,
      default: 1,
      min: 1
    },
    
    passiveIncome: {
      type: Number,
      default: 5,
      min: 0
    },
    
    totalClicks: {
      type: Number,
      default: 0,
      min: 0
    },
    
    userLevel: {
      type: Number,
      default: 1,
      min: 1
    },
    
    experience: {
      type: Number,
      default: 0,
      min: 0
    },
    
    upgrades: [{
      type: Number,
      default: []
    }],
    
    achievements: [{
      achievementId: String,
      name: String,
      unlockedAt: Date,
      reward: Number
    }],
    
    inventory: {
      type: Map,
      of: Number,
      default: {}
    },
    
    activeBoosters: [{
      boosterId: String,
      type: String,
      multiplier: Number,
      activatedAt: Date,
      expiresAt: Date
    }],
    
    lastActive: {
      type: Date,
      default: Date.now
    }
  },
  
  // Экономика
  transactions: [{
    type: {
      type: String,
      enum: ['purchase', 'reward', 'ad_reward', 'transfer', 'refund']
    },
    amount: Number,
    description: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Реклама
  adStats: {
    adsWatchedToday: {
      type: Number,
      default: 0,
      min: 0
    },
    
    lastAdWatch: Date,
    
    totalAdsWatched: {
      type: Number,
      default: 0,
      min: 0
    },
    
    totalEarnedFromAds: {
      type: Number,
      default: 0,
      min: 0
    },
    
    dailyReset: {
      type: Date,
      default: Date.now
    }
  },
  
  // Сессии и безопасность
  sessions: [{
    token: String,
    device: String,
    ip: String,
    lastUsed: Date,
    expiresAt: Date
  }],
  
  // Настройки
  settings: {
    notifications: {
      type: Boolean,
      default: true
    },
    
    sound: {
      type: Boolean,
      default: true
    },
    
    vibration: {
      type: Boolean,
      default: true
    },
    
    language: {
      type: String,
      default: 'ru'
    },
    
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    }
  },
  
  // Администрация
  role: {
    type: String,
    enum: ['user', 'moderator', 'admin'],
    default: 'user'
  },
  
  isBanned: {
    type: Boolean,
    default: false
  },
  
  banReason: String,
  
  // Реферальная система
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  referrals: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Метрики
  metrics: {
    playTime: {
      type: Number,
      default: 0
    },
    
    sessionsCount: {
      type: Number,
      default: 0
    },
    
    lastLogin: Date,
    
    deviceType: String,
    
    platform: String
  },
  
  // Метаданные
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Индексы
userSchema.index({ 'gameState.stars': -1 });
userSchema.index({ 'gameState.userLevel': -1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'adStats.dailyReset': 1 });
userSchema.index({ referralCode: 1 }, { unique: true, sparse: true });

// Middleware
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Генерация реферального кода
  if (!this.referralCode) {
    this.referralCode = this.generateReferralCode();
  }
  
  // Сброс дневного счетчика рекламы
  this.resetDailyAdCounter();
  
  next();
});

// Методы
userSchema.methods.generateReferralCode = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return code;
};

userSchema.methods.resetDailyAdCounter = function() {
  const now = new Date();
  const lastReset = this.adStats.dailyReset || new Date(0);
  
  // Если прошло больше 24 часов, сбрасываем счетчик
  if (now - lastReset > 24 * 60 * 60 * 1000) {
    this.adStats.adsWatchedToday = 0;
    this.adStats.dailyReset = now;
  }
};

userSchema.methods.canWatchAd = function() {
  this.resetDailyAdCounter();
  
  return this.adStats.adsWatchedToday < 10; // Максимум 10 реклам в день
};

userSchema.methods.watchAd = function(reward) {
  if (!this.canWatchAd()) {
    throw new Error('Достигнут дневной лимит рекламы');
  }
  
  this.adStats.adsWatchedToday++;
  this.adStats.lastAdWatch = new Date();
  this.adStats.totalAdsWatched++;
  this.adStats.totalEarnedFromAds += reward;
  
  this.gameState.stars += reward;
  
  // Добавляем транзакцию
  this.transactions.push({
    type: 'ad_reward',
    amount: reward,
    description: 'Награда за просмотр рекламы'
  });
  
  return this;
};

userSchema.methods.addStars = function(amount, description = '') {
  this.gameState.stars += amount;
  
  if (description) {
    this.transactions.push({
      type: 'reward',
      amount: amount,
      description: description
    });
  }
  
  return this;
};

userSchema.methods.removeStars = function(amount, description = '') {
  if (this.gameState.stars < amount) {
    throw new Error('Недостаточно звезд');
  }
  
  this.gameState.stars -= amount;
  
  if (description) {
    this.transactions.push({
      type: 'purchase',
      amount: -amount,
      description: description
    });
  }
  
  return this;
};

userSchema.methods.handleClick = function() {
  if (this.gameState.energy <= 0) {
    throw new Error('Недостаточно энергии');
  }
  
  let clickValue = this.gameState.clickPower;
  
  // Применяем активные бустеры
  this.gameState.activeBoosters.forEach(booster => {
    if (booster.type === 'click' && booster.expiresAt > new Date()) {
      clickValue = Math.floor(clickValue * booster.multiplier);
    }
  });
  
  // Обновляем состояние
  this.gameState.stars += clickValue;
  this.gameState.energy -= 1;
  this.gameState.totalClicks += 1;
  this.gameState.experience += Math.floor(clickValue / 10);
  this.gameState.lastActive = new Date();
  
  // Проверка уровня
  this.checkLevelUp();
  
  return {
    success: true,
    stars: this.gameState.stars,
    energy: this.gameState.energy,
    clickValue: clickValue
  };
};

userSchema.methods.checkLevelUp = function() {
  const expNeeded = this.gameState.userLevel * 1000;
  
  if (this.gameState.experience >= expNeeded) {
    const oldLevel = this.gameState.userLevel;
    
    while (this.gameState.experience >= expNeeded) {
      this.gameState.userLevel++;
      this.gameState.experience -= expNeeded;
    }
    
    // Награда за уровень
    const levelDiff = this.gameState.userLevel - oldLevel;
    const reward = levelDiff * 1000;
    
    this.addStars(reward, `Награда за достижение уровня ${this.gameState.userLevel}`);
    
    // Улучшаем характеристики
    this.gameState.clickPower += levelDiff;
    this.gameState.maxEnergy += levelDiff * 10;
    this.gameState.passiveIncome += levelDiff;
    
    return {
      leveledUp: true,
      oldLevel: oldLevel,
      newLevel: this.gameState.userLevel,
      reward: reward
    };
  }
  
  return { leveledUp: false };
};

userSchema.methods.restoreOfflineIncome = function() {
  const now = new Date();
  const timeDiff = (now - this.gameState.lastActive) / 1000;
  
  if (timeDiff > 0) {
    // Максимум 24 часа оффлайн дохода
    const maxOfflineTime = 24 * 60 * 60;
    const offlineTime = Math.min(timeDiff, maxOfflineTime);
    
    // Пассивный доход
    let passiveIncome = Math.floor(offlineTime * this.gameState.passiveIncome);
    
    // Применяем активные бустеры
    this.gameState.activeBoosters.forEach(booster => {
      if (booster.type === 'passive' && booster.expiresAt > now) {
        passiveIncome = Math.floor(passiveIncome * booster.multiplier);
      }
    });
    
    if (passiveIncome > 0) {
      this.gameState.stars += passiveIncome;
      this.transactions.push({
        type: 'reward',
        amount: passiveIncome,
        description: 'Оффлайн доход'
      });
    }
    
    // Восстановление энергии
    const energyRecovered = Math.floor(offlineTime / 30); // 1 энергия каждые 30 секунд
    if (energyRecovered > 0) {
      this.gameState.energy = Math.min(
        this.gameState.maxEnergy,
        this.gameState.energy + energyRecovered
      );
    }
    
    this.gameState.lastActive = now;
    
    return {
      offlineIncome: passiveIncome,
      energyRecovered: energyRecovered,
      offlineTime: offlineTime
    };
  }
  
  return { offlineIncome: 0, energyRecovered: 0, offlineTime: 0 };
};

// Статические методы
userSchema.statics.findByTelegramId = function(telegramId) {
  return this.findOne({ telegramId });
};

userSchema.statics.getLeaderboard = function(limit = 100) {
  return this.find({ 'gameState.stars': { $gt: 0 } })
    .sort({ 'gameState.stars': -1 })
    .limit(limit)
    .select('telegramId firstName lastName username gameState.stars gameState.userLevel');
};

userSchema.statics.getTopReferrers = function(limit = 50) {
  return this.aggregate([
    { $match: { referrals: { $exists: true, $ne: [] } } },
    { $project: {
      telegramId: 1,
      firstName: 1,
      lastName: 1,
      username: 1,
      referralCount: { $size: '$referrals' }
    }},
    { $sort: { referralCount: -1 } },
    { $limit: limit }
  ]);
};

const User = mongoose.model('User', userSchema);

module.exports = User;