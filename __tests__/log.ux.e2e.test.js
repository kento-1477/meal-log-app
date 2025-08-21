const request = require('supertest');
let app;

// Mock the auth middleware to always pass for tests
jest.mock('../services/auth', () => ({
  requireApiAuth: (req, res, next) => {
    req.user = { id: 'test-user', email: 'test@example.com' };
    next();
  },
}));

beforeAll(() => {
  // Ensure the server is loaded for testing
  app = require('../server');
});

afterAll((done) => {
  if (app && app.close) {
    app.close(done);
  } else {
    done();
  }
});

test('tonkatsu → rice 300 & fillet', async () => {
  const res = await request(app).post('/log').field('message', 'とんかつ定食');

  expect(res.status).toBe(200);
  const { ok, logId, nutrition, breakdown } = res.body;
  expect(ok).toBe(true);
  expect(logId).toBeTruthy();
  expect(breakdown?.items?.length).toBeGreaterThan(0);
  expect(breakdown?.slots?.rice_size).toBeTruthy();

  const initialCalories = nutrition.calories;

  const res2 = await request(app)
    .post('/log/choose-slot')
    .send({ logId, key: 'rice_size', value: 300 });

  expect(res2.status).toBe(200);
  expect(res2.body?.nutrition?.calories).toBeGreaterThan(initialCalories);

  const riceUpdatedCalories = res2.body.nutrition.calories;

  const res3 = await request(app)
    .post('/log/choose-slot')
    .send({ logId, key: 'pork_cut', value: 'ヒレ' });

  expect(res3.status).toBe(200);
  expect(res3.body?.nutrition?.calories).toBeLessThan(riceUpdatedCalories);
});
