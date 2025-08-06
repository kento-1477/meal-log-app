const { createTestUser } = require('../tests/utils/createTestUser.js');

// 1. モックを最上部に配置
jest.mock('../services/auth', () => ({
  initialize: jest.fn(),
  requireApiAuth: (req, res, next) => {
    // このテストではヘルパーでユーザーを作成するため、モックはシンプルにする
    next();
  },
  requirePageAuth: (req, res, next) => {
    req.user = { id: 1, username: 'testuser' }; // ページ認証は別途必要なら残す
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
      .send({ message: mealText, user_id: userId }); // 取得したUUIDを送信

    expect(response.statusCode).toBe(200);
    expect(response.body.ok).toBe(true);

    const finalCountResult = await pool.query('SELECT COUNT(*) FROM meal_logs');
    const finalCount = parseInt(finalCountResult.rows[0].count, 10);
    expect(finalCount).toBe(initialCount + 1);

    const savedLogResult = await pool.query(
      'SELECT * FROM meal_logs ORDER BY consumed_at DESC LIMIT 1', // idではなくconsumed_atでソート
    );
    const savedLog = savedLogResult.rows[0];
    expect(savedLog.food_item).toBe(mealText);
    expect(savedLog.user_id).toBe(userId); // 保存されたuser_idがUUIDと一致するか確認
  });
});
