process.env.NODE_ENV = 'test';

jest.mock('../services/meals', () => ({
  getMealLogs: jest.fn().mockResolvedValue([
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
  // 正常系テスト
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

  // 認証なしの場合 (401 Unauthorized) テスト
  it('should return 401 if not authenticated', async () => {
    // テスト環境での認証スキップを一時的に無効化
    process.env.NODE_ENV = 'development'; // または 'production'
    const res = await request(app).get('/api/meal-data');
    expect(res.statusCode).toBe(401);
    process.env.NODE_ENV = 'test'; // テスト環境に戻す
  });

  // データベースエラーの場合 (500 Internal Server Error) テスト
  it('should return 500 if getMealLogs throws an error', async () => {
    getMealLogs.mockImplementationOnce(() => {
      throw new Error('Database error');
    });
    const res = await request(app).get('/api/meal-data').query({
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-01-01T23:59:59.999Z',
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: '食事データの取得に失敗しました。' });
  });
});
