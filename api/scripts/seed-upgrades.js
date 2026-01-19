#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');
const Upgrade = require('../models/Upgrade');

const upgradesData = [
    {
        upgradeId: 'click_power_1',
        name: 'Улучшенный клик',
        description: 'Увеличивает силу клика на +1',
        type: 'click_power',
        cost: 100,
        maxLevel: 10,
        effect: { clickPower: 1 }
    },
    {
        upgradeId: 'click_power_2',
        name: 'Продвинутый клик',
        description: 'Увеличивает силу клика на +2',
        type: 'click_power',
        cost: 500,
        maxLevel: 5,
        effect: { clickPower: 2 }
    },
    {
        upgradeId: 'energy_capacity_1',
        name: 'Больше энергии',
        description: 'Увеличивает максимальную энергию на 20',
        type: 'energy_capacity',
        cost: 200,
        maxLevel: 5,
        effect: { energyCapacity: 20 }
    },
    {
        upgradeId: 'passive_income_1',
        name: 'Пассивный доход',
        description: 'Добавляет 1 звезду в секунду',
        type: 'passive_income',
        cost: 500,
        maxLevel: 10,
        effect: { passiveIncome: 1 }
    },
    {
        upgradeId: 'passive_income_2',
        name: 'Активный доход',
        description: 'Добавляет 5 звезд в секунду',
        type: 'passive_income',
        cost: 2500,
        maxLevel: 5,
        effect: { passiveIncome: 5 }
    },
    {
        upgradeId: 'critical_chance_1',
        name: 'Критический удар',
        description: 'Шанс 5% нанести двойной урон',
        type: 'critical_chance',
        cost: 1000,
        maxLevel: 5,
        effect: { criticalChance: 0.05, criticalMultiplier: 2 }
    },
    {
        upgradeId: 'energy_regen_1',
        name: 'Регенерация',
        description: 'Увеличивает восстановление энергии на 0.1/сек',
        type: 'energy_regen',
        cost: 300,
        maxLevel: 10,
        effect: { energyRegen: 0.1 }
    },
    {
        upgradeId: 'auto_clicker_1',
        name: 'Автокликер',
        description: 'Автоматически кликает 1 раз в секунду',
        type: 'auto_clicker',
        cost: 1000,
        maxLevel: 5,
        effect: { autoClicker: 1 }
    }
];

async function seedUpgrades() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Подключено к MongoDB');
        
        // Очищаем коллекцию
        await Upgrade.deleteMany({});
        console.log('🗑️ Старые улучшения удалены');
        
        // Добавляем новые улучшения
        for (const upgradeData of upgradesData) {
            const upgrade = new Upgrade(upgradeData);
            await upgrade.save();
            console.log(`✅ Добавлено улучшение: ${upgradeData.name}`);
        }
        
        console.log('🎉 Улучшения успешно добавлены!');
        console.log(`📊 Всего улучшений: ${upgradesData.length}`);
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Ошибка при добавлении улучшений:', error);
        process.exit(1);
    }
}

seedUpgrades();