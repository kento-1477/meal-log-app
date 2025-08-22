const request = require('supertest');
const app = require('../server');
const { pool } = require('../services/db');
const { createTestUser } = require('../tests/utils/createTestUser');

describe('UX-like integration tests for /log and /log/choose-slot', () => {
  let userId;

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE users, meal_logs RESTART IDENTITY CASCADE',
    );
    userId = await createTestUser();
  });

  afterAll(async () => {
    await pool.end();
  });

  test('tonkatsu → rice 300 & fillet', async () => {
    const res = await request(app)
      .post('/log')
      .field('message', 'とんかつ定食')
      .field('user_id', userId); // Pass the created user_id

    // The old code was checking for res.body.ok, but the new route returns success
    const { success, logId, nutrition, breakdown } = res.body;
    expect(res.status).toBe(200);
    expect(success).toBe(true);
    expect(logId).toBeTruthy();
    expect(breakdown?.items?.length).toBeGreaterThan(0);
    expect(breakdown?.slots?.rice_size).toBeTruthy();

    const initialCalories = nutrition.calories;

    const res2 = await request(app)
      .post('/log/choose-slot')
      .send({ logId, key: 'rice_size', value: 300, user_id: userId }); // Pass user_id

    expect(res2.status).toBe(200);
    expect(res2.body?.nutrition?.calories).toBeGreaterThan(initialCalories);

    const riceUpdatedCalories = res2.body.nutrition.calories;

    const res3 = await request(app)
      .post('/log/choose-slot')
      .send({ logId, key: 'pork_cut', value: 'ヒレ', user_id: userId }); // Pass user_id

    expect(res3.status).toBe(200);
    expect(res3.body?.nutrition?.calories).toBeLessThan(riceUpdatedCalories);
  });
});
