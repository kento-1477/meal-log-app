/* global describeIfDb */
const request = require('supertest');
const client = require('prom-client');

const app = require('../server');
const { pool } = require('../services/db');
const { createTestUser } = require('../tests/utils/createTestUser');

async function truncateAll() {
  await pool.query(
    'TRUNCATE TABLE meal_logs_v2_shadow, diffs, ingest_requests, meal_logs, media_assets, users RESTART IDENTITY CASCADE',
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRows(sql, params, minCount = 1, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    const res = await pool.query(sql, params);
    if (res.rows.length >= minCount) return res.rows;
    await sleep(25);
  }
  throw new Error('Timed out waiting for query rows');
}

describeIfDb('Shadow pipeline writes', () => {
  let userId;

  beforeEach(async () => {
    process.env.NORMALIZE_V2_SHADOW = '1';
    process.env.DUAL_WRITE_V2 = '1';
    await truncateAll();
    userId = await createTestUser();
    client.register.resetMetrics();
  });

  afterAll(async () => {
    await truncateAll();
    delete process.env.NORMALIZE_V2_SHADOW;
    delete process.env.DUAL_WRITE_V2;
  });

  it('writes shadow entry and diff for new log', async () => {
    const res = await request(app)
      .post('/log')
      .send({ message: 'とんかつ定食', user_id: userId })
      .expect(200);

    expect(res.body.idempotent).toBe(false);
    const logId = res.body.logId;

    const legacyRows = await pool.query(
      'SELECT calories, protein_g, fat_g, carbs_g FROM meal_logs WHERE id = $1',
      [logId],
    );
    expect(legacyRows.rows).toHaveLength(1);
    const legacyTotals = legacyRows.rows[0];

    const shadowRows = await waitForRows(
      'SELECT user_id, slot, event, totals, meta FROM meal_logs_v2_shadow',
      [],
    );
    expect(shadowRows).toHaveLength(1);
    const shadow = shadowRows[0];
    expect(String(shadow.user_id)).toBe(String(userId));
    expect(shadow.slot).toBe('other');
    expect(shadow.event).toBe('eat');
    expect(shadow.totals).toBeTruthy();
    expect(shadow.meta).toBeTruthy();

    const mealRows = await pool.query(
      'SELECT slot, event, totals, meta FROM meal_logs WHERE id = $1',
      [logId],
    );
    expect(mealRows.rows).toHaveLength(1);
    const meal = mealRows.rows[0];
    expect(meal.slot).toBe('other');
    expect(meal.event).toBe('eat');
    expect(meal.totals).toBeTruthy();
    expect(Number(meal.totals.calories)).toBeCloseTo(
      Number(shadow.totals.calories),
      5,
    );
    expect(meal.meta?.v2).toBeTruthy();
    expect(typeof meal.meta.v2.hash).toBe('string');
    expect(meal.meta.v2.hash.length).toBeGreaterThan(0);
    expect(typeof meal.meta.v2.idempotency_key_hash).toBe('string');
    expect(meal.meta.v2.idempotency_key_hash.length).toBeGreaterThan(0);

    const diffRows = await pool.query(
      'SELECT phase, level, dkcal, dp, df, dc, rel_p, details FROM diffs WHERE log_id = $1',
      [logId],
    );
    expect(diffRows.rows).toHaveLength(1);
    const diff = diffRows.rows[0];
    expect(diff.phase).toBe('P0');
    expect(diff.level).toBe('record');
    expect(diff.details).toBeTruthy();
    expect(diff.details.legacy_totals).toBeTruthy();
    expect(diff.details.shadow_totals).toBeTruthy();
    expect(Number(diff.details.legacy_totals.calories)).toBe(
      Number(legacyTotals.calories),
    );
    expect(Number(diff.details.shadow_totals.calories)).toBe(
      Number(shadow.totals.calories),
    );
    expect(typeof diff.details.idempotency_key_hash).toBe('string');
    expect(diff.details.idempotency_key_hash.length).toBeGreaterThan(0);
    expect(typeof diff.details.normalized_hash).toBe('string');
    expect(diff.details.normalized_hash.length).toBeGreaterThan(0);
    expect(diff.details.thresholds).toBeTruthy();
    const expectedKcalThreshold = Math.max(
      40,
      0.08 * Number(legacyTotals.calories || 0),
    );
    expect(Number(diff.details.thresholds.dkcal)).toBeCloseTo(
      expectedKcalThreshold,
      5,
    );
    expect(Number(diff.details.abs_diff.dkcal)).toBe(
      Math.abs(Number(diff.dkcal || 0)),
    );
    expect(Number(diff.details.rel_diff.rel_p)).toBe(Number(diff.rel_p));

    const dayRows = await pool.query(
      `SELECT level, dkcal, dp, df, dc, rel_p, rel_f, rel_c, details
         FROM diffs
        WHERE user_id = $1 AND level = 'day'`,
      [userId],
    );
    expect(dayRows.rows).toHaveLength(1);
    const day = dayRows.rows[0];
    expect(day.level).toBe('day');
    expect(Number(day.dkcal)).toBe(Number(diff.dkcal));
    expect(day.details.record_count).toBe(1);
    expect(day.details.abs_diff).toBeTruthy();
    expect(day.details.abs_diff.sum).toBeTruthy();
    expect(Number(day.details.abs_diff.sum.dkcal)).toBeCloseTo(
      Math.abs(Number(diff.dkcal || 0)),
      5,
    );
    expect(day.details.thresholds).toBeTruthy();
    expect(Number(day.details.thresholds.dkcal)).toBeCloseTo(
      expectedKcalThreshold,
      5,
    );
  });

  it('records diff breach and metrics when normalized totals diverge', async () => {
    const res = await request(app)
      .post('/log')
      .send({ message: 'diff breach special', user_id: userId })
      .expect(200);

    expect(res.body.idempotent).toBe(false);
    const logId = res.body.logId;

    const diff = (
      await waitForRows(
        'SELECT dkcal, details FROM diffs WHERE log_id = $1 AND level = $2',
        [logId, 'record'],
      )
    )[0];
    const dkcalAbs = Math.abs(Number(diff.dkcal || 0));
    const threshold = Number(diff.details?.thresholds?.dkcal || 0);
    expect(dkcalAbs).toBeGreaterThan(threshold);

    const dayRows = await waitForRows(
      `SELECT details FROM diffs WHERE user_id = $1 AND level = 'day'`,
      [userId],
    );
    expect(Number(dayRows[0]?.details?.breaches?.dkcal || 0)).toBeGreaterThan(
      0,
    );

    const metrics = await request(app).get('/metrics').expect(200);
    expect(metrics.text).toMatch(
      /meal_log_shadow_diff_breach_total\{[^}]*field="dkcal"[^}]*}\s+[1-9]\d*(\.\d+)?/,
    );
    expect(metrics.text).toMatch(
      /meal_log_shadow_daily_diff_breach_total\{[^}]*field="dkcal"[^}]*}\s+[1-9]\d*(\.\d+)?/,
    );
  });
});
