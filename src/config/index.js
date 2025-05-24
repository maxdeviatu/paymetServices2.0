require('dotenv').config()

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  DB_CONFIG: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'tienda',
    username: process.env.DB_USER || 'admin',
    password: process.env.DB_PASS || 'admin',
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development'
  }
}
