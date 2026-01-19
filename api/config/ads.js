class AdsConfig {
    constructor() {
        this.adNetworks = {
            google: {
                enabled: process.env.GOOGLE_ADS_ENABLED === 'true',
                appId: process.env.GOOGLE_ADS_APP_ID,
                adUnitIds: {
                    rewarded: process.env.GOOGLE_REWARDED_AD_UNIT_ID,
                    interstitial: process.env.GOOGLE_INTERSTITIAL_AD_UNIT_ID,
                    banner: process.env.GOOGLE_BANNER_AD_UNIT_ID
                }
            },
            yandex: {
                enabled: process.env.YANDEX_ADS_ENABLED === 'true',
                blockId: process.env.YANDEX_AD_BLOCK_ID
            },
            unity: {
                enabled: process.env.UNITY_ADS_ENABLED === 'true',
                gameId: process.env.UNITY_GAME_ID,
                placementIds: {
                    rewarded: process.env.UNITY_REWARDED_PLACEMENT_ID
                }
            }
        };
        
        this.rewards = {
            rewarded_video: {
                base: 500,
                multiplier: 1.0,
                cooldown: 5 * 60 * 1000, // 5 минут
                maxPerDay: 20
            },
            interstitial: {
                base: 100,
                multiplier: 1.0,
                cooldown: 2 * 60 * 1000, // 2 минуты
                maxPerDay: 50
            },
            banner: {
                base: 10,
                multiplier: 1.0,
                cooldown: 30 * 1000, // 30 секунд
                maxPerDay: 100
            },
            offerwall: {
                base: 1000,
                multiplier: 1.0,
                cooldown: 30 * 60 * 1000, // 30 минут
                maxPerDay: 10
            }
        };
        
        this.testMode = process.env.ADS_TEST_MODE === 'true';
    }
    
    /**
     * Получение конфигурации для рекламной сети
     */
    getNetworkConfig(network) {
        return this.adNetworks[network];
    }
    
    /**
     * Получение награды за тип рекламы
     */
    getReward(adType, userLevel = 1) {
        const config = this.rewards[adType];
        if (!config) return 100;
        
        let reward = config.base;
        
        // Умножаем на уровень пользователя (но не более чем в 5 раз)
        const levelMultiplier = Math.min(userLevel * 0.1, 5);
        reward *= levelMultiplier;
        
        // Применяем общий множитель
        reward *= config.multiplier;
        
        return Math.round(reward);
    }
    
    /**
     * Получение времени восстановления
     */
    getCooldown(adType) {
        return this.rewards[adType]?.cooldown || 5 * 60 * 1000;
    }
    
    /**
     * Получение лимита в день
     */
    getDailyLimit(adType) {
        return this.rewards[adType]?.maxPerDay || 20;
    }
    
    /**
     * Проверка, включен ли тестовый режим
     */
    isTestMode() {
        return this.testMode;
    }
    
    /**
     * Получение тестовых объявлений
     */
    getTestAds() {
        return {
            rewarded: [
                {
                    id: 'test_rewarded_1',
                    title: 'Тестовое рекламное видео',
                    description: 'Просмотрите видео для получения награды',
                    duration: 15,
                    reward: 500
                }
            ],
            interstitial: [
                {
                    id: 'test_interstitial_1',
                    title: 'Тестовое межстраничное объявление',
                    description: 'Межстраничная реклама'
                }
            ]
        };
    }
    
    /**
     * Получение всех активных рекламных сетей
     */
    getActiveNetworks() {
        return Object.entries(this.adNetworks)
            .filter(([_, config]) => config.enabled)
            .map(([name]) => name);
    }
    
    /**
     * Получение конфигурации для фронтенда
     */
    getFrontendConfig() {
        return {
            testMode: this.testMode,
            rewards: this.rewards,
            networks: this.getActiveNetworks(),
            adUnits: Object.entries(this.adNetworks)
                .filter(([_, config]) => config.enabled)
                .reduce((acc, [network, config]) => {
                    acc[network] = config.adUnitIds || config.blockId || config.gameId;
                    return acc;
                }, {})
        };
    }
}

module.exports = new AdsConfig();