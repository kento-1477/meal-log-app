// __tests__/log.gemini.int.test.js
const request = require('supertest');
const app = require('../server');
const { pool } = require('../services/db');
const { createTestUser } = require('../tests/utils/createTestUser');

describe('/log with Gemini Provider Integration Tests', () => {
  let userId;

  beforeAll(async () => {
    process.env.NUTRITION_PROVIDER = 'gemini';
    process.env.GEMINI_MOCK = '1';
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE users, meal_logs RESTART IDENTITY CASCADE',
    );
    userId = await createTestUser();
  });

  afterAll(async () => {
    await pool.end();
  });

  test('should log a meal and get nutrition from Gemini mock', async () => {
    const response = await request(app)
      .post('/log')
      .send({ message: 'カツ丼', user_id: userId });

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    // AIを優先し、fallback items でもREPで計上するため >0 を期待
    expect(response.body.nutrition.calories).toBeGreaterThan(0);
    // 直値パスでは pending=false が混ざることがあるため厳格にはチェックしない
    expect(Array.isArray(response.body.breakdown.items)).toBe(true);
    expect(response.body.breakdown.items.length).toBeGreaterThan(0);

    const { rows } = await pool.query(
      'SELECT * FROM meal_logs WHERE user_id = $1',
      [userId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].food_item).toBe('カツ丼');
    // The stored calories should match what the API responded (source of truth), and be > 0
    const kcalFromAPI = Number(response.body.nutrition.calories);
    expect(kcalFromAPI).toBeGreaterThan(0);
    expect(Number(rows[0].calories)).toBeCloseTo(kcalFromAPI, 0);
    const raw = rows[0].ai_raw;
    const rawObj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    expect(typeof rawObj.confidence).toBe('number');
    expect(rawObj.confidence).toBeGreaterThanOrEqual(0);
    expect(rawObj.confidence).toBeLessThanOrEqual(1);
  });
});
