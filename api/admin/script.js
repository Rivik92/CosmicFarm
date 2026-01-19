// Конфигурация
const API_BASE = 'http://localhost:3000/api/admin';
let currentToken = null;
let currentUserId = null;

// ====== ФУНКЦИИ АВТОРИЗАЦИИ ======
function showLogin() {
    document.getElementById('loginModal').style.display = 'flex';
}

function hideLogin() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('loginError').textContent = '';
}

async function performLogin() {
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;
    
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success && data.token) {
            currentToken = data.token;
            localStorage.setItem('adminToken', data.token);
            document.getElementById('adminPanel').style.display = 'block';
            document.getElementById('authBox').style.display = 'none';
            hideLogin();
            loadSystemStats();
            showNotification('Успешный вход!', 'success');
        } else {
            document.getElementById('loginError').textContent = data.message || 'Ошибка входа';
        }
    } catch (error) {
        document.getElementById('loginError').textContent = 'Ошибка соединения';
    }
}

// Проверяем сохранённый токен при загрузке
window.onload = function() {
    const savedToken = localStorage.getItem('adminToken');
    if (savedToken) {
        currentToken = savedToken;
        document.getElementById('adminPanel').style.display = 'block';
        document.getElementById('authBox').style.display = 'none';
        loadSystemStats();
    }
};

// ====== ФУНКЦИИ ДЛЯ РАБОТЫ С ПОЛЬЗОВАТЕЛЯМИ ======
async function findUser() {
    const userId = document.getElementById('searchInput').value.trim();
    if (!userId) {
        showNotification('Введите ID пользователя', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUserId = userId;
            displayUserInfo(data.user, data.gameState);
            showNotification('Пользователь найден', 'success');
        } else {
            document.getElementById('userInfo').innerHTML = 
                `<p class="error">Пользователь не найден</p>`;
        }
    } catch (error) {
        showNotification('Ошибка поиска пользователя', 'error');
    }
}

function displayUserInfo(user, gameState) {
    const userInfoDiv = document.getElementById('userInfo');
    userInfoDiv.innerHTML = `
        <h3><i class="fas fa-user"></i> Информация о пользователе</h3>
        <div class="user-details">
            <p><strong>Telegram ID:</strong> ${user.telegramId || 'Не указан'}</p>
            <p><strong>Имя:</strong> ${user.firstName || ''} ${user.lastName || ''}</p>
            <p><strong>Юзернейм:</strong> @${user.username || 'не указан'}</p>
            <p><strong>Зарегистрирован:</strong> ${new Date(user.createdAt).toLocaleString()}</p>
            <hr>
            <p><strong>Баланс звёзд:</strong> <span class="highlight">${gameState?.stars || 0} ⭐</span></p>
            <p><strong>Энергия:</strong> ${gameState?.energy || 0}/100 ⚡</p>
            <p><strong>Улучшения куплены:</strong> ${gameState?.upgrades?.length || 0} шт.</p>
            <p><strong>Всего кликов:</strong> ${user.stats?.totalClicks || 0}</p>
        </div>
    `;
}

// ====== ФУНКЦИИ УПРАВЛЕНИЯ БАЛАНСОМ ======
async function modifyBalance(action) {
    if (!currentUserId) {
        showNotification('Сначала найдите пользователя', 'warning');
        return;
    }
    
    const amount = parseInt(document.getElementById('starsAmount').value);
    if (!amount || amount <= 0) {
        showNotification('Введите корректную сумму', 'warning');
        return;
    }

    const isAdd = action === 'add';
    
    try {
        const response = await fetch(`${API_BASE}/users/${currentUserId}/balance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                amount: isAdd ? amount : -amount,
                reason: `Администратор: ${isAdd ? 'добавление' : 'списание'} звёзд`
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(
                `${isAdd ? 'Добавлено' : 'Списано'} ${amount} звёзд. Новый баланс: ${data.newBalance}`,
                'success'
            );
            findUser(); // Обновляем информацию о пользователе
            loadSystemStats(); // Обновляем общую статистику
        } else {
            showNotification(data.message || 'Ошибка изменения баланса', 'error');
        }
    } catch (error) {
        showNotification('Ошибка соединения', 'error');
    }
}

async function resetUser() {
    if (!currentUserId || !confirm('Вы уверены? Весь прогресс пользователя будет сброшен!')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users/${currentUserId}/reset`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Прогресс пользователя сброшен', 'success');
            findUser();
            loadSystemStats();
        }
    } catch (error) {
        showNotification('Ошибка сброса', 'error');
    }
}

// ====== ФУНКЦИИ СТАТИСТИКИ ======
async function loadSystemStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                document.getElementById('totalUsers').textContent = data.totalUsers || 0;
                document.getElementById('activeUsers').textContent = data.activeUsers || 0;
                document.getElementById('totalStars').textContent = data.totalStars || 0;
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// ====== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ======
function showNotification(message, type = 'info') {
    // Создаём временное уведомление
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 10px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    if (type === 'success') notification.style.background = '#10b981';
    if (type === 'error') notification.style.background = '#ef4444';
    if (type === 'warning') notification.style.background = '#f59e0b';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Добавляем стили для анимации уведомлений
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    .highlight { color: #fbbf24; font-weight: 700; }
    .error { color: #f87171; }
    .user-details { line-height: 1.8; }
    .user-details hr { margin: 15px 0; border-color: #475569; }
`;
document.head.appendChild(style);