// Основной файл приложения Cosmic Clicker

// Инициализация приложения
class CosmicClicker {
    constructor() {
        this.gameState = {
            stars: parseInt(localStorage.getItem('stars')) || 1000,
            energy: parseInt(localStorage.getItem('energy')) || 100,
            maxEnergy: parseInt(localStorage.getItem('maxEnergy')) || 100,
            clickPower: parseInt(localStorage.getItem('clickPower')) || 1,
            passiveIncome: parseInt(localStorage.getItem('passiveIncome')) || 5,
            totalClicks: parseInt(localStorage.getItem('totalClicks')) || 0,
            upgrades: JSON.parse(localStorage.getItem('upgrades')) || [],
            achievements: JSON.parse(localStorage.getItem('achievements')) || [],
            inventory: JSON.parse(localStorage.getItem('inventory')) || {},
            lastUpdate: parseInt(localStorage.getItem('lastUpdate')) || Date.now(),
            adsWatchedToday: parseInt(localStorage.getItem('adsWatchedToday')) || 0,
            userLevel: parseInt(localStorage.getItem('userLevel')) || 1,
            experience: parseInt(localStorage.getItem('experience')) || 0
        };
        
        this.init();
    }
    
    init() {
        // Инициализация Telegram Web App
        if (typeof window.Telegram !== 'undefined') {
            window.Telegram.WebApp.ready();
            window.Telegram.WebApp.expand();
        }
        
        // Загрузка интерфейса
        this.loadUI();
        this.setupEventListeners();
        this.updateUI();
        
        // Восстановление пассивного дохода
        this.restorePassiveIncome();
        
        // Запуск игрового цикла
        this.startGameLoop();
        
        console.log('🚀 Cosmic Clicker запущен!');
    }
    
    loadUI() {
        // Загрузка улучшений
        this.loadUpgrades();
        
        // Загрузка магазина
        this.loadShopItems();
        
        // Обновление информации о пользователе
        this.updateUserInfo();
    }
    
