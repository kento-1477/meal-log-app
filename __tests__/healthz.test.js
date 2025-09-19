const request = require('supertest');
const app = require('../server');

describe('GET /healthz', () => {
  it('should return 200 ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/ok/i);
  });
});

describe('GET /metrics', () => {
  it('exposes diff instrumentation', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('meal_log_shadow_diff_abs');
    expect(res.text).toContain('meal_log_shadow_daily_diff_rel');
  });
});
