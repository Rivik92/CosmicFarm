// Игровая логика Cosmic Clicker

class GameLogic {
    constructor(gameState) {
        this.gameState = gameState;
        this.activeBoosters = [];
        this.init();
    }
    
    init() {
        this.loadGameData();
        this.startPassiveIncome();
        this.startEnergyRecovery();
        this.startAutoSave();
    }
    
    loadGameData() {
        // Загрузка данных из localStorage
        const savedData = localStorage.getItem('cosmicClickerData');
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            Object.assign(this.gameState, parsedData);
            console.log('🎮 Игровые данные загружены');
        }
        
        // Восстановление пассивного дохода
        this.restoreOfflineIncome();
    }
    
    restoreOfflineIncome() {
        const lastPlayed = localStorage.getItem('lastPlayed');
        if (lastPlayed) {
            const now = Date.now();
            const timeDiff = Math.floor((now - parseInt(lastPlayed)) / 1000);
            
            if (timeDiff > 0) {
                // Максимум 24 часа оффлайн дохода
                const maxOfflineTime = 24 * 60 * 60; // 24 часа в секундах
                const offlineTime = Math.min(timeDiff, maxOfflineTime);
                
                // Рассчитываем доход
                const offlineIncome = Math.floor(offlineTime * this.gameState.passiveIncome);
                const energyRecovered = Math.floor(offlineTime / 30); // 1 энергия каждые 30 секунд
                
                if (offlineIncome > 0) {
                    this.gameState.stars += offlineIncome;
                    this.showNotification(`Оффлайн доход: +${offlineIncome} ⭐`, 'success');
                }
                
                if (energyRecovered > 0) {
                    this.gameState.energy = Math.min(
                        this.gameState.maxEnergy,
                        this.gameState.energy + energyRecovered
                    );
                }
            }
        }
        
        localStorage.setItem('lastPlayed', Date.now());
    }
    
    startPassiveIncome() {
        // Пассивный доход каждую секунду
        setInterval(() => {
            let income = this.gameState.passiveIncome;
            
            // Применяем активные бустеры
            this.activeBoosters.forEach(booster => {
                if (booster.type === 'passive') {
                    income = Math.floor(income * booster.multiplier);
                }
            });
            
            this.gameState.stars += income;
            this.updateUI();
        }, 1000);
    }
    
    startEnergyRecovery() {
        // Восстановление энергии каждые 30 секунд
        setInterval(() => {
            if (this.gameState.energy < this.gameState.maxEnergy) {
                this.gameState.energy++;
                this.updateUI();
            }
        }, 30000);
    }
    
    startAutoSave() {
        // Автосохранение каждые 30 секунд
        setInterval(() => {
            this.saveGameData();
        }, 30000);
    }
    
    handleClick() {
        if (this.gameState.energy <= 0) {
            return { success: false, message: 'Недостаточно энергии!' };
        }
        
        let clickValue = this.gameState.clickPower;
        
        // Применяем активные бустеры
        this.activeBoosters.forEach(booster => {
            if (booster.type === 'click') {
                clickValue = Math.floor(clickValue * booster.multiplier);
            }
        });
        
        // Обновляем состояние
        this.gameState.stars += clickValue;
        this.gameState.energy -= 1;
        this.gameState.totalClicks++;
        this.gameState.experience += Math.floor(clickValue / 10);
        
        // Проверка достижений
        this.checkClickAchievements();
        
        // Проверка уровня
        this.checkLevelUp();
        
        // Сохраняем
        this.saveGameData();
        
        return { 
            success: true, 
            value: clickValue,
            stars: this.gameState.stars,
            energy: this.gameState.energy
        };
    }
    
    checkClickAchievements() {
        const achievements = [
            { clicks: 100, reward: 500, name: 'Новичок' },
            { clicks: 500, reward: 1000, name: 'Опытный' },
            { clicks: 1000, reward: 5000, name: 'Мастер кликов' },
            { clicks: 5000, reward: 25000, name: 'Легенда' },
            { clicks: 10000, reward: 100000, name: 'Бог кликов' }
        ];
        
        achievements.forEach(achievement => {
            if (this.gameState.totalClicks === achievement.clicks) {
                this.gameState.stars += achievement.reward;
                this.gameState.achievements.push({
                    id: `clicks_${achievement.clicks}`,
                    name: achievement.name,
                    reward: achievement.reward,
                    date: new Date().toISOString()
                });
                
                return {
                    unlocked: true,
                    achievement: achievement.name,
                    reward: achievement.reward
                };
            }
        });
        
        return { unlocked: false };
    }
    
    checkLevelUp() {
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
            this.gameState.stars += reward;
            
            // Увеличиваем базовые характеристики
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
    }
    
    buyUpgrade(upgradeId) {
        const upgrades = this.getAvailableUpgrades();
        const upgrade = upgrades.find(u => u.id === upgradeId);
        
        if (!upgrade) {
            return { success: false, message: 'Улучшение не найдено' };
        }
        
        if (this.gameState.stars < upgrade.cost) {
            return { success: false, message: 'Недостаточно звёзд' };
        }
        
        if (this.gameState.upgrades.includes(upgradeId)) {
            return { success: false, message: 'Улучшение уже куплено' };
        }
        
        // Покупка
        this.gameState.stars -= upgrade.cost;
        this.gameState.upgrades.push(upgradeId);
        
        // Применяем эффект
        this.applyUpgradeEffect(upgrade);
        
        // Добавляем опыт
        this.gameState.experience += upgrade.cost / 10;
        
        // Проверяем достижения улучшений
        this.checkUpgradeAchievements();
        
        this.saveGameData();
        
        return {
            success: true,
            upgrade: upgrade.name,
            cost: upgrade.cost
        };
    }
    
    getAvailableUpgrades() {
        return [
            { id: 1, name: 'Базовый клик', cost: 100, type: 'click', value: 1 },
            { id: 2, name: 'Двойной клик', cost: 500, type: 'click', multiplier: 2 },
            { id: 3, name: 'Тройной клик', cost: 2000, type: 'click', multiplier: 3 },
            { id: 4, name: 'Энергия I', cost: 300, type: 'energy', value: 20 },
            { id: 5, name: 'Энергия II', cost: 1000, type: 'energy', value: 50 },
            { id: 6, name: 'Энергия III', cost: 5000, type: 'energy', value: 100 },
            { id: 7, name: 'Пассивный доход I', cost: 1000, type: 'passive', value: 5 },
            { id: 8, name: 'Пассивный доход II', cost: 5000, type: 'passive', value: 15 },
            { id: 9, name: 'Пассивный доход III', cost: 20000, type: 'passive', value: 30 },
            { id: 10, name: 'Критический удар', cost: 10000, type: 'critical', chance: 0.1, multiplier: 5 }
        ];
    }
    
    applyUpgradeEffect(upgrade) {
        switch(upgrade.type) {
            case 'click':
                if (upgrade.value) {
                    this.gameState.clickPower += upgrade.value;
                }
                if (upgrade.multiplier) {
                    this.gameState.clickPower *= upgrade.multiplier;
                }
                break;
                
            case 'energy':
                this.gameState.maxEnergy += upgrade.value;
                break;
                
            case 'passive':
                this.gameState.passiveIncome += upgrade.value;
                break;
                
            case 'critical':
                // Добавляем шанс критического удара
                if (!this.gameState.criticalChance) {
                    this.gameState.criticalChance = 0;
                }
                this.gameState.criticalChance += upgrade.chance;
                this.gameState.criticalMultiplier = upgrade.multiplier;
                break;
        }
    }
    
    checkUpgradeAchievements() {
        const upgradeCount = this.gameState.upgrades.length;
        const achievements = [
            { count: 5, reward: 1000, name: 'Коллекционер' },
            { count: 10, reward: 5000, name: 'Улучшатель' },
            { count: 15, reward: 20000, name: 'Инженер' },
            { count: 20, reward: 100000, name: 'Изобретатель' }
        ];
        
        achievements.forEach(achievement => {
            if (upgradeCount === achievement.count) {
                if (!this.gameState.achievements.some(a => a.id === `upgrades_${achievement.count}`)) {
                    this.gameState.stars += achievement.reward;
                    this.gameState.achievements.push({
                        id: `upgrades_${achievement.count}`,
                        name: achievement.name,
                        reward: achievement.reward,
                        date: new Date().toISOString()
                    });
                    
                    return {
                        unlocked: true,
                        achievement: achievement.name,
                        reward: achievement.reward
                    };
                }
            }
        });
    }
    
    activateBooster(boosterId) {
        const boosters = this.getAvailableBoosters();
        const booster = boosters.find(b => b.id === boosterId);
        
        if (!booster) {
            return { success: false, message: 'Бустер не найден' };
        }
        
        // Проверяем, есть ли уже такой бустер
        const existingBooster = this.activeBoosters.find(b => b.id === boosterId);
        if (existingBooster) {
            return { success: false, message: 'Бустер уже активен' };
        }
        
        // Добавляем бустер
        this.activeBoosters.push({
            ...booster,
            activatedAt: Date.now(),
            expiresAt: Date.now() + booster.duration
        });
        
        // Запускаем таймер удаления
        setTimeout(() => {
            this.removeBooster(boosterId);
        }, booster.duration);
        
        return {
            success: true,
            booster: booster.name,
            duration: booster.duration
        };
    }
    
    getAvailableBoosters() {
        return [
            { id: '2x_click_1h', name: 'x2 Клики', type: 'click', multiplier: 2, duration: 3600000 },
            { id: '3x_click_30m', name: 'x3 Клики', type: 'click', multiplier: 3, duration: 1800000 },
            { id: '2x_passive_2h', name: 'x2 Пассивный доход', type: 'passive', multiplier: 2, duration: 7200000 },
            { id: 'infinite_energy_15m', name: 'Бесконечная энергия', type: 'energy', duration: 900000 }
        ];
    }
    
    removeBooster(boosterId) {
        this.activeBoosters = this.activeBoosters.filter(b => b.id !== boosterId);
        this.updateUI();
    }
    
    getActiveBoosters() {
        // Фильтруем просроченные бустеры
        const now = Date.now();
        this.activeBoosters = this.activeBoosters.filter(booster => booster.expiresAt > now);
        
        return this.activeBoosters.map(booster => ({
            ...booster,
            timeLeft: Math.ceil((booster.expiresAt - now) / 1000)
        }));
    }
    
    watchAd() {
        // Симуляция просмотра рекламы
        return new Promise((resolve) => {
            setTimeout(() => {
                const reward = 500 + Math.floor(Math.random() * 500);
                this.gameState.stars += reward;
                this.gameState.adsWatchedToday++;
                
                // Ограничение на рекламу в день
                if (this.gameState.adsWatchedToday >= 10) {
                    this.gameState.adsAvailable = false;
                }
                
                this.saveGameData();
                
                resolve({
                    success: true,
                    reward: reward,
                    adsWatchedToday: this.gameState.adsWatchedToday
                });
            }, 2000);
        });
    }
    
    getLeaderboard() {
        // В реальном приложении здесь будет запрос к серверу
        return [
            { rank: 1, name: 'Космонавт', stars: 1500000 },
            { rank: 2, name: 'Звездочёт', stars: 1250000 },
            { rank: 3, name: 'Галактика', stars: 1000000 },
            { rank: 4, name: 'Нова', stars: 850000 },
            { rank: 5, name: 'Пульсар', stars: 700000 }
        ];
    }
    
    getDailyReward() {
        const today = new Date().toDateString();
        const lastReward = localStorage.getItem('lastDailyReward');
        
        if (lastReward === today) {
            return { 
                success: false, 
                message: 'Ежедневная награда уже получена сегодня' 
            };
        }
        
        // Награда зависит от текущего уровня
        const reward = this.gameState.userLevel * 100;
        this.gameState.stars += reward;
        
        localStorage.setItem('lastDailyReward', today);
        this.saveGameData();
        
        return {
            success: true,
            reward: reward,
            streak: this.getRewardStreak()
        };
    }
    
    getRewardStreak() {
        // Логика подсчета серии ежедневных наград
        const today = new Date();
        const lastRewardDate = localStorage.getItem('lastDailyRewardDate');
        
        if (!lastRewardDate) return 1;
        
        const lastDate = new Date(lastRewardDate);
        const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
            const streak = parseInt(localStorage.getItem('rewardStreak') || '1') + 1;
            localStorage.setItem('rewardStreak', streak);
            return streak;
        } else if (diffDays > 1) {
            localStorage.setItem('rewardStreak', '1');
            return 1;
        }
        
        return parseInt(localStorage.getItem('rewardStreak') || '1');
    }
    
    saveGameData() {
        const gameData = {
            stars: this.gameState.stars,
            energy: this.gameState.energy,
            maxEnergy: this.gameState.maxEnergy,
            clickPower: this.gameState.clickPower,
            passiveIncome: this.gameState.passiveIncome,
            totalClicks: this.gameState.totalClicks,
            upgrades: this.gameState.upgrades,
            achievements: this.gameState.achievements,
            inventory: this.gameState.inventory,
            userLevel: this.gameState.userLevel,
            experience: this.gameState.experience,
            adsWatchedToday: this.gameState.adsWatchedToday,
            lastPlayed: Date.now()
        };
        
        localStorage.setItem('cosmicClickerData', JSON.stringify(gameData));
        localStorage.setItem('lastPlayed', Date.now());
        
        return { success: true };
    }
    
    exportSave() {
        const gameData = this.saveGameData();
        const dataStr = JSON.stringify(gameData);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        return dataUri;
    }
    
    importSave(data) {
        try {
            const parsedData = JSON.parse(data);
            Object.assign(this.gameState, parsedData);
            this.saveGameData();
            
            return { success: true };
        } catch (error) {
            return { success: false, error: 'Некорректные данные сохранения' };
        }
    }
    
    resetGame() {
        const confirmReset = confirm('Вы уверены, что хотите сбросить прогресс? Это действие нельзя отменить.');
        
        if (confirmReset) {
            this.gameState = {
                stars: 1000,
                energy: 100,
                maxEnergy: 100,
                clickPower: 1,
                passiveIncome: 5,
                totalClicks: 0,
                upgrades: [],
                achievements: [],
                inventory: {},
                userLevel: 1,
                experience: 0,
                adsWatchedToday: 0
            };
            
            localStorage.removeItem('cosmicClickerData');
            localStorage.removeItem('lastPlayed');
            localStorage.removeItem('lastDailyReward');
            localStorage.removeItem('rewardStreak');
            
            return { success: true };
        }
        
        return { success: false };
    }
    
    updateUI() {
        // Эта функция будет вызываться из UI менеджера
        if (window.uiManager) {
            window.uiManager.updateGameState(this.gameState);
        }
    }
    
    showNotification(message, type = 'info') {
        if (window.uiManager) {
            window.uiManager.showNotification(message, type);
        }
    }
}

// Экспорт класса
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameLogic;
} else {
    window.GameLogic = GameLogic;
}