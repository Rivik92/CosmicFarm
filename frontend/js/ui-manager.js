// Менеджер пользовательского интерфейса Cosmic Clicker

class UIManager {
    constructor(gameLogic) {
        this.gameLogic = gameLogic;
        this.currentModal = null;
        this.init();
    }
    
    init() {
        this.cacheElements();
        this.setupEventListeners();
        this.updateGameState(this.gameLogic.gameState);
        this.updateAdsCounter();
        
        // Загрузка улучшений
        this.loadUpgrades();
        
        // Загрузка магазина
        this.loadShopItems();
    }
    
    cacheElements() {
        // Основные элементы
        this.elements = {
            stars: document.getElementById('stars'),
            energy: document.getElementById('energy'),
            clickPower: document.getElementById('click-power'),
            clickValue: document.getElementById('click-value'),
            passiveIncome: document.getElementById('passive-income'),
            totalClicks: document.getElementById('total-clicks'),
            userLevel: document.getElementById('user-level'),
            username: document.getElementById('username'),
            userAvatar: document.getElementById('user-avatar'),
            
            // Кнопки
            clickPlanet: document.getElementById('click-planet'),
            clickButton: document.getElementById('click-btn'),
            
            // Модальные окна
            modalOverlay: document.getElementById('modal-overlay'),
            upgradesModal: document.getElementById('upgrades-modal'),
            shopModal: document.getElementById('shop-modal'),
            
            // Списки
            upgradesList: document.getElementById('upgrades-list'),
            shopItems: document.getElementById('shop-items'),
            
            // Реклама
            watchAdBtn: document.getElementById('watch-ad-btn'),
            adsAvailable: document.getElementById('ads-available'),
            
            // Уведомления
            notifications: document.getElementById('notifications')
        };
    }
    