    setupEventListeners() {
        // Клик по планете
        const clickPlanet = document.getElementById('click-planet');
        const clickBtn = document.getElementById('click-btn');
        
        const handleClick = (e) => {
            if (this.gameState.energy <= 0) {
                this.showNotification('Недостаточно энергии!', 'error');
                return;
            }
            
            // Обновляем состояние
            this.gameState.stars += this.gameState.clickPower;
            this.gameState.energy -= 1;
            this.gameState.totalClicks += 1;
            this.gameState.experience += 1;
            
            // Проверка уровня
            this.checkLevelUp();
            
            // Создаём эффект клика
            this.createClickEffect(e);
            
            // Вибрация (если поддерживается)
            if (navigator.vibrate) navigator.vibrate(50);
            
            // Обновляем UI
            this.updateUI();
            
            // Сохраняем состояние
            this.saveGameState();
        };
        
        clickPlanet.addEventListener('click', handleClick);
        clickBtn.addEventListener('click', handleClick);
        
        // Навигация
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.openModal(tab);
            });
        });
        
        // Закрытие модальных окон
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.dataset.modal;
                this.closeModal(modal);
            });
        });
        
        // Оверлей для закрытия модалок
        document.getElementById('modal-overlay').addEventListener('click', () => {
            this.closeAllModals();
        });
        
        // Просмотр рекламы
        document.getElementById('watch-ad-btn').addEventListener('click', () => {
            this.watchAd();
        });
        
        // Категории магазина
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.dataset.category;
                this.changeShopCategory(category);
            });
        });
        
        // Сохранение при закрытии
        window.addEventListener('beforeunload', () => {
            this.saveGameState();
        });
        
        // Автосохранение каждые 30 секунд
        setInterval(() => {
            this.saveGameState();
        }, 30000);
    }
    
    createClickEffect(event) {
        const effect = document.getElementById('click-effect');
        const planet = document.getElementById('click-planet');
        const rect = planet.getBoundingClientRect();
        
        // Позиция эффекта
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        effect.style.left = `${x}px`;
        effect.style.top = `${y}px`;
        
        // Анимация
        effect.style.opacity = '1';
        effect.style.transform = 'scale(0)';
        
        setTimeout(() => {
            effect.style.transform = 'scale(3)';
            effect.style.opacity = '0';
        }, 10);
        
        // Создаём всплывающее число
        this.createFloatingNumber(x, y, this.gameState.clickPower);
    }
    
    createFloatingNumber(x, y, value) {
        const number = document.createElement('div');
        number.className = 'float-number';
        number.textContent = `+${value} ⭐`;
        number.style.left = `${x}px`;
        number.style.top = `${y}px`;
        
        document.querySelector('.planet-container').appendChild(number);
        
        // Удаляем через 1 секунду
        setTimeout(() => {
            number.remove();
        }, 1000);
    }
    
    updateUI() {
        // Обновляем ресурсы
        document.getElementById('stars').textContent = this.formatNumber(this.gameState.stars);
        document.getElementById('energy').textContent = `${this.gameState.energy}/${this.gameState.maxEnergy}`;
        document.getElementById('click-value').textContent = this.gameState.clickPower;
        document.getElementById('click-power').textContent = this.gameState.clickPower;
        document.getElementById('passive-income').textContent = `${this.gameState.passiveIncome}/сек`;
        document.getElementById('total-clicks').textContent = this.formatNumber(this.gameState.totalClicks);
        document.getElementById('user-level').textContent = this.gameState.userLevel;
        
        // Обновляем прогресс уровня
        this.updateLevelProgress();
        
        // Обновляем доступность рекламы
        this.updateAdsAvailability();
    }
    
    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }
    
    restorePassiveIncome() {
        const now = Date.now();
        const timeDiff = (now - this.gameState.lastUpdate) / 1000;
        
        if (timeDiff > 0) {
            // Пассивный доход
            const earned = Math.floor(timeDiff * this.gameState.passiveIncome);
            if (earned > 0) {
                this.gameState.stars += earned;
                this.showNotification(`Пассивный доход: +${earned} ⭐`, 'success');
            }
            
            // Восстановление энергии
            const energyRecovered = Math.floor(timeDiff / 30); // 1 энергия каждые 30 секунд
            if (energyRecovered > 0) {
                this.gameState.energy = Math.min(
                    this.gameState.maxEnergy,
                    this.gameState.energy + energyRecovered
                );
            }
            
            this.gameState.lastUpdate = now;
            this.updateUI();
        }
    }
    
    startGameLoop() {
        // Обновляем пассивный доход каждую секунду
        setInterval(() => {
            this.gameState.stars += this.gameState.passiveIncome;
            this.gameState.lastUpdate = Date.now();
            this.updateUI();
        }, 1000);
        
        // Восстановление энергии каждые 30 секунд
        setInterval(() => {
            if (this.gameState.energy < this.gameState.maxEnergy) {
                this.gameState.energy += 1;
                this.updateUI();
            }
        }, 30000);
    }
    
    loadUpgrades() {
        const upgradesList = document.getElementById('upgrades-list');
        
        const upgrades = [
            { id: 1, name: 'Улучшенный клик', description: '+1 к силе клика', cost: 100, power: 1 },
            { id: 2, name: 'Двойной клик', description: '×2 сила клика', cost: 500, multiplier: 2 },
            { id: 3, name: 'Энергетический щит', description: '+20 к максимальной энергии', cost: 1000, energy: 20 },
            { id: 4, name: 'Солнечная батарея', description: '+5 к пассивному доходу', cost: 2000, passive: 5 },
            { id: 5, name: 'Квантовый ускоритель', description: '×3 сила клика', cost: 5000, multiplier: 3 },
            { id: 6, name: 'Галактический реактор', description: '+50 к максимальной энергии', cost: 10000, energy: 50 },
            { id: 7, name: 'Звездный генератор', description: '+20 к пассивному доходу', cost: 20000, passive: 20 },
            { id: 8, name: 'Черная дыра', description: '×5 сила клика', cost: 50000, multiplier: 5 }
        ];
        
        upgradesList.innerHTML = '';
        
        upgrades.forEach(upgrade => {
            const isBought = this.gameState.upgrades.includes(upgrade.id);
            const canAfford = this.gameState.stars >= upgrade.cost;
            
            const item = document.createElement('div');
            item.className = `upgrade-item ${isBought ? 'bought' : ''} ${!isBought && !canAfford ? 'locked' : ''}`;
            item.innerHTML = `
                <h4>${upgrade.name}</h4>
                <p>${upgrade.description}</p>
                <div class="upgrade-footer">
                    <span class="upgrade-cost">${upgrade.cost} ⭐</span>
                    <button class="buy-upgrade-btn" 
                            ${isBought || !canAfford ? 'disabled' : ''} 
                            data-id="${upgrade.id}">
                        ${isBought ? 'Куплено' : 'Купить'}
                    </button>
                </div>
            `;
            
            // Обработчик покупки
            const buyBtn = item.querySelector('.buy-upgrade-btn');
            if (!buyBtn.disabled) {
                buyBtn.addEventListener('click', () => {
                    this.buyUpgrade(upgrade.id);
                });
            }
            
            upgradesList.appendChild(item);
        });
    }
    
    buyUpgrade(upgradeId) {
        const upgrades = [
            { id: 1, cost: 100, power: 1 },
            { id: 2, cost: 500, multiplier: 2 },
            { id: 3, cost: 1000, energy: 20 },
            { id: 4, cost: 2000, passive: 5 },
            { id: 5, cost: 5000, multiplier: 3 },
            { id: 6, cost: 10000, energy: 50 },
            { id: 7, cost: 20000, passive: 20 },
            { id: 8, cost: 50000, multiplier: 5 }
        ];
        
        const upgrade = upgrades.find(u => u.id === upgradeId);
        
        if (!upgrade) {
            this.showNotification('Улучшение не найдено', 'error');
            return;
        }
        
        if (this.gameState.stars < upgrade.cost) {
            this.showNotification('Недостаточно звёзд!', 'error');
            return;
        }
        
        if (this.gameState.upgrades.includes(upgradeId)) {
            this.showNotification('Улучшение уже куплено!', 'warning');
            return;
        }
        
        // Покупка
        this.gameState.stars -= upgrade.cost;
        this.gameState.upgrades.push(upgradeId);
        
        // Применяем улучшение
        if (upgrade.power) this.gameState.clickPower += upgrade.power;
        if (upgrade.multiplier) this.gameState.clickPower *= upgrade.multiplier;
        if (upgrade.energy) this.gameState.maxEnergy += upgrade.energy;
        if (upgrade.passive) this.gameState.passiveIncome += upgrade.passive;
        
        // Добавляем опыт
        this.gameState.experience += upgrade.cost / 10;
        
        this.showNotification(`Куплено улучшение!`, 'success');
        this.updateUI();
        this.loadUpgrades();
        this.saveGameState();
    }
    
    loadShopItems() {
        const shopItems = document.getElementById('shop-items');
        
        const items = {
            energy: [
                { id: 'energy_small', name: '⚡ Малая энергия', description: 'Восстанови 25 энергии', cost: 50 },
                { id: 'energy_medium', name: '⚡ Средняя энергия', description: 'Восстанови 50 энергии', cost: 90 },
                { id: 'energy_large', name: '⚡ Большая энергия', description: 'Восстанови 100 энергии', cost: 160 }
            ],
            boosters: [
                { id: 'booster_2x', name: '🚀 Ускоритель x2', description: '×2 к доходу на 1 час', cost: 200 },
                { id: 'booster_3x', name: '🚀 Ускоритель x3', description: '×3 к доходу на 30 минут', cost: 300 },
                { id: 'booster_5x', name: '🚀 Ускоритель x5', description: '×5 к доходу на 15 минут', cost: 500 }
            ],
            artifacts: [
                { id: 'artifact_star', name: '💎 Звездный артефакт', description: '+10% к пассивному доходу', cost: 1000 },
                { id: 'artifact_energy', name: '💎 Энергетический артефакт', description: '+20% к максимальной энергии', cost: 2000 },
                { id: 'artifact_click', name: '💎 Кликовый артефакт', description: '+50% к силе клика', cost: 5000 }
            ]
        };
        
        // Показываем энергию по умолчанию
        this.renderShopCategory(items.energy);
    }
    
    renderShopCategory(categoryItems) {
        const shopItems = document.getElementById('shop-items');
        shopItems.innerHTML = '';
        
        categoryItems.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'shop-item';
            itemDiv.innerHTML = `
                <h3>${item.name}</h3>
                <p>${item.description}</p>
                <button class="buy-btn" data-id="${item.id}" data-cost="${item.cost}">
                    Купить за ${item.cost} ⭐
                </button>
            `;
            
            // Обработчик покупки
            const buyBtn = itemDiv.querySelector('.buy-btn');
            buyBtn.addEventListener('click', () => {
                this.buyItem(item.id, item.cost, item.name);
            });
            
            shopItems.appendChild(itemDiv);
        });
    }
    
    changeShopCategory(category) {
        // Обновляем активную кнопку
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
        
        // Загружаем категорию
        const items = {
            energy: [
                { id: 'energy_small', name: '⚡ Малая энергия', description: 'Восстанови 25 энергии', cost: 50 },
                { id: 'energy_medium', name: '⚡ Средняя энергия', description: 'Восстанови 50 энергии', cost: 90 },
                { id: 'energy_large', name: '⚡ Большая энергия', description: 'Восстанови 100 энергии', cost: 160 }
            ],
            boosters: [
                { id: 'booster_2x', name: '🚀 Ускоритель x2', description: '×2 к доходу на 1 час', cost: 200 },
                { id: 'booster_3x', name: '🚀 Ускоритель x3', description: '×3 к доходу на 30 минут', cost: 300 },
                { id: 'booster_5x', name: '🚀 Ускоритель x5', description: '×5 к доходу на 15 минут', cost: 500 }
            ],
            artifacts: [
                { id: 'artifact_star', name: '💎 Звездный артефакт', description: '+10% к пассивному доходу', cost: 1000 },
                { id: 'artifact_energy', name: '💎 Энергетический артефакт', description: '+20% к максимальной энергии', cost: 2000 },
                { id: 'artifact_click', name: '💎 Кликовый артефакт', description: '+50% к силе клика', cost: 5000 }
            ]
        };
        
        if (items[category]) {
            this.renderShopCategory(items[category]);
        }
    }
    
    buyItem(itemId, cost, name) {
        if (this.gameState.stars < cost) {
            this.showNotification('Недостаточно звёзд!', 'error');
            return;
        }
        
        // Покупка
        this.gameState.stars -= cost;
        
        // Применяем эффект предмета
        switch(itemId) {
            case 'energy_small':
                this.gameState.energy = Math.min(this.gameState.maxEnergy, this.gameState.energy + 25);
                break;
            case 'energy_medium':
                this.gameState.energy = Math.min(this.gameState.maxEnergy, this.gameState.energy + 50);
                break;
            case 'energy_large':
                this.gameState.energy = Math.min(this.gameState.maxEnergy, this.gameState.energy + 100);
                break;
            case 'booster_2x':
                this.applyBooster(2, 3600000); // 1 час
                break;
            case 'booster_3x':
                this.applyBooster(3, 1800000); // 30 минут
                break;
            case 'booster_5x':
                this.applyBooster(5, 900000); // 15 минут
                break;
            case 'artifact_star':
                this.gameState.passiveIncome = Math.floor(this.gameState.passiveIncome * 1.1);
                break;
            case 'artifact_energy':
                this.gameState.maxEnergy = Math.floor(this.gameState.maxEnergy * 1.2);
                break;
            case 'artifact_click':
                this.gameState.clickPower = Math.floor(this.gameState.clickPower * 1.5);
                break;
        }
        
        // Добавляем в инвентарь
        if (!this.gameState.inventory[itemId]) {
            this.gameState.inventory[itemId] = 0;
        }
        this.gameState.inventory[itemId]++;
        
        // Добавляем опыт
        this.gameState.experience += cost / 20;
        
        this.showNotification(`Куплено: ${name}`, 'success');
        this.updateUI();
        this.saveGameState();
    }
    
    applyBooster(multiplier, duration) {
        const originalPower = this.gameState.clickPower;
        this.gameState.clickPower = Math.floor(this.gameState.clickPower * multiplier);
        
        this.showNotification(`Активирован бустер x${multiplier}!`, 'success');
        
        // Возвращаем оригинальную силу через время
        setTimeout(() => {
            this.gameState.clickPower = originalPower;
            this.showNotification('Действие бустера закончилось');
            this.updateUI();
        }, duration);
    }
    
    watchAd() {
        if (this.gameState.adsWatchedToday >= 5) {
            this.showNotification('Лимит рекламы на сегодня исчерпан', 'warning');
            return;
        }
        
        if (this.gameState.energy < 10) {
            this.showNotification('Нужно минимум 10 энергии для просмотра рекламы', 'error');
            return;
        }
        
        this.showNotification('Реклама загружается...', 'info');
        
        // Симуляция просмотра рекламы (в реальном приложении здесь будет интеграция с рекламной сетью)
        setTimeout(() => {
            const reward = 500 + Math.floor(Math.random() * 500); // 500-1000 звёзд
            this.gameState.stars += reward;
            this.gameState.energy -= 10;
            this.gameState.adsWatchedToday++;
            this.gameState.experience += 100;
            
            this.showNotification(`Вы получили ${reward} ⭐ за просмотр рекламы!`, 'success');
            this.updateUI();
            this.saveGameState();
            
            // Проверяем достижения
            this.checkAchievements();
        }, 2000);
    }
    
    updateAdsAvailability() {
        const adsAvailable = 5 - this.gameState.adsWatchedToday;
        document.getElementById('ads-available').textContent = adsAvailable;
        
        const adBtn = document.getElementById('watch-ad-btn');
        if (adsAvailable <= 0) {
            adBtn.disabled = true;
            adBtn.style.opacity = '0.5';
        } else {
            adBtn.disabled = false;
            adBtn.style.opacity = '1';
        }
    }
    
    updateUserInfo() {
        // Здесь будет интеграция с Telegram API
        const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
        
        if (user) {
            document.getElementById('username').textContent = user.first_name || 'Космический Исследователь';
            document.getElementById('user-avatar').textContent = user.first_name ? user.first_name[0].toUpperCase() : '👤';
        }
    }
    
    updateLevelProgress() {
        const expNeeded = this.gameState.userLevel * 1000;
        const progress = (this.gameState.experience / expNeeded) * 100;
        
        // Можно добавить прогресс-бар в будущем
        console.log(`Уровень ${this.gameState.userLevel}, опыт: ${this.gameState.experience}/${expNeeded} (${progress.toFixed(1)}%)`);
    }
    
    checkLevelUp() {
        const expNeeded = this.gameState.userLevel * 1000;
        
        if (this.gameState.experience >= expNeeded) {
            this.gameState.userLevel++;
            this.gameState.experience -= expNeeded;
            
            // Награда за уровень
            const reward = this.gameState.userLevel * 1000;
            this.gameState.stars += reward;
            
            this.showNotification(`🎉 Новый уровень! Получено ${reward} ⭐`, 'success');
            this.updateUI();
        }
    }
    
    checkAchievements() {
        const achievements = [
            { id: 'first_ad', condition: () => this.gameState.adsWatchedToday >= 1, reward: 1000, name: 'Первый просмотр' },
            { id: 'clicks_100', condition: () => this.gameState.totalClicks >= 100, reward: 500, name: '100 кликов' },
            { id: 'clicks_1000', condition: () => this.gameState.totalClicks >= 1000, reward: 5000, name: '1000 кликов' },
            { id: 'stars_10000', condition: () => this.gameState.stars >= 10000, reward: 10000, name: '10,000 звёзд' }
        ];
        
        achievements.forEach(achievement => {
            if (achievement.condition() && !this.gameState.achievements.includes(achievement.id)) {
                this.gameState.achievements.push(achievement.id);
                this.gameState.stars += achievement.reward;
                
                this.showNotification(`🏆 Достижение: ${achievement.name}! +${achievement.reward} ⭐`, 'success');
            }
        });
    }
    
    openModal(modalName) {
        // Закрываем все модалки
        this.closeAllModals();
        
        // Открываем нужную модалку
        const modal = document.getElementById(`${modalName}-modal`);
        const overlay = document.getElementById('modal-overlay');
        
        if (modal && overlay) {
            modal.classList.add('active');
            overlay.style.display = 'block';
            
            // Обновляем контент если нужно
            if (modalName === 'upgrades') {
                this.loadUpgrades();
            }
        }
    }
    
    closeModal(modalName) {
        const modal = document.getElementById(`${modalName}-modal`);
        const overlay = document.getElementById('modal-overlay');
        
        if (modal) {
            modal.classList.remove('active');
        }
        
        // Проверяем, есть ли ещё открытые модалки
        const openModals = document.querySelectorAll('.modal.active');
        if (openModals.length === 0) {
            overlay.style.display = 'none';
        }
    }
    
    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
        document.getElementById('modal-overlay').style.display = 'none';
    }
    
    showNotification(message, type = 'info') {
        const notifications = document.getElementById('notifications');
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        notifications.appendChild(notification);
        
        // Автоматическое удаление через 3 секунды
        setTimeout(() => {
            notification.style.animation = 'slideDown 0.3s ease';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
    
    saveGameState() {
        // Сохраняем в localStorage
        localStorage.setItem('stars', this.gameState.stars);
        localStorage.setItem('energy', this.gameState.energy);
        localStorage.setItem('maxEnergy', this.gameState.maxEnergy);
        localStorage.setItem('clickPower', this.gameState.clickPower);
        localStorage.setItem('passiveIncome', this.gameState.passiveIncome);
        localStorage.setItem('totalClicks', this.gameState.totalClicks);
        localStorage.setItem('upgrades', JSON.stringify(this.gameState.upgrades));
        localStorage.setItem('achievements', JSON.stringify(this.gameState.achievements));
        localStorage.setItem('inventory', JSON.stringify(this.gameState.inventory));
        localStorage.setItem('lastUpdate', this.gameState.lastUpdate);
        localStorage.setItem('adsWatchedToday', this.gameState.adsWatchedToday);
        localStorage.setItem('userLevel', this.gameState.userLevel);
        localStorage.setItem('experience', this.gameState.experience);
        
        console.log('💾 Игра сохранена');
    }
}

// Запуск игры при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
    window.game = new CosmicClicker();
});