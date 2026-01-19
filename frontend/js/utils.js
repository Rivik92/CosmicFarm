// Вспомогательные функции для Cosmic Clicker

class Utils {
    constructor() {
        this.cache = new Map();
    }
    
    // Форматирование чисел
    formatNumber(num, decimals = 1) {
        if (isNaN(num)) return '0';
        
        if (num >= 1e12) {
            return (num / 1e12).toFixed(decimals).replace(/\.0$/, '') + 'T';
        }
        if (num >= 1e9) {
            return (num / 1e9).toFixed(decimals).replace(/\.0$/, '') + 'B';
        }
        if (num >= 1e6) {
            return (num / 1e6).toFixed(decimals).replace(/\.0$/, '') + 'M';
        }
        if (num >= 1e3) {
            return (num / 1e3).toFixed(decimals).replace(/\.0$/, '') + 'K';
        }
        
        return Math.floor(num).toString();
    }
    
    formatCurrency(amount, currency = '⭐') {
        return `${this.formatNumber(amount)} ${currency}`;
    }
    
    formatTime(seconds) {
        if (seconds < 60) {
            return `${seconds} сек`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes} мин ${remainingSeconds} сек`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours} ч ${minutes} мин`;
        }
    }
    
    formatDate(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    // Работа с localStorage
    setLocalStorage(key, value) {
        try {
            const serialized = JSON.stringify(value);
            localStorage.setItem(key, serialized);
            return true;
        } catch (error) {
            console.error('Ошибка сохранения в localStorage:', error);
            return false;
        }
    }
    
    getLocalStorage(key, defaultValue = null) {
        try {
            const serialized = localStorage.getItem(key);
            if (serialized === null) return defaultValue;
            return JSON.parse(serialized);
        } catch (error) {
            console.error('Ошибка чтения из localStorage:', error);
            return defaultValue;
        }
    }
    
    removeLocalStorage(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Ошибка удаления из localStorage:', error);
            return false;
        }
    }
    
    clearLocalStorage(prefix = null) {
        try {
            if (prefix) {
                // Удаляем только ключи с префиксом
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith(prefix)) {
                        localStorage.removeItem(key);
                    }
                });
            } else {
                localStorage.clear();
            }
            return true;
        } catch (error) {
            console.error('Ошибка очистки localStorage:', error);
            return false;
        }
    }
    
    // Кэширование
    setCache(key, value, ttl = 300000) { // 5 минут по умолчанию
        const item = {
            value: value,
            expires: Date.now() + ttl
        };
        this.cache.set(key, item);
    }
    
    getCache(key) {
        const item = this.cache.get(key);
        
        if (!item) return null;
        
        if (Date.now() > item.expires) {
            this.cache.delete(key);
            return null;
        }
        
        return item.value;
    }
    
    clearCache() {
        this.cache.clear();
    }
    
    // Валидация
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    
    isValidURL(url) {
        try {
            new URL(url);
            return true;
        } catch (_) {
            return false;
        }
    }
    
    isNumeric(value) {
        return !isNaN(parseFloat(value)) && isFinite(value);
    }
    
    // Анимации и эффекты
    createRipple(event) {
        const button = event.currentTarget;
        const circle = document.createElement('span');
        const diameter = Math.max(button.clientWidth, button.clientHeight);
        const radius = diameter / 2;
        
        circle.style.width = circle.style.height = `${diameter}px`;
        circle.style.left = `${event.clientX - button.getBoundingClientRect().left - radius}px`;
        circle.style.top = `${event.clientY - button.getBoundingClientRect().top - radius}px`;
        circle.classList.add('ripple');
        
        const ripple = button.getElementsByClassName('ripple')[0];
        
        if (ripple) {
            ripple.remove();
        }
        
        button.appendChild(circle);
    }
    
    animateValue(element, start, end, duration) {
        if (!element) return;
        
        const startTime = performance.now();
        const step = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            const currentValue = Math.floor(start + (end - start) * progress);
            element.textContent = this.formatNumber(currentValue);
            
            if (progress < 1) {
                requestAnimationFrame(step);
            }
        };
        
        requestAnimationFrame(step);
    }
    
    // Генерация случайных значений
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    randomFloat(min, max) {
        return Math.random() * (max - min) + min;
    }
    
    randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
    
    // Работа с массивами и объектами
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
    
    mergeObjects(target, source) {
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key] || typeof target[key] !== 'object') {
                    target[key] = {};
                }
                this.mergeObjects(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }
    
    // Обработка ошибок
    handleError(error, context = '') {
        console.error(`Ошибка в ${context}:`, error);
        
        // Можно добавить отправку ошибок на сервер
        if (window.errorReporter) {
            window.errorReporter.captureException(error, { context });
        }
        
        return {
            success: false,
            error: error.message || 'Неизвестная ошибка',
            timestamp: Date.now()
        };
    }
    
    // Загрузка данных
    async fetchWithTimeout(url, options = {}, timeout = 10000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(id);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            clearTimeout(id);
            throw error;
        }
    }
    
    // Дебаунс и троттлинг
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    // Создание элементов
    createElement(tag, attributes = {}, children = []) {
        const element = document.createElement(tag);
        
        // Устанавливаем атрибуты
        Object.keys(attributes).forEach(key => {
            if (key === 'className') {
                element.className = attributes[key];
            } else if (key === 'style' && typeof attributes[key] === 'object') {
                Object.assign(element.style, attributes[key]);
            } else {
                element.setAttribute(key, attributes[key]);
            }
        });
        
        // Добавляем детей
        children.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                element.appendChild(child);
            }
        });
        
        return element;
    }
    
    // Работа с URL
    getQueryParam(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }
    
    setQueryParam(name, value) {
        const url = new URL(window.location);
        url.searchParams.set(name, value);
        window.history.pushState({}, '', url);
    }
    
    // Проверка устройств
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }
    
    isAndroid() {
        return /Android/.test(navigator.userAgent);
    }
    
    isTouchDevice() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
    
    // Вибрация
    vibrate(pattern = 50) {
        if (navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    }
    
    // Копирование в буфер обмена
    copyToClipboard(text) {
        return new Promise((resolve, reject) => {
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).then(resolve).catch(reject);
            } else {
                // Fallback для старых браузеров
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                try {
                    document.execCommand('copy');
                    resolve();
                } catch (err) {
                    reject(err);
                }
                
                document.body.removeChild(textArea);
            }
        });
    }
    
    // Генерация ID
    generateId(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        return result;
    }
    
    // Создание CSV
    arrayToCSV(data, delimiter = ',') {
        const escape = (value) => {
            if (value === null || value === undefined) return '';
            const string = String(value);
            if (string.includes(delimiter) || string.includes('"') || string.includes('\n')) {
                return '"' + string.replace(/"/g, '""') + '"';
            }
            return string;
        };
        
        return data.map(row => 
            row.map(cell => escape(cell)).join(delimiter)
        ).join('\n');
    }
}

// Создаем глобальный экземпляр утилит
window.utils = new Utils();

// Экспорт для Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}