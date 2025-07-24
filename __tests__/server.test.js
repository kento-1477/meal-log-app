process.env.NODE_ENV = 'test';

jest.mock('../services/meals', () => ({
  getMealLogs: jest
    .fn()
    .mockResolvedValue([
      {
        id: 1,
        userId: 1,
        mealName: 'banana',
        calories: 89,
        protein: 1,
        fat: 0,
        carbs: 20,
        imagePath: '',
        memo: '',
      },
    ]),
}));
const { getMealLogs } = require('../services/meals');
const request = require('supertest');
const { app } = require('../server');

describe('GET /api/meal-data', () => {
  it('returns 200 and array', async () => {
    const res = await request(app).get('/api/meal-data').query({
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-01T23:59:59.999Z',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: 1 })]),
    );
    expect(getMealLogs).toHaveBeenCalledWith(
      1,
      '2024-01-01T00:00:00.000Z',
      '2024-01-01T23:59:59.999Z',
    );
  });
});
