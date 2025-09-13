jest.setTimeout(15000);
const { pool } = require('../services/db');
const client = require('prom-client');

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
