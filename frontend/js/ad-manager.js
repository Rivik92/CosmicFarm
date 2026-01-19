// Менеджер рекламы для Cosmic Clicker

class AdManager {
    constructor() {
        this.adConfig = {
            maxAdsPerDay: 10,
            rewardAmount: 500,
            minEnergyRequired: 10,
            cooldownBetweenAds: 30000, // 30 секунд
            testMode: true // В продакшене установить false
        };
        
        this.adState = {
            adsWatchedToday: parseInt(localStorage.getItem('adsWatchedToday')) || 0,
            lastAdWatch: parseInt(localStorage.getItem('lastAdWatch')) || 0,
            adCooldown: false
        };
        
        this.init();
    }
    
    init() {
        this.setupAdProviders();
        this.updateAdButton();
        
        // Сбрасываем счётчик в новый день
        this.resetDailyCounter();
    }
    
    setupAdProviders() {
        // Настройка рекламных провайдеров
        this.providers = {
            // HilltopAds (пример интеграции)
            hilltop: {
                enabled: false,
                publisherId: null,
                adUnits: {
                    rewarded: null,
                    interstitial: null,
                    banner: null
                },
                init: function() {
                    if (this.enabled && window.HilltopAds) {
                        window.HilltopAds.init({
                            publisherId: this.publisherId
                        });
                    }
                },
                showRewardedAd: function(onReward) {
                    if (window.HilltopAds && window.HilltopAds.isLoaded()) {
                        window.HilltopAds.showRewardedAd({
                            adUnitId: this.adUnits.rewarded,
                            onReward: function(reward) {
                                onReward(reward.amount);
                            }
                        });
                        return true;
                    }
                    return false;
                }
            },
            
            // AdMob (для мобильных устройств)
            admob: {
                enabled: false,
                appId: null,
                adUnits: {
                    rewarded: null
                },
                init: function() {
                    // Инициализация AdMob
                    if (this.enabled && window.admob) {
                        window.admob.initialize(this.appId);
                    }
                }
            },
            
            // Unity Ads
            unity: {
                enabled: false,
                gameId: null,
                init: function() {
                    if (this.enabled && window.unityads) {
                        window.unityads.init(this.gameId);
                    }
                }
            }
        };
    }
    
    canWatchAd() {
        // Проверка лимитов
        if (this.adState.adsWatchedToday >= this.adConfig.maxAdsPerDay) {
            return { canWatch: false, reason: 'Достигнут дневной лимит рекламы' };
        }
        
        // Проверка кулдауна
        const now = Date.now();
        if (this.adState.adCooldown && now - this.adState.lastAdWatch < this.adConfig.cooldownBetweenAds) {
            const timeLeft = Math.ceil((this.adConfig.cooldownBetweenAds - (now - this.adState.lastAdWatch)) / 1000);
            return { canWatch: false, reason: `Подождите ${timeLeft} секунд` };
        }
        
        return { canWatch: true };
    }
    
    showRewardedAd() {
        return new Promise((resolve, reject) => {
            const canWatch = this.canWatchAd();
            
            if (!canWatch.canWatch) {
                reject({ success: false, error: canWatch.reason });
                return;
            }
            
            // В тестовом режиме показываем симуляцию
            if (this.adConfig.testMode) {
                this.showTestAd().then(resolve).catch(reject);
                return;
            }
            
            // Пытаемся показать рекламу от провайдеров
            let adShown = false;
            
            // HilltopAds
            if (this.providers.hilltop.enabled && this.providers.hilltop.showRewardedAd) {
                adShown = this.providers.hilltop.showRewardedAd((reward) => {
                    this.handleAdReward(reward);
                    resolve({ success: true, reward: reward });
                });
            }
            
            // Если ни один провайдер не сработал, используем тестовую рекламу
            if (!adShown) {
                this.showTestAd().then(resolve).catch(reject);
            }
        });
    }
    
    showTestAd() {
        return new Promise((resolve, reject) => {
            // Создаём тестовое рекламное окно
            this.createTestAdModal().then((closedByUser) => {
                if (closedByUser) {
                    reject({ success: false, error: 'Реклама закрыта пользователем' });
                    return;
                }
                
                // Рандомная награда
                const reward = this.adConfig.rewardAmount + Math.floor(Math.random() * 500);
                this.handleAdReward(reward);
                
                resolve({ 
                    success: true, 
                    reward: reward,
                    testMode: true 
                });
            });
        });
    }
    
