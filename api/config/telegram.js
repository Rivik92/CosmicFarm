const TelegramBot = require('node-telegram-bot-api');

class TelegramConfig {
    constructor() {
        this.bot = null;
        this.webAppUrl = process.env.TELEGRAM_WEBAPP_URL || 'https://cosmic-clicker-game-huw7ybkc5-riviks-projects-0fa2b0e4.vercel.app/';
        this.init();
    }
    
    init() {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        
        if (!token) {
            console.warn('TELEGRAM_BOT_TOKEN не установлен. Telegram бот не будет запущен.');
            return;
        }
        
        try {
            this.bot = new TelegramBot(token, { polling: true });
            console.log('Telegram бот успешно запущен');
            
            this.setupCommands();
            this.setupWebApp();
            
        } catch (error) {
            console.error('Ошибка запуска Telegram бота:', error);
        }
    }
    
    setupCommands() {
        this.bot.setMyCommands([
            {
                command: '/start',
                description: 'Запустить игру'
            },
            {
                command: '/game',
                description: 'Открыть игру'
            },
            {
                command: '/profile',
                description: 'Мой профиль'
            },
            {
                command: '/top',
                description: 'Топ игроков'
            },
            {
                command: '/help',
                description: 'Помощь'
            }
        ]);
        
        // Обработчик команды /start
        this.bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const welcomeMessage = `🚀 Добро пожаловать в Cosmic Clicker!

🌟 Зарабатывай звёзды, улучшай свою планету и становись лучшим космическим кликером!

Нажми кнопку ниже, чтобы начать играть:`;
            
            this.bot.sendMessage(chatId, welcomeMessage, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '🎮 Начать игру',
                                web_app: { url: `${this.webAppUrl}/game` }
                            }
                        ],
                        [
                            {
                                text: '📊 Мой профиль',
                                web_app: { url: `${this.webAppUrl}/profile` }
                            },
                            {
                                text: '🏆 Топ игроков',
                                web_app: { url: `${this.webAppUrl}/leaderboard` }
                            }
                        ]
                    ]
                }
            });
        });
        
        // Обработчик команды /game
        this.bot.onText(/\/game/, (msg) => {
            const chatId = msg.chat.id;
            this.bot.sendMessage(chatId, 'Открываю игру...', {
                reply_markup: {
                    inline_keyboard: [[
                        {
                            text: '🎮 Открыть игру',
                            web_app: { url: `${this.webAppUrl}/game` }
                        }
                    ]]
                }
            });
        });
        
        // Обработчик команды /profile
        this.bot.onText(/\/profile/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            
            // Здесь будет запрос к API для получения данных пользователя
            const profileMessage = `👤 Ваш профиль:

🆔 ID: ${userId}
👤 Имя: ${msg.from.first_name} ${msg.from.last_name || ''}
🌐 Юзернейм: @${msg.from.username || 'не указан'}

Нажми кнопку ниже для просмотра детальной статистики:`;
            
            this.bot.sendMessage(chatId, profileMessage, {
                reply_markup: {
                    inline_keyboard: [[
                        {
                            text: '📊 Детальная статистика',
                            web_app: { url: `${this.webAppUrl}/profile` }
                        }
                    ]]
                }
            });
        });
        
        // Обработчик команды /top
        this.bot.onText(/\/top/, (msg) => {
            const chatId = msg.chat.id;
            this.bot.sendMessage(chatId, 'Загружаю топ игроков...', {
                reply_markup: {
                    inline_keyboard: [[
                        {
                            text: '🏆 Посмотреть топ',
                            web_app: { url: `${this.webAppUrl}/leaderboard` }
                        }
                    ]]
                }
            });
        });
        
        // Обработчик команды /help
        this.bot.onText(/\/help/, (msg) => {
            const chatId = msg.chat.id;
            const helpMessage = `🆘 Помощь по игре Cosmic Clicker

🎮 *Как играть:*
• Кликайте на планету для добычи звёзд
• Покупайте улучшения для увеличения дохода
• Смотрите рекламу для получения бонусов
• Завершайте миссии для наград

💰 *Как зарабатывать:*
1. Клики по планете
2. Пассивный доход
3. Просмотр рекламы
4. Выполнение миссий
5. Ежедневные бонусы

⚡ *Энергия:*
• Каждый клик расходует 1 энергию
• Энергия восстанавливается со временем
• Можно купить энергию в магазине

🛒 *Магазин:*
• Улучшения - постоянные бонусы
• Бустеры - временные усиления
• Энергия - восстановление энергии

📱 *Веб-приложение:*
• Откройте игру в браузере
• Или используйте кнопку ниже`;

            this.bot.sendMessage(chatId, helpMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        {
                            text: '🎮 Открыть игру',
                            web_app: { url: `${this.webAppUrl}/game` }
                        }
                    ]]
                }
            });
        });
    }
    
    setupWebApp() {
        // Веб-хук для получения данных от веб-приложения
        this.bot.on('web_app_data', async (msg) => {
            const chatId = msg.chat.id;
            const data = JSON.parse(msg.web_app_data.data);
            
            switch (data.action) {
                case 'share_score':
                    await this.handleShareScore(chatId, data);
                    break;
                case 'invite_friend':
                    await this.handleInviteFriend(chatId, data);
                    break;
                case 'claim_bonus':
                    await this.handleClaimBonus(chatId, data);
                    break;
            }
        });
    }
    
    async handleShareScore(chatId, data) {
        const shareMessage = `🎮 *Мой результат в Cosmic Clicker!*

🌟 Звёзд: ${data.score.toLocaleString()}
🏆 Уровень: ${data.level}
📈 Место в топе: #${data.rank}

Присоединяйся и соревнуйся со мной!`;
        
        await this.bot.sendMessage(chatId, shareMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '🎮 Присоединиться',
                        url: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=ref_${data.userId}`
                    }
                ]]
            }
        });
    }
    
    async handleInviteFriend(chatId, data) {
        const inviteLink = `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=ref_${data.userId}`;
        const inviteMessage = `🚀 *Приглашаю тебя в Cosmic Clicker!*

🌟 Зарабатывай звёзды кликая по планете
⚡ Улучшай свои способности
🏆 Соревнуйся с друзьями

Нажми кнопку ниже, чтобы начать играть:`;
        
        await this.bot.sendMessage(chatId, inviteMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '🎮 Начать играть',
                        url: inviteLink
                    }
                ]]
            }
        });
    }
    
    async handleClaimBonus(chatId, data) {
        // Здесь будет логика начисления бонуса
        await this.bot.sendMessage(chatId, '🎁 Бонус успешно получен!', {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '🎮 Продолжить игру',
                        web_app: { url: `${this.webAppUrl}/game` }
                    }
                ]]
            }
        });
    }
    
    /**
     * Отправка уведомления пользователю
     */
    async sendNotification(userId, message, options = {}) {
        if (!this.bot) return;
        
        try {
            await this.bot.sendMessage(userId, message, options);
        } catch (error) {
            console.error('Ошибка отправки уведомления:', error);
        }
    }
    
    /**
     * Отправка обновления баланса
     */
    async sendBalanceUpdate(userId, newBalance, change) {
        const message = `💰 *Обновление баланса*

${change > 0 ? '📈 Начислено' : '📉 Списано'}: *${Math.abs(change).toLocaleString()}* ⭐
💰 Новый баланс: *${newBalance.toLocaleString()}* ⭐

Продолжайте в том же духе! 🚀`;
        
        await this.sendNotification(userId, message, { parse_mode: 'Markdown' });
    }
    
    /**
     * Отправка достижения
     */
    async sendAchievement(userId, achievement) {
        const message = `🏆 *Новое достижение!*

🎖️ ${achievement.title}
📜 ${achievement.description}
🎁 Награда: *${achievement.reward}* ⭐

Поздравляем с достижением! 🎉`;
        
        await this.sendNotification(userId, message, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '🎮 Продолжить игру',
                        web_app: { url: `${this.webAppUrl}/game` }
                    }
                ]]
            }
        });
    }
}

module.exports = new TelegramConfig();