const request = require('supertest');
const app = require('../server');
const { pool } = require('../services/db');
const { createTestUser } = require('../tests/utils/createTestUser');

const describeIfDb = global.describeIfDb || describe;

async function truncateAll() {
  await pool.query(
    'TRUNCATE TABLE ingest_requests, meal_logs, media_assets, users RESTART IDENTITY CASCADE',
  );
}

describeIfDb('POST /log idempotency behaviour', () => {
  let userId;

  beforeAll(async () => {
    await truncateAll();
    userId = await createTestUser();
  });

  afterAll(async () => {
    await truncateAll();
  });

  it('returns cached response when Idempotency-Key is reused', async () => {
    const key = 'demo-key-001';
    const first = await request(app)
      .post('/log')
      .set('Idempotency-Key', key)
      .send({ message: 'カツ丼', user_id: userId })
      .expect(200);

    expect(first.body.idempotent).toBe(false);
    const logId = first.body.logId;

    const second = await request(app)
      .post('/log')
      .set('Idempotency-Key', key)
      .send({ message: 'カツ丼', user_id: userId })
      .expect(200);

    expect(second.body.idempotent).toBe(true);
    expect(second.body.logId).toBe(logId);

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM meal_logs WHERE user_id = $1',
      [userId],
    );
    expect(rows[0].count).toBe(1);
  });

  it('auto-generated key treats reordered body as the same payload', async () => {
    await pool.query(
      'TRUNCATE TABLE ingest_requests, meal_logs RESTART IDENTITY CASCADE',
    );

    const first = await request(app)
      .post('/log')
      .send({ message: '親子丼', user_id: userId })
      .expect(200);

    expect(first.body.idempotent).toBe(false);

    const second = await request(app)
      .post('/log')
      .send({ user_id: userId, message: '親子丼' })
      .expect(200);

    expect(second.body.idempotent).toBe(true);
    expect(second.body.logId).toBe(first.body.logId);
  });

  it('serialises concurrent requests with the same Idempotency-Key', async () => {
    await pool.query(
      'TRUNCATE TABLE ingest_requests, meal_logs RESTART IDENTITY CASCADE',
    );

    const key = 'parallel-key-1';
    const payload = { message: 'からあげ定食', user_id: userId };

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post('/log').set('Idempotency-Key', key).send(payload),
      ),
    );

    const successes = responses.filter((res) => res.status === 200);
    expect(successes).toHaveLength(5);

    const nonIdempotent = successes.filter(
      (res) => res.body.idempotent === false,
    );
    expect(nonIdempotent).toHaveLength(1);

    const logId = nonIdempotent[0].body.logId;
    const idempotent = successes.filter((res) => res.body.idempotent === true);
    expect(idempotent).toHaveLength(4);
    idempotent.forEach((res) => {
      expect(res.body.logId).toBe(logId);
    });

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM meal_logs WHERE user_id = $1',
      [userId],
    );
    expect(rows[0].count).toBe(1);
  });
});
