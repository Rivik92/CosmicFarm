const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Тип транзакции
  type: {
    type: String,
    enum: [
      'click',           // Заработано кликами
      'passive',         // Пассивный доход
      'ad_reward',       // Награда за рекламу
      'purchase',        // Покупка в магазине
      'upgrade',         // Покупка улучшения
      'achievement',     // Награда за достижение
      'level_up',        // Награда за уровень
      'daily_reward',    // Ежедневная награда
      'referral',        // Реферальная награда
      'admin_grant',     // Выдано администратором
      'admin_remove',    // Изъято администратором
      'transfer_in',     // Перевод от другого игрока
      'transfer_out',    // Перевод другому игроку
      'refund'           // Возврат средств
    ],
    required: true
  },
  
  // Сумма (может быть отрицательной для расходов)
  amount: {
    type: Number,
    required: true
  },
  
  // Баланс после транзакции
  balanceAfter: {
    type: Number,
    required: true
  },
  
  // Детали транзакции
  details: {
    // Для покупок в магазине
    itemId: String,
    itemName: String,
    itemType: String,
    
    // Для улучшений
    upgradeId: Number,
    upgradeName: String,
    
    // Для достижений
    achievementId: String,
    achievementName: String,
    
    // Для рекламы
    adProvider: String,
    adType: String,
    
    // Для переводов
    fromUserId: mongoose.Schema.Types.ObjectId,
    toUserId: mongoose.Schema.Types.ObjectId,
    transferId: String,
    
    // Для админ действий
    adminId: mongoose.Schema.Types.ObjectId,
    adminNote: String,
    
    // Общие
    description: String,
    metadata: mongoose.Schema.Types.Mixed
  },
  
  // Статус транзакции
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'completed'
  },
  
  // Валидация
  signature: String,
  verified: {
    type: Boolean,
    default: false
  },
  
  // IP и устройство
  ipAddress: String,
  userAgent: String,
  deviceId: String,
  
  // Временные метки
  processedAt: {
    type: Date,
    default: Date.now
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Индексы для быстрого поиска
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ 'details.transferId': 1 }, { sparse: true });
transactionSchema.index({ createdAt: 1 });

// Middleware
transactionSchema.pre('save', function(next) {
  // Автоматическая подпись для важных транзакций
  if (this.type === 'transfer_out' || this.type === 'admin_grant' || this.type === 'admin_remove') {
    this.signature = this.generateSignature();
  }
  
  next();
});

// Методы
transactionSchema.methods.generateSignature = function() {
  const crypto = require('crypto');
  const data = `${this.userId}-${this.type}-${this.amount}-${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex');
};

transactionSchema.methods.verifySignature = function(signature) {
  return this.signature === signature;
};

transactionSchema.methods.markAsVerified = function() {
  this.verified = true;
  this.status = 'completed';
  return this;
};

transactionSchema.methods.markAsFailed = function(reason) {
  this.status = 'failed';
  this.details.metadata = { ...this.details.metadata, failureReason: reason };
  return this;
};

transactionSchema.methods.refund = function(reason) {
  if (this.status !== 'completed') {
    throw new Error('Только завершенные транзакции могут быть возвращены');
  }
  
  this.status = 'refunded';
  this.details.metadata = { ...this.details.metadata, refundReason: reason, refundedAt: new Date() };
  
  return this;
};

// Статические методы
transactionSchema.statics.getUserTransactions = function(userId, options = {}) {
  const {
    limit = 50,
    skip = 0,
    type = null,
    startDate = null,
    endDate = null
  } = options;
  
  const query = { userId };
  
  if (type) {
    query.type = type;
  }
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('userId', 'telegramId firstName username')
    .lean();
};

transactionSchema.statics.getUserBalance = async function(userId) {
  const result = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId), status: 'completed' } },
    { $group: {
      _id: '$userId',
      totalIncome: {
        $sum: {
          $cond: [{ $gt: ['$amount', 0] }, '$amount', 0]
        }
      },
      totalExpenses: {
        $sum: {
          $cond: [{ $lt: ['$amount', 0] }, '$amount', 0]
        }
      },
      currentBalance: { $last: '$balanceAfter' }
    }}
  ]);
  
  return result[0] || {
    totalIncome: 0,
    totalExpenses: 0,
    currentBalance: 0
  };
};

transactionSchema.statics.getDailyStats = async function(date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startOfDay, $lte: endOfDay },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: {
          type: '$type',
          hour: { $hour: '$createdAt' }
        },
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        avgAmount: { $avg: '$amount' }
      }
    },
    {
      $group: {
        _id: '$_id.type',
        hourlyStats: {
          $push: {
            hour: '$_id.hour',
            count: '$count',
            totalAmount: '$totalAmount',
            avgAmount: '$avgAmount'
          }
        },
        totalCount: { $sum: '$count' },
        totalAmount: { $sum: '$totalAmount' }
      }
    }
  ]);
};

transactionSchema.statics.createTransaction = async function(userId, data) {
  const Transaction = this;
  const User = require('./User');
  
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    // Получаем пользователя
    const user = await User.findById(userId).session(session);
    
    if (!user) {
      throw new Error('Пользователь не найден');
    }
    
    // Вычисляем новый баланс
    const newBalance = user.gameState.stars + data.amount;
    
    if (newBalance < 0) {
      throw new Error('Недостаточно средств');
    }
    
    // Обновляем баланс пользователя
    user.gameState.stars = newBalance;
    await user.save({ session });
    
    // Создаем транзакцию
    const transaction = new Transaction({
      userId: userId,
      type: data.type,
      amount: data.amount,
      balanceAfter: newBalance,
      details: data.details || {},
      status: 'completed',
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      deviceId: data.deviceId
    });
    
    await transaction.save({ session });
    
    await session.commitTransaction();
    
    return {
      success: true,
      transaction: transaction,
      newBalance: newBalance
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;