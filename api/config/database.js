const mongoose = require('mongoose');
const winston = require('winston');

// Конфигурация подключения к MongoDB
const databaseConfig = {
  // Основное подключение
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/cosmic-clicker',
  
  // Настройки подключения
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4,
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 10000,
    retryWrites: true,
    w: 'majority'
  },
  
  // Настройки для разных окружений
  environments: {
    development: {
      debug: true,
      autoIndex: true
    },
    production: {
      debug: false,
      autoIndex: false
    },
    test: {
      uri: process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/cosmic-clicker-test',
      debug: false,
      autoIndex: true
    }
  }
};

// Инициализация подключения
const initDatabase = async () => {
  try {
    const env = process.env.NODE_ENV || 'development';
    const envConfig = databaseConfig.environments[env] || {};
    
    // Применяем настройки окружения
    const options = {
      ...databaseConfig.options,
      ...envConfig
    };
    
    // Подключаемся к MongoDB
    await mongoose.connect(databaseConfig.uri, options);
    
    winston.info(`✅ MongoDB подключена (${env})`);
    
    // Настройка обработчиков событий
    setupEventHandlers();
    
    return mongoose.connection;
  } catch (error) {
    winston.error('❌ Ошибка подключения к MongoDB:', error);
    throw error;
  }
};

// Настройка обработчиков событий MongoDB
const setupEventHandlers = () => {
  const connection = mongoose.connection;
  
  connection.on('connected', () => {
    winston.info('MongoDB: Подключение установлено');
  });
  
  connection.on('error', (error) => {
    winston.error('MongoDB: Ошибка подключения:', error);
  });
  
  connection.on('disconnected', () => {
    winston.warn('MongoDB: Подключение разорвано');
  });
  
  connection.on('reconnected', () => {
    winston.info('MongoDB: Подключение восстановлено');
  });
  
  // Обработка сигналов завершения
  process.on('SIGINT', async () => {
    await connection.close();
    process.exit(0);
  });
};

// Функция для проверки состояния базы данных
const checkDatabaseHealth = async () => {
  try {
    const state = mongoose.connection.readyState;
    
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    const status = {
      state: states[state] || 'unknown',
      readyState: state,
      connected: state === 1,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
      models: Object.keys(mongoose.connection.models),
      collections: (await mongoose.connection.db?.listCollections().toArray())?.map(c => c.name) || []
    };
    
    // Проверяем производительность
    if (state === 1) {
      try {
        const start = Date.now();
        await mongoose.connection.db.command({ ping: 1 });
        status.ping = Date.now() - start;
      } catch (pingError) {
        status.pingError = pingError.message;
      }
    }
    
    return status;
  } catch (error) {
    return {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
};

// Функция для создания индексов
const createIndexes = async () => {
  try {
    const models = mongoose.connection.models;
    
    for (const [modelName, model] of Object.entries(models)) {
      if (model.createIndexes) {
        await model.createIndexes();
        winston.info(`Созданы индексы для модели: ${modelName}`);
      }
    }
    
    return { success: true, message: 'Все индексы созданы' };
  } catch (error) {
    winston.error('Ошибка создания индексов:', error);
    return { success: false, error: error.message };
  }
};

// Функция для очистки базы данных (только для тестов)
const clearDatabase = async () => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Очистка базы данных разрешена только в тестовом окружении');
  }
  
  try {
    const collections = await mongoose.connection.db?.collections();
    
    if (collections) {
      for (const collection of collections) {
        await collection.deleteMany({});
      }
    }
    
    return { success: true, message: 'База данных очищена' };
  } catch (error) {
    winston.error('Ошибка очистки базы данных:', error);
    return { success: false, error: error.message };
  }
};

// Функция для резервного копирования
const backupDatabase = async (backupPath = './backups') => {
  try {
    const { exec } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    
    // Создаем папку для бэкапов если её нет
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupPath, `backup-${timestamp}.gz`);
    
    // Команда для mongodump
    const mongoUri = new URL(databaseConfig.uri);
    const command = `mongodump --uri="${databaseConfig.uri}" --archive="${backupFile}" --gzip`;
    
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          winston.error('Ошибка резервного копирования:', error);
          reject(error);
        } else {
          const stats = fs.statSync(backupFile);
          winston.info(`Резервная копия создана: ${backupFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
          resolve({
            success: true,
            file: backupFile,
            size: stats.size,
            timestamp: timestamp
          });
        }
      });
    });
  } catch (error) {
    winston.error('Ошибка резервного копирования:', error);
    throw error;
  }
};

// Функция для восстановления из бэкапа
const restoreDatabase = async (backupFile) => {
  try {
    const { exec } = require('child_process');
    const fs = require('fs');
    
    if (!fs.existsSync(backupFile)) {
      throw new Error('Файл резервной копии не найден');
    }
    
    // Команда для mongorestore
    const command = `mongorestore --uri="${databaseConfig.uri}" --archive="${backupFile}" --gzip --drop`;
    
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          winston.error('Ошибка восстановления:', error);
          reject(error);
        } else {
          winston.info(`База данных восстановлена из: ${backupFile}`);
          resolve({
            success: true,
            message: 'База данных восстановлена'
          });
        }
      });
    });
  } catch (error) {
    winston.error('Ошибка восстановления:', error);
    throw error;
  }
};

// Экспорт функций
module.exports = {
  initDatabase,
  checkDatabaseHealth,
  createIndexes,
  clearDatabase,
  backupDatabase,
  restoreDatabase,
  mongoose,
  databaseConfig
};