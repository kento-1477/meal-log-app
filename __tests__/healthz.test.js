const request = require('supertest');
const app = require('../server');

describe('GET /healthz', () => {
  it('should return 200 ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/ok/i);
  });
});
