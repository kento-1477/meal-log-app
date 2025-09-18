const request = require('supertest');

process.env.NORMALIZE_V2_SHADOW = '1';

const app = require('../server');
const { pool } = require('../services/db');
const { createTestUser } = require('../tests/utils/createTestUser');

async function truncateAll() {
  await pool.query(
    'TRUNCATE TABLE meal_logs_v2_shadow, diffs, ingest_requests, meal_logs, media_assets, users RESTART IDENTITY CASCADE',
  );
}

describe('Shadow pipeline writes', () => {
  let userId;

  beforeAll(async () => {
    await truncateAll();
    userId = await createTestUser();
  });

  afterAll(async () => {
    await truncateAll();
    delete process.env.NORMALIZE_V2_SHADOW;
  });

  it('writes shadow entry and diff for new log', async () => {
    const res = await request(app)
      .post('/log')
      .send({ message: 'とんかつ定食', user_id: userId })
      .expect(200);

    expect(res.body.idempotent).toBe(false);
    const logId = res.body.logId;

    const shadowRows = await pool.query(
      'SELECT user_id, slot, event, totals, meta FROM meal_logs_v2_shadow',
    );
    expect(shadowRows.rows).toHaveLength(1);
    const shadow = shadowRows.rows[0];
    expect(String(shadow.user_id)).toBe(String(userId));
    expect(shadow.slot).toBe('other');
    expect(shadow.event).toBe('eat');
    expect(shadow.totals).toBeTruthy();
    expect(shadow.meta).toBeTruthy();

    const diffRows = await pool.query(
      'SELECT phase, level, dkcal, dp, df, dc FROM diffs WHERE log_id = $1',
      [logId],
    );
    expect(diffRows.rows).toHaveLength(1);
    const diff = diffRows.rows[0];
    expect(diff.phase).toBe('P0');
    expect(diff.level).toBe('record');
  });
});
