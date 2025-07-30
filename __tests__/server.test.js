const request = require('supertest');
const app = require('../server');
const { pool } = require('../services/db');

afterAll(async () => {
  // cronジョブを停止
  if (app.stopCron) {
    app.stopCron();
  }
});

describe('Meal Log API Integration Tests', () => {
  test('GET /api/meals should fail with 401 without authentication', async () => {
    const response = await request(app).get('/api/meals');
    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe('Authentication required.');
  });

  test('GET /api/meals should return meal logs for authenticated user', async () => {
    const response = await request(app)
      .get('/api/meals')
      .set('Authorization', 'Bearer test-token'); // Send auth header

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    const testMeal = response.body.find(
      (meal) => meal.food_item === 'Test Toast',
    );
    expect(testMeal).toBeDefined();
    expect(testMeal.calories).toBe(200);
    expect(testMeal.meal_type).toBe('Breakfast');
  });

  test('POST /api/meals should create a new meal log for authenticated user', async () => {
    const newMeal = {
      meal_type: 'Lunch',
      food_item: 'Test Salad',
      calories: 350,
      consumed_at: new Date().toISOString(),
    };

    const response = await request(app)
      .post('/api/meals')
      .set('Authorization', 'Bearer test-token') // Send auth header
      .send(newMeal);

    expect(response.statusCode).toBe(201);
    expect(response.body.message).toBe('Meal log created successfully');
    expect(response.body.meal).toBeDefined();
    expect(response.body.meal.food_item).toBe('Test Salad');

    const dbResult = await pool.query(
      'SELECT * FROM meal_logs WHERE food_item = $1',
      ['Test Salad'],
    );
    expect(dbResult.rows.length).toBe(1);
    expect(dbResult.rows[0].calories).toBe(350);
  });
});
