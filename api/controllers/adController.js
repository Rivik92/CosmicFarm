const AdView = require('../models/AdView');
const User = require('../models/User');
const GameState = require('../models/GameState');



class AdsController {
  async setupAdMob(req, res) {
    const config = {
      appId: process.env.ADMOB_APP_ID,
      adUnits: {
        rewarded: process.env.ADMOB_REWARDED_ID,
        interstitial: process.env.ADMOB_INTERSTITIAL_ID,
        banner: process.env.ADMOB_BANNER_ID
      },
      testDevices: ["EMULATOR"] // Для тестирования
    };
    // Сохраняем в базу
    await AdConfig.create(config);
  }
}

class AdController1 {
    /**
     * Регистрация просмотра рекламы
     */
    async registerAdView(req, res) {
        try {
            const { userId, adType, platform } = req.body;
            
            const adView = new AdView({
                user: userId,
                adType,
                platform,
                reward: this.calculateReward(adType),
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
            
            await adView.save();
            
            // Начисляем награду пользователю
            const gameState = await GameState.findOne({ user: userId });
            if (gameState) {
                gameState.stars += adView.reward;
                gameState.lastAdView = new Date();
                await gameState.save();
            }
            
            // Обновляем статистику пользователя
            await User.findByIdAndUpdate(userId, {
                $inc: { 'stats.adsWatched': 1, 'stats.totalAdRewards': adView.reward }
            });
            
            res.json({
                success: true,
                reward: adView.reward,
                message: 'Награда успешно начислена!'
            });
            
        } catch (error) {
            console.error('Ad view error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Ошибка при обработке рекламы' 
            });
        }
    }
    
    /**
     * Получение истории просмотров рекламы
     */
    async getAdHistory(req, res) {
        try {
            const { userId } = req.params;
            const { limit = 50, page = 1 } = req.query;
            
            const skip = (page - 1) * limit;
            
            const adViews = await AdView.find({ user: userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .select('adType reward createdAt');
            
            const total = await AdView.countDocuments({ user: userId });
            
            res.json({
                success: true,
                data: adViews,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
            
        } catch (error) {
            console.error('Get ad history error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Ошибка при получении истории' 
            });
        }
    }
    
    /**
     * Получение статистики по рекламе
     */
    async getAdStats(req, res) {
        try {
            const { userId } = req.params;
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const stats = {
                totalAds: await AdView.countDocuments({ user: userId }),
                todayAds: await AdView.countDocuments({ 
                    user: userId, 
                    createdAt: { $gte: today } 
                }),
                totalRewards: await AdView.aggregate([
                    { $match: { user: userId } },
                    { $group: { _id: null, total: { $sum: '$reward' } } }
                ]),
                byType: await AdView.aggregate([
                    { $match: { user: userId } },
                    { $group: { 
                        _id: '$adType', 
                        count: { $sum: 1 },
                        totalRewards: { $sum: '$reward' }
                    }}
                ])
            };
            
            res.json({
                success: true,
                data: stats
            });
            
        } catch (error) {
            console.error('Get ad stats error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Ошибка при получении статистики' 
            });
        }
    }
    
    /**
     * Проверка доступности рекламы
     */
    async checkAdAvailability(req, res) {
        try {
            const { userId, adType } = req.body;
            
            const lastAd = await AdView.findOne({ 
                user: userId, 
                adType 
            }).sort({ createdAt: -1 });
            
            const cooldown = this.getCooldownForAdType(adType);
            const now = new Date();
            let available = true;
            let remainingTime = 0;
            
            if (lastAd) {
                const nextAvailable = new Date(lastAd.createdAt.getTime() + cooldown);
                if (now < nextAvailable) {
                    available = false;
                    remainingTime = Math.ceil((nextAvailable - now) / 1000);
                }
            }
            
            res.json({
                success: true,
                available,
                remainingTime,
                cooldown: cooldown / 1000
            });
            
        } catch (error) {
            console.error('Check ad availability error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Ошибка проверки доступности' 
            });
        }
    }
    
    /**
     * Рассчет награды за рекламу
     */
    calculateReward(adType) {
        const rewards = {
            'rewarded_video': 500,
            'interstitial': 100,
            'banner': 10,
            'offerwall': 1000
        };
        return rewards[adType] || 100;
    }
    
    /**
     * Получение времени восстановления
     */
    getCooldownForAdType(adType) {
        const cooldowns = {
            'rewarded_video': 5 * 60 * 1000, // 5 минут
            'interstitial': 2 * 60 * 1000,    // 2 минуты
            'banner': 30 * 1000,              // 30 секунд
            'offerwall': 30 * 60 * 1000       // 30 минут
        };
        return cooldowns[adType] || 5 * 60 * 1000;
    }
}

module.exports = new AdController();