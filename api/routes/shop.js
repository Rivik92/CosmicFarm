const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { authenticate } = require('../middleware/auth');

// Получение товаров магазина
router.get('/items', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { category = 'all' } = req.query;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Все товары магазина
    const allItems = [
      // Энергия
      { 
        id: 'energy_small', 
        name: '⚡ Малая энергия', 
        description: 'Восстанови 25 энергии', 
        category: 'energy',
        type: 'energy',
        value: 25,
        cost: 50,
        rarity: 'common',
        icon: '⚡'
      },
      { 
        id: 'energy_medium', 
        name: '⚡ Средняя энергия', 
        description: 'Восстанови 50 энергии', 
        category: 'energy',
        type: 'energy',
        value: 50,
        cost: 90,
        rarity: 'common',
        icon: '⚡⚡'
      },
      { 
        id: 'energy_large', 
        name: '⚡ Большая энергия', 
        description: 'Восстанови 100 энергии', 
        category: 'energy',
        type: 'energy',
        value: 100,
        cost: 160,
        rarity: 'common',
        icon: '⚡⚡⚡'
      },
      
      // Бустеры
      { 
        id: 'booster_2x_1h', 
        name: '🚀 Ускоритель x2', 
        description: '×2 к доходу на 1 час', 
        category: 'boosters',
        type: 'booster',
        multiplier: 2,
        duration: 3600000, // 1 час
        cost: 200,
        rarity: 'rare',
        icon: '🚀'
      },
      { 
        id: 'booster_3x_30m', 
        name: '🚀 Ускоритель x3', 
        description: '×3 к доходу на 30 минут', 
        category: 'boosters',
        type: 'booster',
        multiplier: 3,
        duration: 1800000, // 30 минут
        cost: 300,
        rarity: 'rare',
        icon: '🚀🚀'
      },
      { 
        id: 'booster_5x_15m', 
        name: '🚀 Ускоритель x5', 
        description: '×5 к доходу на 15 минут', 
        category: 'boosters',
        type: 'booster',
        multiplier: 5,
        duration: 900000, // 15 минут
        cost: 500,
        rarity: 'epic',
        icon: '🚀🚀🚀'
      },
      
      // Артефакты
      { 
        id: 'artifact_star', 
        name: '💎 Звездный артефакт', 
        description: '+10% к пассивному доходу (постоянно)', 
        category: 'artifacts',
        type: 'artifact',
        effect: 'passive_income',
        value: 0.1,
        cost: 1000,
        rarity: 'epic',
        icon: '💎'
      },
      { 
        id: 'artifact_energy', 
        name: '💎 Энергетический артефакт', 
        description: '+20% к максимальной энергии (постоянно)', 
        category: 'artifacts',
        type: 'artifact',
        effect: 'max_energy',
        value: 0.2,
        cost: 2000,
        rarity: 'epic',
        icon: '💎⚡'
      },
      { 
        id: 'artifact_click', 
        name: '💎 Кликовый артефакт', 
        description: '+50% к силе клика (постоянно)', 
        category: 'artifacts',
        type: 'artifact',
        effect: 'click_power',
        value: 0.5,
        cost: 5000,
        rarity: 'legendary',
        icon: '💎👆'
      },
      
      // Особые предложения
      { 
        id: 'special_starter', 
        name: '🎁 Стартовый набор', 
        description: '5000 звезд + ускоритель x3 на 1 час', 
        category: 'specials',
        type: 'bundle',
        contents: {
          stars: 5000,
          booster: 'booster_3x_1h'
        },
        cost: 1, // 1 звезда для тестирования
        rarity: 'special',
        icon: '🎁',
        limited: true
      },
      { 
        id: 'special_weekly', 
        name: '📦 Еженедельный набор', 
        description: '10000 звезд + 2 ускорителя x2 + артефакт', 
        category: 'specials',
        type: 'bundle',
        contents: {
          stars: 10000,
          boosters: ['booster_2x_1h', 'booster_2x_1h'],
          artifact: 'artifact_star'
        },
        cost: 5000,
        rarity: 'special',
        icon: '📦',
        limited: true
      }
    ];
    
    // Фильтруем по категории
    let items = allItems;
    if (category !== 'all') {
      items = items.filter(item => item.category === category);
    }
    
    // Проверяем ограниченные предложения
    items = items.map(item => {
      const inInventory = user.gameState.inventory?.get(item.id) || 0;
      const canAfford = user.gameState.stars >= item.cost;
      const isLimited = item.limited && inInventory > 0;
      
      return {
        ...item,
        inInventory: inInventory,
        canAfford: canAfford,
        available: !isLimited,
        maxPurchase: isLimited ? 0 : 10 // Максимум 10 штук
      };
    });
    
    res.json({
      success: true,
      items: items,
      userStars: user.gameState.stars,
      categories: ['all', 'energy', 'boosters', 'artifacts', 'specials']
    });
    
  } catch (error) {
    console.error('Ошибка получения товаров магазина:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Покупка товара
router.post('/buy', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { itemId, quantity = 1 } = req.body;
    
    if (!itemId) {
      return res.status(400).json({ error: 'Требуется ID товара' });
    }
    
    if (quantity < 1 || quantity > 10) {
      return res.status(400).json({ error: 'Количество должно быть от 1 до 10' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Получаем информацию о товаре
    const allItems = [
      { id: 'energy_small', cost: 50, type: 'energy', value: 25 },
      { id: 'energy_medium', cost: 90, type: 'energy', value: 50 },
      { id: 'energy_large', cost: 160, type: 'energy', value: 100 },
      { id: 'booster_2x_1h', cost: 200, type: 'booster', multiplier: 2, duration: 3600000 },
      { id: 'booster_3x_30m', cost: 300, type: 'booster', multiplier: 3, duration: 1800000 },
      { id: 'booster_5x_15m', cost: 500, type: 'booster', multiplier: 5, duration: 900000 },
      { id: 'artifact_star', cost: 1000, type: 'artifact', effect: 'passive_income', value: 0.1 },
      { id: 'artifact_energy', cost: 2000, type: 'artifact', effect: 'max_energy', value: 0.2 },
      { id: 'artifact_click', cost: 5000, type: 'artifact', effect: 'click_power', value: 0.5 },
      { id: 'special_starter', cost: 1, type: 'bundle', contents: { stars: 5000, booster: 'booster_3x_1h' } },
      { id: 'special_weekly', cost: 5000, type: 'bundle', contents: { stars: 10000, boosters: ['booster_2x_1h', 'booster_2x_1h'], artifact: 'artifact_star' } }
    ];
    
    const item = allItems.find(i => i.id === itemId);
    
    if (!item) {
      return res.status(404).json({ error: 'Товар не найден' });
    }
    
    // Проверяем ограниченные предложения
    if (item.limited) {
      const inInventory = user.gameState.inventory?.get(itemId) || 0;
      if (inInventory > 0) {
        return res.status(400).json({ error: 'Ограниченное предложение уже куплено' });
      }
    }
    
    // Рассчитываем общую стоимость
    const totalCost = item.cost * quantity;
    
    // Проверяем достаточно ли звезд
    if (user.gameState.stars < totalCost) {
      return res.status(400).json({ error: 'Недостаточно звезд' });
    }
    
    // Выполняем покупку
    user.gameState.stars -= totalCost;
    
    // Добавляем товар в инвентарь или применяем эффект
    if (item.type === 'energy') {
      // Восстанавливаем энергию
      const energyToAdd = item.value * quantity;
      user.gameState.energy = Math.min(
        user.gameState.maxEnergy,
        user.gameState.energy + energyToAdd
      );
      
    } else if (item.type === 'booster') {
      // Активируем бустер
      for (let i = 0; i < quantity; i++) {
        user.gameState.activeBoosters.push({
          boosterId: item.id,
          type: 'click',
          multiplier: item.multiplier,
          activatedAt: new Date(),
          expiresAt: new Date(Date.now() + item.duration)
        });
      }
      
      // Добавляем в инвентарь
      const currentCount = user.gameState.inventory?.get(itemId) || 0;
      user.gameState.inventory.set(itemId, currentCount + quantity);
      
    } else if (item.type === 'artifact') {
      // Применяем эффект артефакта
      switch(item.effect) {
        case 'passive_income':
          user.gameState.passiveIncome = Math.floor(user.gameState.passiveIncome * (1 + item.value));
          break;
        case 'max_energy':
          user.gameState.maxEnergy = Math.floor(user.gameState.maxEnergy * (1 + item.value));
          break;
        case 'click_power':
          user.gameState.clickPower = Math.floor(user.gameState.clickPower * (1 + item.value));
          break;
      }
      
      // Добавляем в инвентарь
      const currentCount = user.gameState.inventory?.get(itemId) || 0;
      user.gameState.inventory.set(itemId, currentCount + quantity);
      
    } else if (item.type === 'bundle') {
      // Применяем содержимое набора
      if (item.contents.stars) {
        user.gameState.stars += item.contents.stars;
      }
      
      if (item.contents.booster) {
        const boosterItem = allItems.find(i => i.id === item.contents.booster);
        if (boosterItem) {
          user.gameState.activeBoosters.push({
            boosterId: boosterItem.id,
            type: 'click',
            multiplier: boosterItem.multiplier,
            activatedAt: new Date(),
            expiresAt: new Date(Date.now() + boosterItem.duration)
          });
        }
      }
      
      if (item.contents.boosters) {
        for (const boosterId of item.contents.boosters) {
          const boosterItem = allItems.find(i => i.id === boosterId);
          if (boosterItem) {
            user.gameState.activeBoosters.push({
              boosterId: boosterItem.id,
              type: 'click',
              multiplier: boosterItem.multiplier,
              activatedAt: new Date(),
              expiresAt: new Date(Date.now() + boosterItem.duration)
            });
          }
        }
      }
      
      if (item.contents.artifact) {
        const artifactItem = allItems.find(i => i.id === item.contents.artifact);
        if (artifactItem) {
          switch(artifactItem.effect) {
            case 'passive_income':
              user.gameState.passiveIncome = Math.floor(user.gameState.passiveIncome * (1 + artifactItem.value));
              break;
            case 'max_energy':
              user.gameState.maxEnergy = Math.floor(user.gameState.maxEnergy * (1 + artifactItem.value));
              break;
            case 'click_power':
              user.gameState.clickPower = Math.floor(user.gameState.clickPower * (1 + artifactItem.value));
              break;
          }
        }
      }
      
      // Добавляем в инвентарь
      const currentCount = user.gameState.inventory?.get(itemId) || 0;
      user.gameState.inventory.set(itemId, currentCount + 1);
    }
    
    // Добавляем опыт
    user.gameState.experience += Math.floor(totalCost / 10);
    
    // Проверяем уровень
    user.checkLevelUp();
    
    // Создаем транзакцию
    await Transaction.createTransaction(
      userId,
      {
        type: 'purchase',
        amount: -totalCost,
        details: {
          itemId: itemId,
          itemName: item.name,
          itemType: item.type,
          quantity: quantity,
          totalCost: totalCost
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Покупка успешно завершена',
      itemId: itemId,
      quantity: quantity,
      totalCost: totalCost,
      newStars: user.gameState.stars,
      inventory: Object.fromEntries(user.gameState.inventory)
    });
    
  } catch (error) {
    console.error('Ошибка покупки товара:', error);
    
    if (error.message === 'Недостаточно средств') {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение инвентаря
router.get('/inventory', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Получаем информацию о всех предметах
    const allItems = [
      { id: 'energy_small', name: 'Малая энергия', type: 'energy', icon: '⚡' },
      { id: 'energy_medium', name: 'Средняя энергия', type: 'energy', icon: '⚡⚡' },
      { id: 'energy_large', name: 'Большая энергия', type: 'energy', icon: '⚡⚡⚡' },
      { id: 'booster_2x_1h', name: 'Ускоритель x2', type: 'booster', icon: '🚀' },
      { id: 'booster_3x_30m', name: 'Ускоритель x3', type: 'booster', icon: '🚀🚀' },
      { id: 'booster_5x_15m', name: 'Ускоритель x5', type: 'booster', icon: '🚀🚀🚀' },
      { id: 'artifact_star', name: 'Звездный артефакт', type: 'artifact', icon: '💎' },
      { id: 'artifact_energy', name: 'Энергетический артефакт', type: 'artifact', icon: '💎⚡' },
      { id: 'artifact_click', name: 'Кликовый артефакт', type: 'artifact', icon: '💎👆' }
    ];
    
    // Формируем инвентарь
    const inventory = [];
    
    if (user.gameState.inventory) {
      for (const [itemId, itemData] of user.gameState.inventory.entries()) {
        const itemInfo = allItems.find(i => i.id === itemId);
        
        if (itemInfo) {
          inventory.push({
            id: itemId,
            name: itemInfo.name,
            type: itemInfo.type,
            icon: itemInfo.icon,
            count: itemData.count || 0,
            equipped: itemData.equipped || false,
            lastUsed: itemData.lastUsed
          });
        }
      }
    }
    
    // Активные бустеры
    const activeBoosters = user.gameState.activeBoosters
      .filter(booster => booster.expiresAt > new Date())
      .map(booster => ({
        id: booster.boosterId,
        name: booster.name || 'Бустер',
        type: booster.type,
        multiplier: booster.multiplier,
        activatedAt: booster.activatedAt,
        expiresAt: booster.expiresAt,
        timeLeft: Math.max(0, booster.expiresAt - Date.now())
      }));
    
    res.json({
      success: true,
      inventory: inventory,
      activeBoosters: activeBoosters,
      totalItems: inventory.reduce((sum, item) => sum + item.count, 0),
      categories: {
        energy: inventory.filter(item => item.type === 'energy'),
        boosters: inventory.filter(item => item.type === 'booster'),
        artifacts: inventory.filter(item => item.type === 'artifact')
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения инвентаря:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Использование предмета из инвентаря
router.post('/use-item', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { itemId } = req.body;
    
    if (!itemId) {
      return res.status(400).json({ error: 'Требуется ID предмета' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Проверяем наличие предмета в инвентаре
    const itemData = user.gameState.inventory?.get(itemId);
    
    if (!itemData || itemData.count < 1) {
      return res.status(400).json({ error: 'Предмет не найден в инвентаре' });
    }
    
    // Получаем информацию о предмете
    const allItems = [
      { id: 'energy_small', type: 'energy', value: 25 },
      { id: 'energy_medium', type: 'energy', value: 50 },
      { id: 'energy_large', type: 'energy', value: 100 },
      { id: 'booster_2x_1h', type: 'booster', multiplier: 2, duration: 3600000 },
      { id: 'booster_3x_30m', type: 'booster', multiplier: 3, duration: 1800000 },
      { id: 'booster_5x_15m', type: 'booster', multiplier: 5, duration: 900000 }
    ];
    
    const itemInfo = allItems.find(i => i.id === itemId);
    
    if (!itemInfo) {
      return res.status(404).json({ error: 'Информация о предмете не найдена' });
    }
    
    // Применяем эффект предмета
    let result = {};
    
    if (itemInfo.type === 'energy') {
      // Восстанавливаем энергию
      const energyToAdd = itemInfo.value;
      const oldEnergy = user.gameState.energy;
      user.gameState.energy = Math.min(
        user.gameState.maxEnergy,
        user.gameState.energy + energyToAdd
      );
      
      result = {
        type: 'energy',
        added: energyToAdd,
        oldEnergy: oldEnergy,
        newEnergy: user.gameState.energy
      };
      
    } else if (itemInfo.type === 'booster') {
      // Активируем бустер
      user.gameState.activeBoosters.push({
        boosterId: itemId,
        type: 'click',
        multiplier: itemInfo.multiplier,
        activatedAt: new Date(),
        expiresAt: new Date(Date.now() + itemInfo.duration)
      });
      
      result = {
        type: 'booster',
        multiplier: itemInfo.multiplier,
        duration: itemInfo.duration,
        expiresAt: new Date(Date.now() + itemInfo.duration)
      };
    }
    
    // Уменьшаем количество предметов
    itemData.count -= 1;
    
    if (itemData.count <= 0) {
      user.gameState.inventory.delete(itemId);
    } else {
      user.gameState.inventory.set(itemId, itemData);
    }
    
    // Обновляем время последнего использования
    itemData.lastUsed = new Date();
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Предмет успешно использован',
      itemId: itemId,
      result: result,
      remaining: itemData.count,
      inventory: Object.fromEntries(user.gameState.inventory)
    });
    
  } catch (error) {
    console.error('Ошибка использования предмета:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Экипировка/снятие артефакта
router.post('/toggle-artifact', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { artifactId } = req.body;
    
    if (!artifactId) {
      return res.status(400).json({ error: 'Требуется ID артефакта' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Проверяем наличие артефакта
    const artifactData = user.gameState.inventory?.get(artifactId);
    
    if (!artifactData || artifactData.count < 1) {
      return res.status(400).json({ error: 'Артефакт не найден в инвентаре' });
    }
    
    // Получаем информацию об артефакте
    const allArtifacts = [
      { id: 'artifact_star', effect: 'passive_income', value: 0.1 },
      { id: 'artifact_energy', effect: 'max_energy', value: 0.2 },
      { id: 'artifact_click', effect: 'click_power', value: 0.5 }
    ];
    
    const artifactInfo = allArtifacts.find(a => a.id === artifactId);
    
    if (!artifactInfo) {
      return res.status(404).json({ error: 'Информация об артефакте не найдена' });
    }
    
    // Переключаем состояние экипировки
    const isEquipped = artifactData.equipped || false;
    
    if (isEquipped) {
      // Снимаем артефакт
      artifactData.equipped = false;
      
      // Убираем эффект
      switch(artifactInfo.effect) {
        case 'passive_income':
          user.gameState.passiveIncome = Math.floor(user.gameState.passiveIncome / (1 + artifactInfo.value));
          break;
        case 'max_energy':
          user.gameState.maxEnergy = Math.floor(user.gameState.maxEnergy / (1 + artifactInfo.value));
          
          // Корректируем текущую энергию
          if (user.gameState.energy > user.gameState.maxEnergy) {
            user.gameState.energy = user.gameState.maxEnergy;
          }
          break;
        case 'click_power':
          user.gameState.clickPower = Math.floor(user.gameState.clickPower / (1 + artifactInfo.value));
          break;
      }
      
    } else {
      // Экипируем артефакт
      artifactData.equipped = true;
      
      // Применяем эффект
      switch(artifactInfo.effect) {
        case 'passive_income':
          user.gameState.passiveIncome = Math.floor(user.gameState.passiveIncome * (1 + artifactInfo.value));
          break;
        case 'max_energy':
          user.gameState.maxEnergy = Math.floor(user.gameState.maxEnergy * (1 + artifactInfo.value));
          break;
        case 'click_power':
          user.gameState.clickPower = Math.floor(user.gameState.clickPower * (1 + artifactInfo.value));
          break;
      }
    }
    
    user.gameState.inventory.set(artifactId, artifactData);
    
    await user.save();
    
    res.json({
      success: true,
      message: isEquipped ? 'Артефакт снят' : 'Артефакт экипирован',
      artifactId: artifactId,
      equipped: !isEquipped,
      effect: artifactInfo.effect,
      value: artifactInfo.value,
      stats: {
        passiveIncome: user.gameState.passiveIncome,
        maxEnergy: user.gameState.maxEnergy,
        clickPower: user.gameState.clickPower,
        energy: user.gameState.energy
      }
    });
    
  } catch (error) {
    console.error('Ошибка переключения артефакта:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// История покупок
router.get('/purchase-history', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 50, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Получаем историю транзакций
    const transactions = await Transaction.getUserTransactions(userId, {
      limit: parseInt(limit),
      skip: skip,
      type: 'purchase'
    });
    
    // Форматируем данные
    const purchaseHistory = transactions.map(transaction => ({
      id: transaction._id,
      date: transaction.createdAt,
      itemId: transaction.details?.itemId,
      itemName: transaction.details?.itemName,
      quantity: transaction.details?.quantity || 1,
      cost: Math.abs(transaction.amount),
      balanceAfter: transaction.balanceAfter
    }));
    
    // Получаем общее количество покупок
    const totalPurchases = await Transaction.countDocuments({
      userId: userId,
      type: 'purchase'
    });
    
    // Рассчитываем общую сумму покупок
    const totalSpentResult = await Transaction.aggregate([
      { $match: { userId: require('mongoose').Types.ObjectId(userId), type: 'purchase' } },
      { $group: {
        _id: null,
        totalSpent: { $sum: { $abs: '$amount' } }
      }}
    ]);
    
    const totalSpent = totalSpentResult[0]?.totalSpent || 0;
    
    res.json({
      success: true,
      history: purchaseHistory,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPurchases: totalPurchases,
      totalPages: Math.ceil(totalPurchases / parseInt(limit)),
      totalSpent: totalSpent,
      stats: {
        avgPurchase: totalPurchases > 0 ? totalSpent / totalPurchases : 0,
        firstPurchase: purchaseHistory.length > 0 ? purchaseHistory[purchaseHistory.length - 1].date : null,
        lastPurchase: purchaseHistory.length > 0 ? purchaseHistory[0].date : null
      }
    });
    
  } catch (error) {
    console.error('Ошибка получения истории покупок:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Специальные предложения
router.get('/special-offers', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Проверяем специальные предложения для пользователя
    const offers = [];
    const now = new Date();
    const userCreated = new Date(user.createdAt);
    const daysSinceJoin = Math.floor((now - userCreated) / (1000 * 60 * 60 * 24));
    
    // Стартовое предложение (первые 3 дня)
    if (daysSinceJoin <= 3) {
      const hasStarterPack = user.gameState.inventory?.get('special_starter') || 0;
      
      if (hasStarterPack === 0) {
        offers.push({
          id: 'starter_pack',
          name: '🎁 Стартовый набор',
          description: 'Специальное предложение для новых игроков!',
          discount: 99, // 99% скидка
          originalPrice: 5000,
          price: 1,
          items: [
            { name: '5000 звезд', icon: '⭐' },
            { name: 'Ускоритель x3 на 1 час', icon: '🚀' }
          ],
          expiresIn: 3 - daysSinceJoin,
          limit: 1
        });
      }
    }
    
    // Еженедельное предложение
    const lastWeeklyPurchase = user.transactions?.find(t => 
      t.type === 'purchase' && t.details?.itemId === 'special_weekly'
    );
    
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    if (!lastWeeklyPurchase || new Date(lastWeeklyPurchase.createdAt) < weekAgo) {
      offers.push({
        id: 'weekly_pack',
        name: '📦 Еженедельный набор',
        description: 'Лучшее предложение недели!',
        discount: 50,
        originalPrice: 20000,
        price: 10000,
        items: [
          { name: '10000 звезд', icon: '⭐⭐' },
          { name: '2 ускорителя x2 на 1 час', icon: '🚀🚀' },
          { name: 'Звездный артефакт', icon: '💎' }
        ],
        expiresIn: 7,
        limit: 1
      });
    }
    
    // Предложение по уровню
    if (user.gameState.userLevel >= 10 && user.gameState.userLevel < 20) {
      offers.push({
        id: 'level_10_pack',
        name: '🏆 Набор для 10 уровня',
        description: 'Поздравляем с достижением 10 уровня!',
        discount: 30,
        originalPrice: 15000,
        price: 10500,
        items: [
          { name: '7500 звезд', icon: '⭐' },
          { name: 'Ускоритель x5 на 15 минут', icon: '🚀' },
          { name: 'Энергетический артефакт', icon: '💎⚡' }
        ],
        expiresIn: 14,
        limit: 1
      });
    }
    
    // Предложение по количеству кликов
    if (user.gameState.totalClicks >= 10000) {
      const hasClickMasterPack = user.gameState.inventory?.get('click_master_pack') || 0;
      
      if (hasClickMasterPack === 0) {
        offers.push({
          id: 'click_master_pack',
          name: '👑 Набор мастера кликов',
          description: 'За 10000 кликов! Вы настоящий мастер!',
          discount: 40,
          originalPrice: 25000,
          price: 15000,
          items: [
            { name: '15000 звезд', icon: '⭐⭐⭐' },
            { name: 'Кликовый артефакт', icon: '💎👆' },
            { name: '5 ускорителей x3', icon: '🚀🚀🚀🚀🚀' }
          ],
          expiresIn: 30,
          limit: 1
        });
      }
    }
    
    res.json({
      success: true,
      offers: offers,
      userLevel: user.gameState.userLevel,
      totalClicks: user.gameState.totalClicks,
      daysSinceJoin: daysSinceJoin
    });
    
  } catch (error) {
    console.error('Ошибка получения специальных предложений:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;