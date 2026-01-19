// backend/routes/admin.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController'); // Импортируем

// 1. Публичный роут для входа (самый важный для кнопки)
router.post('/login', adminController.login);

// 2. Простые GET-роуты для проверки (не требуют авторизации)
router.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Admin API is working' });
});
router.get('/test', (req, res) => {
    res.json({ status: '✅ Test route is working' });
});

// 3. Защищённые роуты ПОКА ОСТАВЛЯЕМ ЗАКОММЕНТИРОВАННЫМИ
// router.get('/stats', adminController.getStats);
// router.get('/users/:userId', adminController.getUser);
// ... остальные

module.exports = router;