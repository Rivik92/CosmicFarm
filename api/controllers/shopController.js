const GameState = require('../models/GameState');
const Transaction = require('../models/Transaction');

class ShopController {
    /**
     * Покупка улучшения
     */
    async purchaseUpgrade(req, res) {
        try {
            const { userId } = req;
            const { upgradeId, upgradeType, cost } = req.body;
            
            const gameState = await GameState.findOne({ user: userId });
            if (!gameState) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Игровое состояние не найдено' 
                });
            }
            
            // Проверка достаточности средств
            if (gameState.stars < cost) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Недостаточно звезд' 
                });
            }
            
            // Проверка, не куплено ли уже улучшение
            const existingUpgrade = gameState.upgrades.find(u => u.upgradeId === upgradeId);
            if (existingUpgrade) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Улучшение уже куплено' 
                });
            }
            
            // Применение улучшения
            gameState.stars -= cost;
            
            // Добавляем улучшение
            gameState.upgrades.push({
                upgradeId,
                upgradeType,
                purchasedAt: new Date()
            });
            
            // Применяем эффект улучшения
            this.applyUpgradeEffect(gameState, upgradeId);
            
            await gameState.save();
            
            // Создаем запись о транзакции
            const transaction = new Transaction({
                user: userId,
                type: 'upgrade_purchase',
                amount: -cost,
                description: `Покупка улучшения: ${upgradeId}`,
                metadata: { upgradeId, upgradeType }
            });
            await transaction.save();
            
            res.json({
                success: true,
                newBalance: gameState.stars,
                message: 'Улучшение успешно куплено!'
            });
            
        } catch (error) {
            console.error('Purchase upgrade error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Ошибка при покупке улучшения' 
            });
        }
    }
    
    /**
     * Покупка бустера
     */
    async purchaseBooster(req, res) {
        try {
            const { userId } = req;
            const { boosterId, boosterType, cost, duration } = req.body;
            
            const gameState = await GameState.findOne({ user: userId });
            if (!gameState) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Игровое состояние не найдено' 
                });
            }
            
            // Проверка достаточности средств
            if (gameState.stars < cost) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Недостаточно звезд' 
                });
            }
            
            // Проверка активного бустера такого же типа
            const existingBooster = gameState.boosters.find(
                b => b.boosterType === boosterType && b.expiresAt > new Date()
            );
            
            if (existingBooster) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Такой бустер уже активен' 
                });
            }
            
            // Применение бустера
            gameState.stars -= cost;
            
            const expiresAt = new Date(Date.now() + duration * 60 * 1000); // duration в минутах
            
            gameState.boosters.push({
                boosterId,
                boosterType,
                purchasedAt: new Date(),
                expiresAt
            });
            
            await gameState.save();
            
            // Создаем запись о транзакции
            const transaction = new Transaction({
                user: userId,
                type: 'booster_purchase',
                amount: -cost,
                description: `Покупка бустера: ${boosterId}`,
                metadata: { boosterId, boosterType, duration }
            });
            await transaction.save();
            
            res.json({
                success: true,
                newBalance: gameState.stars,
                expiresAt,
                message: 'Бустер успешно активирован!'
            });
            
        } catch (error) {
            console.error('Purchase booster error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Ошибка при покупке бустера' 
            });
        }
    }
    
    /**
     * Покупка энергии
     */
    async purchaseEnergy(req, res) {
        try {
            const { userId } = req;
            const { amount, cost } = req.body;
            
            const gameState = await GameState.findOne({ user: userId });
            if (!gameState) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Игровое состояние не найдено' 
                });
            }
            
            if (gameState.stars < cost) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Недостаточно звезд' 
                });
            }
            
            // Восполняем энергию
            const maxEnergy = 100 + (gameState.upgrades.filter(u => u.upgradeType === 'energy_capacity').length * 20);
            gameState.energy = Math.min(gameState.energy + amount, maxEnergy);
            gameState.stars -= cost;
            
            await gameState.save();
            
            // Создаем запись о транзакции
            const transaction = new Transaction({
                user: userId,
                type: 'energy_purchase',
                amount: -cost,
                description: `Покупка энергии: +${amount} ед.`,
                metadata: { amount }
            });
            await transaction.save();
            
            res.json({
                success: true,
                newBalance: gameState.stars,
                newEnergy: gameState.energy,
                message: 'Энергия успешно пополнена!'
            });
            
        } catch (error) {
            console.error('Purchase energy error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Ошибка при покупке энергии' 
            });
        }
    }
    
    /**
     * Получение доступных товаров в магазине
     */
    async getShopItems(req, res) {
        try {
            const { userId } = req;
            
            const shopItems = {
                upgrades: [
                    {
                        id: 'click_power_1',
                        name: 'Улучшенный клик',
                        description: 'Увеличивает силу клика на +1',
                        type: 'click_power',
                        cost: 100,
                        effect: { clickPower: 1 }
                    },
                    {
                        id: 'energy_capacity_1',
                        name: 'Больше энергии',
                        description: 'Увеличивает максимальную энергию на 20',
                        type: 'energy_capacity',
                        cost: 200,
                        effect: { energyCapacity: 20 }
                    },
                    {
                        id: 'passive_income_1',
                        name: 'Пассивный доход',
                        description: 'Добавляет 1 звезду в секунду',
                        type: 'passive_income',
                        cost: 500,
                        effect: { passiveIncome: 1 }
                    }
                ],
                boosters: [
                    {
                        id: 'double_income_1h',
                        name: 'Двойной доход',
                        description: 'Удваивает доход от кликов на 1 час',
                        type: 'income_multiplier',
                        cost: 300,
                        duration: 60, // минуты
                        effect: { multiplier: 2 }
                    },
                    {
                        id: 'energy_saver_30m',
                        name: 'Экономия энергии',
                        description: 'Уменьшает расход энергии на 50% на 30 минут',
                        type: 'energy_saver',
                        cost: 150,
                        duration: 30,
                        effect: { energyCostReduction: 0.5 }
                    }
                ],
                consumables: [
                    {
                        id: 'energy_pack_50',
                        name: 'Пакет энергии',
                        description: 'Восстанавливает 50 единиц энергии',
                        type: 'energy',
                        cost: 50,
                        amount: 50
                    },
                    {
                        id: 'energy_pack_full',
                        name: 'Полная энергия',
                        description: 'Полностью восстанавливает энергию',
                        type: 'energy',
                        cost: 100,
                        amount: 'full'
                    }
                ]
            };
            
            // Проверяем, какие улучшения уже куплены
            const gameState = await GameState.findOne({ user: userId });
            if (gameState) {
                shopItems.upgrades = shopItems.upgrades.map(upgrade => ({
                    ...upgrade,
                    purchased: gameState.upgrades.some(u => u.upgradeId === upgrade.id)
                }));
            }
            
            res.json({
                success: true,
                data: shopItems
            });
            
        } catch (error) {
            console.error('Get shop items error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Ошибка при получении товаров' 
            });
        }
    }
    
    /**
     * Применение эффекта улучшения
     */
    applyUpgradeEffect(gameState, upgradeId) {
        switch (upgradeId) {
            case 'click_power_1':
                gameState.clickPower += 1;
                break;
            case 'energy_capacity_1':
                // Увеличение емкости обрабатывается при расчете энергии
                break;
            case 'passive_income_1':
                gameState.passiveIncome += 1;
                break;
        }
    }
}

module.exports = new ShopController();