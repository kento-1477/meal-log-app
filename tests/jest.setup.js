jest.setTimeout(15000);
const { pool } = require('../services/db');
const client = require('prom-client');

beforeAll(() => {
  if (process.env.LOG_VERBOSE === '1') return; // 明示時は表示
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'debug').mockImplementation(() => {});
});

afterAll(async () => {
  // メトリクス interval 停止
  try {
    client.register.clear();
  } catch (_e) {
    // ignore
  }

  // pg 停止（多重呼び出しで落とさない）
  try {
    if (pool && !pool.ended) await pool.end();
  } catch (_e) {
    // ignore
  }
});
