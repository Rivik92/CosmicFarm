const mongoose = require('mongoose');

const gameStateSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Основные ресурсы
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
  
  // Характеристики
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
  
  // Прогресс
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
  
  // Улучшения
  upgrades: [{
    upgradeId: {
      type: Number,
      required: true
    },
    purchasedAt: {
      type: Date,
      default: Date.now
    },
    level: {
      type: Number,
      default: 1
    }
  }],
  
  // Достижения
  achievements: [{
    achievementId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    description: String,
    unlockedAt: {
      type: Date,
      default: Date.now
    },
    reward: Number
  }],
  
  // Инвентарь
  inventory: {
    type: Map,
    of: {
      count: {
        type: Number,
        default: 0,
        min: 0
      },
      equipped: {
        type: Boolean,
        default: false
      }
    },
    default: {}
  },
  
  // Активные бустеры
  activeBoosters: [{
    boosterId: {
      type: String,
      required: true
    },
    name: String,
    type: {
      type: String,
      enum: ['click', 'passive', 'energy', 'critical'],
      required: true
    },
    multiplier: Number,
    value: Number,
    activatedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true
    }
  }],
  
  // Статистика
  statistics: {
    playTime: {
      type: Number,
      default: 0
    },
    
    maxStars: {
      type: Number,
      default: 1000
    },
    
    maxClickPower: {
      type: Number,
      default: 1
    },
    
    clicksPerSecond: {
      type: Number,
      default: 0
    },
    
    lastSessionStart: Date,
    
    lastSessionEnd: Date
  },
  
  // Временные метки
  lastActive: {
    type: Date,
    default: Date.now
  },
  
  lastSave: {
    type: Date,
    default: Date.now
  },
  
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
gameStateSchema.index({ userId: 1 }, { unique: true });
gameStateSchema.index({ stars: -1 });
gameStateSchema.index({ userLevel: -1 });
gameStateSchema.index({ 'activeBoosters.expiresAt': 1 });

// Middleware
gameStateSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  this.lastSave = Date.now();
  
  // Обновляем максимальные значения
  this.statistics.maxStars = Math.max(this.statistics.maxStars, this.stars);
  this.statistics.maxClickPower = Math.max(this.statistics.maxClickPower, this.clickPower);
  
  // Удаляем просроченные бустеры
  this.cleanExpiredBoosters();
  
  next();
});

// Методы
gameStateSchema.methods.cleanExpiredBoosters = function() {
  const now = new Date();
  this.activeBoosters = this.activeBoosters.filter(booster => booster.expiresAt > now);
};

gameStateSchema.methods.getActiveBoosters = function() {
  this.cleanExpiredBoosters();
  return this.activeBoosters;
};

gameStateSchema.methods.addBooster = function(boosterData) {
  this.activeBoosters.push({
    boosterId: boosterData.id,
    name: boosterData.name,
    type: boosterData.type,
    multiplier: boosterData.multiplier,
    value: boosterData.value,
    activatedAt: new Date(),
    expiresAt: new Date(Date.now() + boosterData.duration)
  });
  
  return this;
};

gameStateSchema.methods.calculateClickValue = function() {
  let clickValue = this.clickPower;
  
  // Применяем активные бустеры
  this.getActiveBoosters().forEach(booster => {
    if (booster.type === 'click' && booster.multiplier) {
      clickValue = Math.floor(clickValue * booster.multiplier);
    }
  });
  
  // Применяем артефакты из инвентаря
  this.inventory.forEach((item, itemId) => {
    if (item.equipped && itemId.includes('click')) {
      // Логика применения артефакта
      clickValue = Math.floor(clickValue * 1.1); // Пример: +10%
    }
  });
  
  return clickValue;
};

gameStateSchema.methods.calculatePassiveIncome = function() {
  let income = this.passiveIncome;
  
  // Применяем активные бустеры
  this.getActiveBoosters().forEach(booster => {
    if (booster.type === 'passive' && booster.multiplier) {
      income = Math.floor(income * booster.multiplier);
    }
  });
  
  // Применяем артефакты из инвентаря
  this.inventory.forEach((item, itemId) => {
    if (item.equipped && itemId.includes('passive')) {
      // Логика применения артефакта
      income = Math.floor(income * 1.1); // Пример: +10%
    }
  });
  
  return income;
};

gameStateSchema.methods.addUpgrade = function(upgradeId) {
  const existingUpgrade = this.upgrades.find(u => u.upgradeId === upgradeId);
  
  if (existingUpgrade) {
    existingUpgrade.level += 1;
  } else {
    this.upgrades.push({
      upgradeId: upgradeId,
      level: 1
    });
  }
  
  return this;
};

gameStateSchema.methods.hasUpgrade = function(upgradeId) {
  return this.upgrades.some(u => u.upgradeId === upgradeId);
};

gameStateSchema.methods.getUpgradeLevel = function(upgradeId) {
  const upgrade = this.upgrades.find(u => u.upgradeId === upgradeId);
  return upgrade ? upgrade.level : 0;
};

gameStateSchema.methods.addAchievement = function(achievementData) {
  if (!this.achievements.some(a => a.achievementId === achievementData.id)) {
    this.achievements.push({
      achievementId: achievementData.id,
      name: achievementData.name,
      description: achievementData.description,
      reward: achievementData.reward
    });
    
    if (achievementData.reward) {
      this.stars += achievementData.reward;
    }
  }
  
  return this;
};

gameStateSchema.methods.startSession = function() {
  this.statistics.lastSessionStart = new Date();
  return this;
};

gameStateSchema.methods.endSession = function() {
  if (this.statistics.lastSessionStart) {
    const sessionTime = Date.now() - this.statistics.lastSessionStart;
    this.statistics.playTime += sessionTime;
    this.statistics.lastSessionEnd = new Date();
  }
  return this;
};

// Статические методы
gameStateSchema.statics.getGlobalStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalPlayers: { $sum: 1 },
        totalStars: { $sum: '$stars' },
        totalClicks: { $sum: '$totalClicks' },
        avgLevel: { $avg: '$userLevel' },
        avgStars: { $avg: '$stars' },
        maxStars: { $max: '$stars' }
      }
    }
  ]);
  
  return stats[0] || {
    totalPlayers: 0,
    totalStars: 0,
    totalClicks: 0,
    avgLevel: 0,
    avgStars: 0,
    maxStars: 0
  };
};

const GameState = mongoose.model('GameState', gameStateSchema);

module.exports = GameState;