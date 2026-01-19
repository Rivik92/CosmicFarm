// backend/controllers/adminController.js

// Простейший контроллер, который точно работает
const adminController = {
    login: function(req, res) {
        console.log('✅ Admin login route called');
        res.json({ 
            success: true, 
            message: 'Admin API is working',
            token: 'test-token-123' 
        });
    }
};

// Критически важная строка
module.exports = adminController;