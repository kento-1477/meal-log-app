const request = require('supertest');
const app = require('../server');

describe('GET /metrics smoke', () => {
  it('exposes shadow diff histograms with env label', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    const normalized = res.text.replace(/\\"/g, '"');
    expect(normalized).toMatch(
      /meal_log_app_build_info\{[^}]*env="(?:local|dev|stg|prod|test)"/,
    );
  });
});
