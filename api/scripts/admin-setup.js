#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function setupAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Подключено к MongoDB');
        
        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
        
        // Проверяем, существует ли уже админ
        const existingAdmin = await User.findOne({ 
            username: adminUsername,
            role: 'admin' 
        });
        
        if (existingAdmin) {
            console.log('⚠️ Администратор уже существует');
            console.log(`👤 Имя: ${existingAdmin.username}`);
            console.log(`🔑 Роль: ${existingAdmin.role}`);
            process.exit(0);
        }
        
        // Создаем админа
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        
        const adminUser = new User({
            telegramId: 'admin',
            username: adminUsername,
            firstName: 'Администратор',
            role: 'admin',
            passwordHash: hashedPassword,
            isVerified: true,
            stats: {
                gamesPlayed: 0,
                totalClicks: 0,
                totalStars: 0,
                totalTimePlayed: 0
            }
        });
        
        await adminUser.save();
        
        console.log('✅ Администратор создан успешно!');
        console.log(`👤 Имя: ${adminUsername}`);
        console.log(`🔑 Пароль: ${adminPassword}`);
        console.log('⚠️ Обязательно измените пароль после первого входа!');
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Ошибка при создании администратора:', error);
        process.exit(1);
    }
}

setupAdmin();