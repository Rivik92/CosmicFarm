// Интеграция с Telegram Web App для Cosmic Clicker

class TelegramIntegration {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        this.isTelegram = !!this.tg;
        this.userData = null;
        this.init();
    }
    
    init() {
        if (!this.isTelegram) {
            console.log('⚠️ Приложение запущено вне Telegram');
            return;
        }
        
        console.log('✅ Telegram Web App обнаружен');
        
        // Инициализация
        this.tg.ready();
        this.tg.expand();
        
        // Получаем данные пользователя
        this.userData = this.tg.initDataUnsafe?.user;
        
        // Настраиваем тему
        this.setupTheme();
        
        // Настраиваем кнопки
        this.setupMainButton();
        this.setupBackButton();
        
        // Подписываемся на события
        this.setupEventListeners();
        
        // Инициализация завершена
        this.tg.sendData(JSON.stringify({
            type: 'app_ready',
            timestamp: Date.now()
        }));
    }
    
    setupTheme() {
        if (!this.isTelegram) return;
        
        // Применяем тему Telegram
        const colorScheme = this.tg.colorScheme;
        const themeParams = this.tg.themeParams;
        
        // Устанавливаем CSS переменные
        if (themeParams) {
            document.documentElement.style.setProperty('--tg-theme-bg-color', themeParams.bg_color || '#18222d');
            document.documentElement.style.setProperty('--tg-theme-text-color', themeParams.text_color || '#ffffff');
            document.documentElement.style.setProperty('--tg-theme-hint-color', themeParams.hint_color || '#b1c3d5');
            document.documentElement.style.setProperty('--tg-theme-link-color', themeParams.link_color || '#6ab2f2');
            document.documentElement.style.setProperty('--tg-theme-button-color', themeParams.button_color || '#2ea6ff');
            document.documentElement.style.setProperty('--tg-theme-button-text-color', themeParams.button_text_color || '#ffffff');
        }
        
        // Применяем цветовую схему
        if (colorScheme === 'dark') {
            document.body.classList.add('tg-dark');
            document.body.classList.remove('tg-light');
        } else {
            document.body.classList.add('tg-light');
            document.body.classList.remove('tg-dark');
        }
    }
    
    setupMainButton() {
        if (!this.isTelegram) return;
        
        // Создаём основную кнопку
        this.tg.MainButton.setText('💰 Получить бонус');
        this.tg.MainButton.setParams({
            color: '#9d4edd',
            text_color: '#ffffff'
        });
        
        // Показываем/скрываем кнопку в зависимости от контекста
        this.updateMainButton();
    }
    
    setupBackButton() {
        if (!this.isTelegram) return;
        
        // Показываем кнопку "Назад" когда нужно
        this.tg.BackButton.show();
        
        this.tg.BackButton.onClick(() => {
            // Закрываем модальные окна или выполняем другое действие
            if (window.uiManager) {
                window.uiManager.closeAllModals();
            }
        });
    }
    
    setupEventListeners() {
        if (!this.isTelegram) return;
        
        // Изменение темы
        this.tg.onEvent('themeChanged', () => {
            this.setupTheme();
        });
        
        // Изменение размера окна
        this.tg.onEvent('viewportChanged', (event) => {
            this.handleViewportChange(event);
        });
        
        // Кнопка главного меню
        this.tg.MainButton.onClick(() => {
            this.handleMainButtonClick();
        });
        
        // Событие закрытия
        this.tg.onEvent('closing', () => {
            this.handleAppClosing();
        });
    }
    
    handleViewportChange(event) {
        const { height, width, is_expanded } = event;
        
        // Адаптируем интерфейс под размер окна
        if (window.uiManager) {
            // Можно добавить адаптацию интерфейса
        }
        
        console.log(`📱 Размер окна: ${width}x${height}, расширено: ${is_expanded}`);
    }
    
    handleMainButtonClick() {
        if (!this.isTelegram) return;
        
        // Действие при нажатии на основную кнопку
        if (window.adManager) {
            window.adManager.showRewardedAd().then(result => {
                if (result.success) {
                    // Показываем уведомление
                    this.showTelegramAlert(`🎉 Получено ${result.reward} звёзд!`);
                    
                    // Обновляем кнопку
                    this.updateMainButton();
                }
            }).catch(error => {
                this.showTelegramAlert(error.error || 'Ошибка при показе рекламы');
            });
        }
    }
    
    handleAppClosing() {
        // Сохраняем данные перед закрытием
        if (window.game) {
            window.game.saveGameState();
        }
        
        // Отправляем данные на сервер
        this.sendCloseData();
    }
    
    updateMainButton() {
        if (!this.isTelegram) return;
        
        // Обновляем текст кнопки в зависимости от состояния
        if (window.adManager) {
            const stats = window.adManager.getAdStatistics();
            
            if (stats.adsLeftToday > 0) {
                this.tg.MainButton.setText(`🎬 Смотреть рекламу (${stats.adsLeftToday} left)`);
                this.tg.MainButton.show();
            } else {
                this.tg.MainButton.setText('🎬 Лимит исчерпан');
                this.tg.MainButton.disable();
                this.tg.MainButton.show();
            }
        }
    }
    
    showTelegramAlert(message) {
        if (!this.isTelegram) return;
        
        this.tg.showAlert(message);
    }
    
    showTelegramConfirm(message) {
        if (!this.isTelegram) return Promise.resolve(false);
        
        return new Promise((resolve) => {
            this.tg.showConfirm(message, (confirmed) => {
                resolve(confirmed);
            });
        });
    }
    
    showTelegramPopup(params) {
        if (!this.isTelegram) return;
        
        this.tg.showPopup(params, (buttonId) => {
            if (params.callback) {
                params.callback(buttonId);
            }
        });
    }
    
    sendDataToBot(data) {
        if (!this.isTelegram) return;
        
        this.tg.sendData(JSON.stringify(data));
    }
    
    sendCloseData() {
        if (!this.isTelegram) return;
        
        const gameData = window.game ? window.game.getGameData() : null;
        
        this.sendDataToBot({
            type: 'app_closing',
            timestamp: Date.now(),
            gameData: gameData,
            user: this.userData
        });
    }
    
    requestContact() {
        if (!this.isTelegram) return Promise.resolve(null);
        
        return new Promise((resolve) => {
            this.tg.requestContact((contact) => {
                resolve(contact);
            });
        });
    }
    
    requestLocation() {
        if (!this.isTelegram) return Promise.resolve(null);
        
        return new Promise((resolve) => {
            this.tg.requestLocation((location) => {
                resolve(location);
            });
        });
    }
    
    // Геттеры
    getUserData() {
        return this.userData;
    }
    
    getPlatform() {
        if (!this.isTelegram) return 'web';
        
        return this.tg.platform || 'unknown';
    }
    
    getInitData() {
        if (!this.isTelegram) return null;
        
        return this.tg.initData;
    }
    
    getInitDataUnsafe() {
        if (!this.isTelegram) return null;
        
        return this.tg.initDataUnsafe;
    }
    
    isDarkTheme() {
        if (!this.isTelegram) return false;
        
        return this.tg.colorScheme === 'dark';
    }
    
    // Методы для интеграции с игрой
    static integrateWithGame(gameInstance) {
        const tgIntegration = new TelegramIntegration();
        
        // Добавляем методы в игру
        gameInstance.telegram = {
            getUser: () => tgIntegration.getUserData(),
            showAlert: (msg) => tgIntegration.showTelegramAlert(msg),
            showConfirm: (msg) => tgIntegration.showTelegramConfirm(msg),
            sendData: (data) => tgIntegration.sendDataToBot(data),
            isTelegram: tgIntegration.isTelegram,
            platform: tgIntegration.getPlatform()
        };
        
        // Обновляем информацию о пользователе в UI
        if (window.uiManager && tgIntegration.userData) {
            window.uiManager.updateUserInfo(tgIntegration.userData);
        }
        
        return tgIntegration;
    }
}

// Автоматическая интеграция при загрузке
document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.Telegram !== 'undefined') {
        window.telegramIntegration = new TelegramIntegration();
        
        // Интегрируем с игрой если она существует
        if (typeof window.game !== 'undefined') {
            TelegramIntegration.integrateWithGame(window.game);
        }
    }
});

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TelegramIntegration;
} else {
    window.TelegramIntegration = TelegramIntegration;
}