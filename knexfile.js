require('dotenv').config(); // .env ファイルを読み込む

module.exports = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'test_user',
      password: process.env.DB_PASSWORD || 'test_password',
      database: process.env.DB_DATABASE || 'meal_log_db',
    },
    migrations: {
      directory: './migrations', // マイグレーションファイルの保存場所
    },
    seeds: {
      directory: './seeds', // シードファイルの保存場所（初期データ投入用）
    },
  },

  test: {
    client: 'pg',
    connection: process.env.TEST_DATABASE_URL || {
      // テスト用のDB URLを優先
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5433, // CIのdocker-composeで5433にマッピング
      user: process.env.DB_USER || 'test_user',
      password: process.env.DB_PASSWORD || 'test_password',
      database: process.env.TEST_DB_DATABASE || 'test_meal_log_db', // テスト用DB名
    },
    migrations: {
      directory: './migrations',
    },
    seeds: {
      directory: './seeds',
    },
  },

  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL, // 本番環境ではDATABASE_URLを必須とする
    migrations: {
      directory: './migrations',
    },
    seeds: {
      directory: './seeds',
    },
    ssl: { rejectUnauthorized: false }, // 本番環境ではSSLを有効にする場合
  },
};
