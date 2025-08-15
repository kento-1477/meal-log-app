const request = require('supertest');
const app = require('../server'); // export されていること
jest.mock('../src/services/nutritionService', () => ({
  analyzeText: jest.fn(async () => ({
    calories: 450,
    protein_g: 30,
    fat_g: 12,
    carbs_g: 50,
    raw: { mocked: true },
  })),
}));
const { createTestUser } = require('../tests/utils/createTestUser.js');
const { analyzeText } = require('../src/services/nutritionService');
const { pool } = require('../services/db.js'); // or knex に合わせて

describe('/log with nutrition', () => {
  beforeAll(async () => {
    // ここで migrate を走らせる仕組みがある場合は呼ぶ
    // 例: await runMigrationsForTest();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE users, meal_logs RESTART IDENTITY CASCADE',
    );
  });

  it('should insert meal, analyze nutrition, update row and respond with nutrition', async () => {
    const userId = await createTestUser();
    const res = await request(app)
      .post('/log')
      .field('user_id', userId)
      .field('meal_type', 'dinner')
      .field('description', 'grilled chicken with rice')
      .attach('image', Buffer.from('fake'), 'fake.jpg');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.logId).toBeDefined();
    expect(res.body.nutrition).toEqual({
      calories: 450,
      protein_g: 30,
      fat_g: 12,
      carbs_g: 50,
    });
    expect(analyzeText).toHaveBeenCalled();

    const { rows } = await pool.query(
      'SELECT calories, protein_g, fat_g, carbs_g, protein, fat, carbs FROM meal_logs WHERE id = $1',
      [res.body.logId],
    );
    const r = rows[0];
    // 型チェック（pg の numeric は string）
    expect(r.calories).toEqual(expect.any(String));
    expect(r.protein_g).toEqual(expect.any(String));
    expect(r.fat_g).toEqual(expect.any(String));
    expect(r.carbs_g).toEqual(expect.any(String));
    // 旧/新カラムが一致していること
    expect(r.protein).toBe(r.protein_g);
    expect(r.fat).toBe(r.fat_g);
    expect(r.carbs).toBe(r.carbs_g);
  });
});
afterAll(async () => {
  const { pool } = require('../services/db.js');
  if (pool && !pool.ended) {
    await pool.end();
  }
});
