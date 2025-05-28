require('dotenv').config()

module.exports = {
  // Server Configuration
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Database Configuration
  DB_CONFIG: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'payment-s2.0',
    username: process.env.DB_USER || 'admin',
    password: process.env.DB_PASS || 'admin',
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development',
    timezone: '-05:00'
  },

  // JWT Configuration
  JWT: {
    secret: process.env.JWT_SECRET || 'your-super-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },

  // Logging Configuration
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
}
