const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');

// Профиль пользователя
router.get('/profile', authenticate, UserController.getProfile);
router.put('/profile', authenticate, UserController.updateProfile);

// Транзакции
router.get('/transactions', authenticate, UserController.getTransactions);

// Статистика
router.get('/stats', authenticate, UserController.getStats);

// Экспорт данных
router.get('/export', authenticate, UserController.exportData);

// Административные функции
router.get('/search', authenticate, authorize('admin'), UserController.searchUsers);
router.post('/:userId/ban', authenticate, authorize('admin'), UserController.toggleBan);
router.post('/:userId/role', authenticate, authorize('admin'), UserController.changeRole);
router.post('/:userId/grant', authenticate, authorize('admin'), UserController.grantStars);
router.post('/:userId/remove', authenticate, authorize('admin'), UserController.removeStars);

module.exports = router;