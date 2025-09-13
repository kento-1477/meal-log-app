const { createTestUser } = require('../tests/utils/createTestUser.js');
const { randomUUID: uuidv4 } = require('crypto');

// 1. モックを最上部に配置
// The requireApiAuth mock needs to be updated to set the user from the request body
jest.mock('../services/auth', () => ({
  initialize: jest.fn(),
  requireApiAuth: (req, res, next) => {
    req.user = { id: req.body.user_id };
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
  let userId; // テスト間で共有するユーザーID

  beforeEach(async () => {
    // 関連テーブルをすべてリセット
    await pool.query(
      'TRUNCATE TABLE users, meal_logs RESTART IDENTITY CASCADE',
    );
    // テストユーザーを作成し、IDを取得
    userId = await createTestUser();
  });

  test('should log a meal with only text and return success', async () => {
    const mealText = 'りんご一個';
    const initialCountResult = await pool.query(
      'SELECT COUNT(*) FROM meal_logs',
    );
    const initialCount = parseInt(initialCountResult.rows[0].count, 10);

    const response = await request(app)
      .post('/log')
      .send({ message: mealText, user_id: userId }); // 取得したUUIDを送信

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true); // Check for success, not ok

    const finalCountResult = await pool.query('SELECT COUNT(*) FROM meal_logs');
    const finalCount = parseInt(finalCountResult.rows[0].count, 10);
    expect(finalCount).toBe(initialCount + 1);

    const savedLogResult = await pool.query(
      'SELECT * FROM meal_logs ORDER BY consumed_at DESC LIMIT 1',
    );
    const savedLog = savedLogResult.rows[0];
    expect(savedLog.food_item).toBe(response.body.dish);
    expect(savedLog.user_id).toBe(userId);
  });

  test('should return 500 if logging with a non-existent user_id', async () => {
    const nonExistentUserId = uuidv4();
    const mealText = '不正なユーザーからの投稿';

    const response = await request(app)
      .post('/log')
      .send({ message: mealText, user_id: nonExistentUserId });

    // The centralized error handler should catch the foreign key violation and return 500
    expect(response.statusCode).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('violates foreign key constraint');
  });
});
