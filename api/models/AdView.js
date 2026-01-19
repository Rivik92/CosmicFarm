const mongoose = require('mongoose');

const adViewSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Информация о рекламе
  adProvider: {
    type: String,
    enum: ['hilltopads', 'admob', 'unity', 'test', 'other'],
    required: true
  },
  
  adUnitId: {
    type: String,
    required: true
  },
  
  adType: {
    type: String,
    enum: ['rewarded_video', 'interstitial', 'banner', 'native'],
    required: true
  },
  
  adName: String,
  
  // Награда
  rewardAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  rewardType: {
    type: String,
    enum: ['stars', 'energy', 'booster', 'item'],
    default: 'stars'
  },
  
  // Статус просмотра
  status: {
    type: String,
    enum: ['started', 'completed', 'skipped', 'failed', 'fraud'],
    default: 'started'
  },
  
  completionPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  // Время просмотра
  startedAt: {
    type: Date,
    default: Date.now
  },
  
  completedAt: Date,
  
  duration: {
    type: Number, // в миллисекундах
    default: 0
  },
  
  // Геолокация и устройство
  ipAddress: String,
  country: String,
  city: String,
  
  userAgent: String,
  deviceType: {
    type: String,
    enum: ['mobile', 'tablet', 'desktop', 'other']
  },
  
  os: String,
  browser: String,
  
  // Монетизация
  revenue: {
    type: Number,
    default: 0
  },
  
  currency: {
    type: String,
    default: 'USD'
  },
  
  // Верификация (для предотвращения мошенничества)
  verification: {
    isVerified: {
      type: Boolean,
      default: false
    },
    
    verifiedBy: String,
    
    verificationMethod: {
      type: String,
      enum: ['manual', 'automated', 'third_party']
    },
    
    fraudScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    
    flags: [{
      type: String,
      enum: ['ip_reuse', 'device_reuse', 'time_short', 'geo_inconsistent']
    }]
  },
  
  // Метаданные
  metadata: mongoose.Schema.Types.Mixed,
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Индексы для быстрого поиска и агрегации
adViewSchema.index({ userId: 1, createdAt: -1 });
adViewSchema.index({ adProvider: 1, status: 1 });
adViewSchema.index({ createdAt: 1 });
adViewSchema.index({ status: 1, verification: 1 });
adViewSchema.index({ country: 1, deviceType: 1 });

// Middleware
adViewSchema.pre('save', function(next) {
  // Автоматически определяем тип устройства
  if (!this.deviceType) {
    this.deviceType = this.detectDeviceType();
  }
  
  // Вычисляем продолжительность просмотра
  if (this.completedAt && this.startedAt) {
    this.duration = this.completedAt - this.startedAt;
  }
  
  // Автоматическая проверка на мошенничество
  if (this.status === 'completed') {
    this.checkForFraud();
  }
  
  next();
});

// Методы
adViewSchema.methods.detectDeviceType = function() {
  const ua = this.userAgent || '';
  
  if (/mobile/i.test(ua)) return 'mobile';
  if (/tablet/i.test(ua)) return 'tablet';
  if (/desktop/i.test(ua)) return 'desktop';
  return 'other';
};

adViewSchema.methods.checkForFraud = function() {
  const flags = [];
  let fraudScore = 0;
  
  // Слишком короткий просмотр (менее 5 секунд для rewarded видео)
  if (this.adType === 'rewarded_video' && this.duration < 5000) {
    flags.push('time_short');
    fraudScore += 30;
  }
  
  // Проверка геолокации (если есть)
  if (this.country && this.ipAddress) {
    // Здесь можно добавить проверку согласованности геолокации
  }
  
  this.verification.flags = flags;
  this.verification.fraudScore = fraudScore;
  
  // Если счетчик мошенничества высок, помечаем как подозрительный
  if (fraudScore > 70) {
    this.status = 'fraud';
  }
  
  return this;
};

adViewSchema.methods.complete = function(completionPercentage = 100) {
  this.status = 'completed';
  this.completionPercentage = completionPercentage;
  this.completedAt = new Date();
  
  return this;
};

adViewSchema.methods.fail = function(reason) {
  this.status = 'failed';
  this.metadata = { ...this.metadata, failureReason: reason };
  
  return this;
};

adViewSchema.methods.markAsVerified = function(method = 'automated', verifiedBy = 'system') {
  this.verification.isVerified = true;
  this.verification.verificationMethod = method;
  this.verification.verifiedBy = verifiedBy;
  
  return this;
};