    createTestAdModal() {
        return new Promise((resolve) => {
            // Создаём модальное окно с тестовой рекламой
            const adModal = document.createElement('div');
            adModal.className = 'ad-test-modal';
            adModal.innerHTML = `
                <div class="ad-test-content">
                    <div class="ad-test-header">
                        <h3>🎬 Тестовая реклама</h3>
                        <button class="close-test-ad">✕</button>
                    </div>
                    <div class="ad-test-body">
                        <div class="ad-test-video">
                            <div class="ad-placeholder">
                                <div class="ad-logo">📺</div>
                                <p>Тестовое рекламное видео</p>
                                <div class="ad-timer">
                                    <div class="timer-progress"></div>
                                    <span class="timer-text">5</span>
                                </div>
                            </div>
                        </div>
                        <div class="ad-test-info">
                            <p>🎁 После просмотра вы получите бонусные звёзды!</p>
                            <p class="ad-warning">Закрытие рекламы до окончания отменит награду</p>
                        </div>
                    </div>
                </div>
            `;
            
            // Стили
            adModal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.9);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: fadeIn 0.3s ease;
            `;
            
            document.body.appendChild(adModal);
            
            // Таймер рекламы
            let timeLeft = 5;
            const timerText = adModal.querySelector('.timer-text');
            const timerProgress = adModal.querySelector('.timer-progress');
            let closedByUser = false;
            
            const timer = setInterval(() => {
                timeLeft--;
                timerText.textContent = timeLeft;
                timerProgress.style.width = `${(5 - timeLeft) * 20}%`;
                
                if (timeLeft <= 0) {
                    clearInterval(timer);
                    adModal.remove();
                    resolve(false); // Реклама досмотрена
                }
            }, 1000);
            
            // Обработчик закрытия
            const closeBtn = adModal.querySelector('.close-test-ad');
            closeBtn.addEventListener('click', () => {
                closedByUser = true;
                clearInterval(timer);
                adModal.remove();
                resolve(true);
            });
            
            // Закрытие по клику вне рекламы
            adModal.addEventListener('click', (e) => {
                if (e.target === adModal) {
                    closedByUser = true;
                    clearInterval(timer);
                    adModal.remove();
                    resolve(true);
                }
            });
        });
    }
    
    handleAdReward(reward) {
        // Обновляем состояние
        this.adState.adsWatchedToday++;
        this.adState.lastAdWatch = Date.now();
        this.adState.adCooldown = true;
        
        // Сохраняем
        localStorage.setItem('adsWatchedToday', this.adState.adsWatchedToday);
        localStorage.setItem('lastAdWatch', this.adState.lastAdWatch);
        
        // Сбрасываем кулдаун через время
        setTimeout(() => {
            this.adState.adCooldown = false;
        }, this.adConfig.cooldownBetweenAds);
        
        // Обновляем кнопку
        this.updateAdButton();
        
        // Возвращаем награду
        return reward;
    }
    
    updateAdButton() {
        const adBtn = document.getElementById('watch-ad-btn');
        const adsAvailable = document.getElementById('ads-available');
        
        if (!adBtn) return;
        
        const adsLeft = this.adConfig.maxAdsPerDay - this.adState.adsWatchedToday;
        
        if (adsAvailable) {
            adsAvailable.textContent = adsLeft;
        }
        
        // Обновляем состояние кнопки
        if (adsLeft <= 0) {
            adBtn.disabled = true;
            adBtn.style.opacity = '0.5';
            adBtn.title = 'Достигнут дневной лимит рекламы';
        } else if (this.adState.adCooldown) {
            adBtn.disabled = true;
            adBtn.style.opacity = '0.7';
            
            // Показываем время до следующей рекламы
            const timeLeft = Math.ceil(
                (this.adConfig.cooldownBetweenAds - (Date.now() - this.adState.lastAdWatch)) / 1000
            );
            adBtn.title = `Подождите ${timeLeft} секунд`;
        } else {
            adBtn.disabled = false;
            adBtn.style.opacity = '1';
            adBtn.title = 'Смотреть рекламу для получения бонуса';
        }
    }
    
    resetDailyCounter() {
        const today = new Date().toDateString();
        const lastReset = localStorage.getItem('lastAdReset');
        
        if (lastReset !== today) {
            this.adState.adsWatchedToday = 0;
            localStorage.setItem('adsWatchedToday', 0);
            localStorage.setItem('lastAdReset', today);
            this.updateAdButton();
        }
    }
    
    getAdStatistics() {
        return {
            adsWatchedToday: this.adState.adsWatchedToday,
            adsLeftToday: this.adConfig.maxAdsPerDay - this.adState.adsWatchedToday,
            lastAdWatch: this.adState.lastAdWatch,
            totalEarnedFromAds: this.adState.adsWatchedToday * this.adConfig.rewardAmount
        };
    }
    
    configureProvider(provider, config) {
        if (this.providers[provider]) {
            Object.assign(this.providers[provider], config);
            
            if (config.enabled && this.providers[provider].init) {
                this.providers[provider].init();
            }
        }
    }
    
    enableTestMode(enable = true) {
        this.adConfig.testMode = enable;
    }
    
    setMaxAdsPerDay(max) {
        this.adConfig.maxAdsPerDay = max;
        this.updateAdButton();
    }
    
    setRewardAmount(amount) {
        this.adConfig.rewardAmount = amount;
    }
    
    // Методы для интеграции с игрой
    static integrateWithGame(gameInstance) {
        const adManager = new AdManager();
        
        // Добавляем метод просмотра рекламы в игру
        gameInstance.watchAd = function() {
            return adManager.showRewardedAd();
        };
        
        // Добавляем статистику рекламы
        gameInstance.getAdStats = function() {
            return adManager.getAdStatistics();
        };
        
        // Обновляем UI
        gameInstance.updateAdButton = function() {
            adManager.updateAdButton();
        };
        
        return adManager;
    }
}

// Автоматическая интеграция при загрузке
if (typeof window.game !== 'undefined') {
    window.adManager = AdManager.integrateWithGame(window.game);
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdManager;
} else {
    window.AdManager = AdManager;
}