    setupEventListeners() {
        // Клик по планете
        this.elements.clickPlanet.addEventListener('click', (e) => {
            this.handleClick(e);
        });
        
        // Клик по кнопке
        this.elements.clickButton.addEventListener('click', (e) => {
            this.handleClick(e);
        });
        
        // Навигационные кнопки
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.openModal(btn.dataset.tab);
            });
        });
        
        // Закрытие модальных окон
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeModal(btn.dataset.modal);
            });
        });
        
        // Клик по оверлею
        this.elements.modalOverlay.addEventListener('click', () => {
            this.closeAllModals();
        });
        
        // Категории магазина
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.changeShopCategory(e.target.dataset.category);
            });
        });
        
        // Просмотр рекламы
        this.elements.watchAdBtn.addEventListener('click', () => {
            this.watchAd();
        });
        
        // Клавиша Escape для закрытия модалок
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
        
        // Обработка кликов по улучшениям (делегирование)
        this.elements.upgradesList.addEventListener('click', (e) => {
            const buyBtn = e.target.closest('.buy-upgrade-btn');
            if (buyBtn && !buyBtn.disabled) {
                this.buyUpgrade(buyBtn.dataset.id);
            }
        });
        
        // Обработка кликов по товарам магазина
        this.elements.shopItems.addEventListener('click', (e) => {
            const buyBtn = e.target.closest('.buy-btn');
            if (buyBtn) {
                this.buyShopItem(buyBtn.dataset.id, buyBtn.dataset.cost, buyBtn.dataset.name);
            }
        });
    }
    
    handleClick(event) {
        const result = this.gameLogic.handleClick();
        
        if (result.success) {
            // Создаём эффект клика
            this.createClickEffect(event);
            
            // Создаём всплывающее число
            this.createFloatingNumber(event, result.value);
            
            // Обновляем UI
            this.updateResources(result);
            
            // Вибрация
            this.vibrate();
            
            // Анимация планеты
            this.animatePlanet();
        } else {
            this.showNotification(result.message, 'error');
        }
    }
    
    createClickEffect(event) {
        const effect = document.getElementById('click-effect');
        const planet = this.elements.clickPlanet;
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
    }
    
    createFloatingNumber(event, value) {
        const planet = this.elements.clickPlanet;
        const rect = planet.getBoundingClientRect();
        
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
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
    
    animatePlanet() {
        const planet = this.elements.clickPlanet;
        
        // Анимация нажатия
        planet.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
            planet.style.transform = 'scale(1)';
        }, 100);
        
        // Создаём частицы
        this.createParticles();
    }
    
    createParticles() {
        const planet = this.elements.clickPlanet;
        const particles = planet.querySelector('.particles');
        
        // Создаём несколько частиц
        for (let i = 0; i < 5; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.cssText = `
                position: absolute;
                width: 4px;
                height: 4px;
                background: ${i % 2 === 0 ? '#00d4ff' : '#ffd700'};
                border-radius: 50%;
                pointer-events: none;
            `;
            
            // Случайная позиция
            const angle = Math.random() * Math.PI * 2;
            const distance = 80 + Math.random() * 40;
            const x = Math.cos(angle) * distance;
            const y = Math.sin(angle) * distance;
            
            particle.style.left = `calc(50% + ${x}px)`;
            particle.style.top = `calc(50% + ${y}px)`;
            
            particles.appendChild(particle);
            
            // Анимация
            particle.animate([
                { 
                    transform: 'translate(0, 0) scale(1)',
                    opacity: 1 
                },
                { 
                    transform: `translate(${x * 2}px, ${y * 2}px) scale(0)`,
                    opacity: 0 
                }
            ], {
                duration: 1000,
                easing: 'ease-out'
            });
            
            // Удаляем через 1 секунду
            setTimeout(() => {
                particle.remove();
            }, 1000);
        }
    }
    
    vibrate() {
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }
    
    updateResources(result) {
        this.elements.stars.textContent = this.formatNumber(result.stars);
        this.elements.energy.textContent = `${result.energy}/${this.gameLogic.gameState.maxEnergy}`;
        this.elements.clickValue.textContent = this.gameLogic.gameState.clickPower;
        
        // Анимация изменения ресурсов
        this.animateResourceChange('stars', result.stars);
    }
    
    animateResourceChange(resource, newValue) {
        const element = this.elements[resource];
        if (!element) return;
        
        element.classList.add('bounce');
        
        setTimeout(() => {
            element.classList.remove('bounce');
        }, 300);
    }
    
    updateGameState(gameState) {
        this.elements.stars.textContent = this.formatNumber(gameState.stars);
        this.elements.energy.textContent = `${gameState.energy}/${gameState.maxEnergy}`;
        this.elements.clickPower.textContent = gameState.clickPower;
        this.elements.clickValue.textContent = gameState.clickPower;
        this.elements.passiveIncome.textContent = `${gameState.passiveIncome}/сек`;
        this.elements.totalClicks.textContent = this.formatNumber(gameState.totalClicks);
        this.elements.userLevel.textContent = gameState.userLevel;
        
        // Обновляем прогресс уровня
        this.updateLevelProgress(gameState);
    }
    
    updateLevelProgress(gameState) {
        const expNeeded = gameState.userLevel * 1000;
        const progress = (gameState.experience / expNeeded) * 100;
        
        // Можно добавить визуальный прогресс-бар
        const progressBar = document.querySelector('.level-progress');
        if (progressBar) {
            progressBar.style.width = `${Math.min(100, progress)}%`;
        }
    }
    
    updateAdsCounter() {
        const adsWatchedToday = this.gameLogic.gameState.adsWatchedToday || 0;
        const adsAvailable = Math.max(0, 10 - adsWatchedToday);
        
        this.elements.adsAvailable.textContent = adsAvailable;
        
        // Блокируем кнопку если лимит исчерпан
        if (adsAvailable <= 0) {
            this.elements.watchAdBtn.disabled = true;
            this.elements.watchAdBtn.style.opacity = '0.5';
        } else {
            this.elements.watchAdBtn.disabled = false;
            this.elements.watchAdBtn.style.opacity = '1';
        }
    }
    
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        }
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    
    loadUpgrades() {
        const upgrades = this.gameLogic.getAvailableUpgrades();
        this.elements.upgradesList.innerHTML = '';
        
        upgrades.forEach(upgrade => {
            const isBought = this.gameLogic.gameState.upgrades.includes(upgrade.id);
            const canAfford = this.gameLogic.gameState.stars >= upgrade.cost;
            
            const item = document.createElement('div');
            item.className = `upgrade-item ${isBought ? 'bought' : ''} ${!isBought && !canAfford ? 'locked' : ''}`;
            item.innerHTML = `
                <h4>${upgrade.name}</h4>
                <p>${this.getUpgradeDescription(upgrade)}</p>
                <div class="upgrade-footer">
                    <span class="upgrade-cost">${this.formatNumber(upgrade.cost)} ⭐</span>
                    <button class="buy-upgrade-btn" 
                            ${isBought || !canAfford ? 'disabled' : ''} 
                            data-id="${upgrade.id}">
                        ${isBought ? 'Куплено' : 'Купить'}
                    </button>
                </div>
            `;
            
            this.elements.upgradesList.appendChild(item);
        });
    }
    
    getUpgradeDescription(upgrade) {
        switch(upgrade.type) {
            case 'click':
                if (upgrade.value) return `+${upgrade.value} к силе клика`;
                if (upgrade.multiplier) return `×${upgrade.multiplier} сила клика`;
                break;
            case 'energy':
                return `+${upgrade.value} к максимальной энергии`;
            case 'passive':
                return `+${upgrade.value} к пассивному доходу`;
            case 'critical':
                return `${upgrade.chance * 100}% шанс ×${upgrade.multiplier} критического удара`;
            default:
                return 'Улучшение характеристик';
        }
    }
    
    buyUpgrade(upgradeId) {
        const result = this.gameLogic.buyUpgrade(parseInt(upgradeId));
        
        if (result.success) {
            this.showNotification(`Куплено улучшение: ${result.upgrade}`, 'success');
            this.updateGameState(this.gameLogic.gameState);
            this.loadUpgrades();
        } else {
            this.showNotification(result.message, 'error');
        }
    }
    
    loadShopItems() {
        const items = [
            { id: 'energy_small', name: '⚡ Малая энергия', description: 'Восстанови 25 энергии', cost: 50 },
            { id: 'energy_medium', name: '⚡ Средняя энергия', description: 'Восстанови 50 энергии', cost: 90 },
            { id: 'energy_large', name: '⚡ Большая энергия', description: 'Восстанови 100 энергии', cost: 160 },
            { id: 'booster_2x', name: '🚀 Ускоритель x2', description: '×2 к доходу на 1 час', cost: 200 },
            { id: 'booster_3x', name: '🚀 Ускоритель x3', description: '×3 к доходу на 30 минут', cost: 300 }
        ];
        
        this.renderShopItems(items);
    }
    
    renderShopItems(items) {
        this.elements.shopItems.innerHTML = '';
        
        items.forEach(item => {
            const canAfford = this.gameLogic.gameState.stars >= item.cost;
            
            const itemDiv = document.createElement('div');
            itemDiv.className = `shop-item ${!canAfford ? 'locked' : ''}`;
            itemDiv.innerHTML = `
                <h3>${item.name}</h3>
                <p>${item.description}</p>
                <button class="buy-btn" 
                        ${!canAfford ? 'disabled' : ''}
                        data-id="${item.id}" 
                        data-cost="${item.cost}"
                        data-name="${item.name}">
                    Купить за ${this.formatNumber(item.cost)} ⭐
                </button>
            `;
            
            this.elements.shopItems.appendChild(itemDiv);
        });
    }
    
    changeShopCategory(category) {
        // Обновляем активные кнопки
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
        
        // Загружаем товары категории
        const categories = {
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
        
        if (categories[category]) {
            this.renderShopItems(categories[category]);
        }
    }
    
    buyShopItem(itemId, cost, name) {
        const result = this.gameLogic.buyItem(itemId, parseInt(cost));
        
        if (result.success) {
            this.showNotification(`Куплено: ${name}`, 'success');
            this.updateGameState(this.gameLogic.gameState);
            this.updateShopItems();
        } else {
            this.showNotification(result.message, 'error');
        }
    }
    
    updateShopItems() {
        const currentCategory = document.querySelector('.category-btn.active')?.dataset.category || 'energy';
        this.changeShopCategory(currentCategory);
    }
    
    watchAd() {
        if (this.gameLogic.gameState.adsWatchedToday >= 10) {
            this.showNotification('Лимит рекламы на сегодня исчерпан', 'warning');
            return;
        }
        
        // Показываем индикатор загрузки
        const originalText = this.elements.watchAdBtn.innerHTML;
        this.elements.watchAdBtn.innerHTML = '<span class="loading-spinner"></span>';
        this.elements.watchAdBtn.disabled = true;
        
        this.gameLogic.watchAd().then(result => {
            if (result.success) {
                this.showNotification(`Вы получили ${result.reward} ⭐ за просмотр рекламы!`, 'success');
                this.updateGameState(this.gameLogic.gameState);
                this.updateAdsCounter();
            }
        }).finally(() => {
            // Восстанавливаем кнопку
            this.elements.watchAdBtn.innerHTML = originalText;
            this.elements.watchAdBtn.disabled = false;
        });
    }
    
    openModal(modalName) {
        this.closeAllModals();
        
        const modal = document.getElementById(`${modalName}-modal`);
        if (modal) {
            modal.classList.add('active');
            this.elements.modalOverlay.style.display = 'block';
            this.currentModal = modalName;
            
            // Обновляем контент если нужно
            if (modalName === 'upgrades') {
                this.loadUpgrades();
            } else if (modalName === 'shop') {
                this.loadShopItems();
            }
        }
    }
    
    closeModal(modalName) {
        const modal = document.getElementById(`${modalName}-modal`);
        if (modal) {
            modal.classList.remove('active');
        }
        
        // Проверяем, есть ли ещё открытые модалки
        const openModals = document.querySelectorAll('.modal.active');
        if (openModals.length === 0) {
            this.elements.modalOverlay.style.display = 'none';
            this.currentModal = null;
        }
    }
    
    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
        this.elements.modalOverlay.style.display = 'none';
        this.currentModal = null;
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        this.elements.notifications.appendChild(notification);
        
        // Автоматическое удаление
        setTimeout(() => {
            notification.style.animation = 'slideDown 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
    }
    
    showAchievementPopup(achievement) {
        const popup = document.createElement('div');
        popup.className = 'achievement-popup';
        popup.innerHTML = `
            <div class="achievement-content">
                <div class="achievement-icon">🏆</div>
                <div class="achievement-text">
                    <h4>Новое достижение!</h4>
                    <p>${achievement.name}</p>
                    <p class="achievement-reward">+${achievement.reward} ⭐</p>
                </div>
            </div>
        `;
        
        document.body.appendChild(popup);
        
        // Удаляем через 5 секунд
        setTimeout(() => {
            popup.remove();
        }, 5000);
    }
    
    updateUserInfo(userData) {
        if (userData) {
            this.elements.username.textContent = userData.first_name || 'Космический Исследователь';
            this.elements.userAvatar.textContent = userData.first_name ? userData.first_name[0].toUpperCase() : '👤';
        }
    }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
} else {
    window.UIManager = UIManager;
}