// Статические методы
adViewSchema.statics.getUserAdStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId), status: 'completed' } },
    { $group: {
      _id: '$userId',
      totalViews: { $sum: 1 },
      totalReward: { $sum: '$rewardAmount' },
      totalRevenue: { $sum: '$revenue' },
      avgViewDuration: { $avg: '$duration' },
      lastView: { $max: '$createdAt' },
      providers: { $addToSet: '$adProvider' }
    }}
  ]);
  
  return stats[0] || {
    totalViews: 0,
    totalReward: 0,
    totalRevenue: 0,
    avgViewDuration: 0,
    lastView: null,
    providers: []
  };
};

adViewSchema.statics.getDailyAdStats = async function(date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startOfDay, $lte: endOfDay },
        status: 'completed',
        'verification.isVerified': true
      }
    },
    {
      $group: {
        _id: {
          provider: '$adProvider',
          type: '$adType'
        },
        views: { $sum: 1 },
        totalReward: { $sum: '$rewardAmount' },
        totalRevenue: { $sum: '$revenue' },
        avgDuration: { $avg: '$duration' },
        completionRate: {
          $avg: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
          }
        }
      }
    },
    {
      $group: {
        _id: '$_id.provider',
        types: {
          $push: {
            type: '$_id.type',
            views: '$views',
            totalReward: '$totalReward',
            totalRevenue: '$totalRevenue',
            avgDuration: '$avgDuration',
            completionRate: '$completionRate'
          }
        },
        totalViews: { $sum: '$views' },
        totalReward: { $sum: '$totalReward' },
        totalRevenue: { $sum: '$totalRevenue' }
      }
    }
  ]);
};

adViewSchema.statics.createAdView = async function(userId, adData) {
  const AdView = this;
  const User = require('./User');
  const Transaction = require('./Transaction');
  
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    // Проверяем, может ли пользователь смотреть рекламу
    const user = await User.findById(userId).session(session);
    
    if (!user) {
      throw new Error('Пользователь не найден');
    }
    
    if (!user.canWatchAd()) {
      throw new Error('Достигнут дневной лимит рекламы');
    }
    
    // Создаем запись о просмотре
    const adView = new AdView({
      userId: userId,
      adProvider: adData.provider || 'test',
      adUnitId: adData.adUnitId || 'test_unit',
      adType: adData.adType || 'rewarded_video',
      adName: adData.adName,
      rewardAmount: adData.rewardAmount || 500,
      rewardType: adData.rewardType || 'stars',
      ipAddress: adData.ipAddress,
      userAgent: adData.userAgent,
      deviceType: adData.deviceType
    });
    
    await adView.save({ session });
    
    return {
      success: true,
      adView: adView,
      session: session // Возвращаем сессию для дальнейшего использования
    };
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw error;
  }
};

adViewSchema.statics.completeAdView = async function(adViewId, completionData = {}) {
  const AdView = this;
  const User = require('./User');
  const Transaction = require('./Transaction');
  
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    // Находим запись о просмотре
    const adView = await AdView.findById(adViewId).session(session);
    
    if (!adView) {
      throw new Error('Запись о просмотре не найдена');
    }
    
    if (adView.status !== 'started') {
      throw new Error('Просмотр уже завершен или отменен');
    }
    
    // Отмечаем как завершенный
    adView.complete(completionData.completionPercentage || 100);
    adView.revenue = completionData.revenue || 0;
    adView.metadata = { ...adView.metadata, ...completionData.metadata };
    
    await adView.save({ session });
    
    // Начисляем награду пользователю
    const user = await User.findById(adView.userId).session(session);
    await user.watchAd(adView.rewardAmount);
    await user.save({ session });
    
    // Создаем транзакцию
    await Transaction.createTransaction(
      adView.userId,
      {
        type: 'ad_reward',
        amount: adView.rewardAmount,
        details: {
          adProvider: adView.adProvider,
          adType: adView.adType,
          adViewId: adView._id,
          revenue: adView.revenue
        },
        ipAddress: adView.ipAddress,
        userAgent: adView.userAgent
      },
      { session }
    );
    
    await session.commitTransaction();
    
    return {
      success: true,
      adView: adView,
      reward: adView.rewardAmount
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const AdView = mongoose.model('AdView', adViewSchema);

module.exports = AdView;