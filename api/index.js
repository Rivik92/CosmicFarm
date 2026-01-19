// ============================================
// api/index.js - Cosmic Farm API для Vercel
// ============================================
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Разрешаем CORS (для разработки)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

// ========== MONGODB ATLAS ПОДКЛЮЧЕНИЕ ==========
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
    console.log('🔗 Подключаюсь к MongoDB Atlas...');
    mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
    })
    .then(() => {
        console.log('✅ MongoDB Atlas подключена');
        if (mongoose.connection.db) {
            console.log(`📊 База: ${mongoose.connection.db.databaseName}`);
        }
    })
    .catch(err => {
        console.error('❌ Ошибка MongoDB:', err.message);
        console.log('⚠️  API будет работать без базы данных');
    });
} else {
    console.log('⚠️  MONGODB_URI не указан, работаю без базы данных');
}

// ========== СТАТИЧЕСКИЕ ФАЙЛЫ ==========
app.use('/admin', express.static(path.join(__dirname, '../admin')));
app.use(express.static(path.join(__dirname, '../frontend')));

// ========== API МАРШРУТЫ ==========

// 1. Проверка работы API
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Cosmic Farm API работает на Vercel!',
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// 2. Тестовый маршрут
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Тестовый маршрут работает',
        data: { version: '1.0', author: 'Cosmic Farm Team' }
    });
});

// 3. Обработка клика (игровая логика)
app.post('/api/click', async (req, res) => {
    try {
        const { userId, clickPower = 1 } = req.body;
        console.log(`🎮 Клик от пользователя ${userId || 'unknown'}`);
        
        // Здесь будет логика с базой данных
        let userStars = 100; // Заглушка
        
        if (mongoose.connection.readyState === 1) {
            // Реальная работа с базой
            // const user = await User.findOneAndUpdate(...)
        }
        
        res.json({
            success: true,
            message: 'Клик засчитан!',
            starsEarned: clickPower,
            totalStars: userStars,
            bonus: Math.random() > 0.8 ? 'CRITICAL!' : null
        });
    } catch (error) {
        console.error('Ошибка обработки клика:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

// 4. Получение состояния игры
app.get('/api/game/state/:userId?', (req, res) => {
    const userId = req.params.userId || 'demo-user';
    
    res.json({
        success: true,
        user: {
            id: userId,
            username: userId === 'demo-user' ? 'Демо-игрок' : `Игрок_${userId.slice(0, 5)}`
        },
        gameState: {
            stars: 1000,
            energy: 85,
            clickPower: 1,
            passiveIncome: 5,
            level: 1
        },
        timestamp: new Date().toISOString()
    });
});

// ========== TELEGRAM BOT WEBHOOK ==========
app.post('/api/bot/webhook', (req, res) => {
    console.log('🤖 Получен вебхук от Telegram');
    // Здесь будет обработка Telegram бота
    res.json({ ok: true, received: true });
});

// ========== ОШИБКИ ==========
// 404 - маршрут не найден
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        error: 'Маршрут не найден',
        path: req.path,
        method: req.method 
    });
});

// 500 - ошибка сервера
app.use((err, req, res, next) => {
    console.error('🚨 Ошибка сервера:', err.stack);
    res.status(500).json({ 
        success: false, 
        error: 'Внутренняя ошибка сервера',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ========== ЭКСПОРТ ДЛЯ VERCEL ==========
// ВАЖНО: только экспорт, без app.listen()!
module.exports = app;

// ========== ЛОКАЛЬНЫЙ ЗАПУСК (для тестов) ==========
if (require.main === module) {
    app.listen(PORT, () => {
        console.log('\n' + '='.repeat(50));
        console.log('🚀 COSMIC FARM SERVER ЗАПУЩЕН ЛОКАЛЬНО');
        console.log('='.repeat(50));
        console.log(`📍 Порт: ${PORT}`);
        console.log(`🌍 Режим: ${process.env.NODE_ENV || 'development'}`);
        console.log(`📡 API Health: http://localhost:${PORT}/api/health`);
        console.log(`🎮 Игра: http://localhost:${PORT}`);
        console.log(`👨‍💼 Админка: http://localhost:${PORT}/admin`);
        console.log('='.repeat(50));
        console.log('📝 Доступные маршруты:');
        console.log('  GET  /api/health           - Проверка работы API');
        console.log('  GET  /api/test             - Тестовый маршрут');
        console.log('  POST /api/click            - Обработка клика');
        console.log('  GET  /api/game/state/:id   - Состояние игры');
        console.log('  POST /api/bot/webhook      - Telegram бот');
        console.log('='.repeat(50) + '\n');
    });
}