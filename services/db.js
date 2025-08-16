// services/db.js
const { Pool } = require('pg');

const isTest = process.env.NODE_ENV === 'test';
const urlFromEnv =
  (isTest && (process.env.TEST_DATABASE_URL || process.env.DATABASE_URL)) ||
  process.env.DATABASE_URL;

const connection = urlFromEnv
  ? { connectionString: urlFromEnv }
  : {
      host: process.env.DB_HOST || (isTest ? '127.0.0.1' : '127.0.0.1'),
      port: Number(process.env.DB_PORT || (isTest ? 5433 : 5432)),
      user: process.env.DB_USER || (isTest ? 'test_user' : 'postgres'),
      password: process.env.DB_PASSWORD || (isTest ? 'test_password' : ''),
      database: isTest
        ? process.env.TEST_DB_DATABASE || 'test_meal_log_db'
        : process.env.DB_DATABASE || 'meal_log_db',
    };

const pool = new Pool(connection);
module.exports = { pool };
