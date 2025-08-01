// services/db.js
const { Pool, types } = require('pg');

// numericをfloatに
types.setTypeParser(1700, (v) => (v == null ? null : parseFloat(v)));

const url = process.env.DATABASE_URL;
let config;

if (url) {
  // URLが localhost/127.0.0.1 なら SSL 無効、それ以外は Render 想定で SSL 有効
  const u = new URL(url);
  const isLocalHost = ['localhost', '127.0.0.1'].includes(u.hostname);
  config = {
    connectionString: url,
    ssl: isLocalHost ? false : { rejectUnauthorized: false },
  };
} else {
  config = {
    user: process.env.DB_USER || 'test_user',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_DATABASE || 'test_db',
    password: process.env.DB_PASSWORD || 'test_password',
    port: Number(process.env.DB_PORT) || 5432,
    ssl: false, // 明示
  };
}

const isTest = process.env.NODE_ENV === 'test';
if (!isTest && process.env.NODE_ENV !== 'production') {
  console.log(
    '[db] host/url=%s ssl=%o',
    process.env.DATABASE_URL || process.env.DB_HOST,
    config.ssl,
  );
}

const pool = new Pool(config);
module.exports = { pool };
