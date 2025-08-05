// __tests__/log.test.js

// 1. モックを最上部に配置
jest.mock('../services/auth', () => ({
  initialize: jest.fn(),
  requireApiAuth: (req, res, next) => {
    req.user = { id: 1, username: 'testuser' };
    next();
  },
  requirePageAuth: (req, res, next) => {
    req.user = { id: 1, username: 'testuser' };
    next();
  },
}));

const request = require('supertest');
const app = require('../server');
const { pool } = require('../services/db'); // poolを直接インポート

describe('/log Endpoint Integration Tests', () => {
  beforeEach(async () => {
    // TRUNCATEでテーブルを高速リセット
    await pool.query('TRUNCATE TABLE meal_logs RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  test('should log a meal with only text and return success', async () => {
    const mealText = 'りんご一個';
    const initialCountResult = await pool.query(
      'SELECT COUNT(*) FROM meal_logs',
    );
    const initialCount = parseInt(initialCountResult.rows[0].count, 10);

    const response = await request(app)
      .post('/log')
      .send({ message: mealText });

    expect(response.statusCode).toBe(200);
    expect(response.body.ok).toBe(true);

    const finalCountResult = await pool.query('SELECT COUNT(*) FROM meal_logs');
    const finalCount = parseInt(finalCountResult.rows[0].count, 10);
    expect(finalCount).toBe(initialCount + 1);

    // ORDER BY id DESC LIMIT 1 で最新のレコードを取得
    const savedLogResult = await pool.query(
      'SELECT * FROM meal_logs ORDER BY id DESC LIMIT 1',
    );
    const savedLog = savedLogResult.rows[0];
    expect(savedLog.food_item).toBe(mealText);
    expect(savedLog.user_id).toBe(1);
  });
});
