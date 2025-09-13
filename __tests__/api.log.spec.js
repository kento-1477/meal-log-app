const request = require('supertest');
const app = require('../server');
const { pool } = require('../services/db');
const { createTestUser } = require('../tests/utils/createTestUser');

describe('/api/log/:id with row_version locking', () => {
  let userId;

  beforeAll(async () => {
    await pool.query(
      'TRUNCATE TABLE users, meal_logs RESTART IDENTITY CASCADE',
    );
    userId = await createTestUser();
  });

  it('should update a log and retrieve the same ai_raw data', async () => {
    const createRes = await request(app)
      .post('/log')
      .send({ message: 'カツ丼 小盛り', user_id: userId })
      .expect(200);
    const logId = createRes.body.logId;

    const getRes = await request(app)
      .get(`/api/log/${logId}`)
      .query({ user_id: userId })
      .expect(200);
    const prevVersion = getRes.body.item.row_version;
    expect(typeof prevVersion).toBe('number');

    await request(app)
      .post('/log/choose-slot')
      .send({
        logId,
        key: 'rice_size',
        value: '200',
        prevVersion,
        user_id: userId,
      })
      .expect(200);

    const finalRes = await request(app)
      .get(`/api/log/${logId}`)
      .query({ user_id: userId })
      .expect(200);

    expect(finalRes.body.item.row_version).toBe(prevVersion + 1);
    expect(finalRes.body.item.ai_raw).toBeTruthy();
  });

  it('should return 409 conflict on concurrent update', async () => {
    const createRes = await request(app)
      .post('/log')
      .send({ message: '親子丼', user_id: userId })
      .expect(200);
    const logId = createRes.body.logId;

    const getRes = await request(app)
      .get(`/api/log/${logId}`)
      .query({ user_id: userId })
      .expect(200);
    const prevVersion = getRes.body.item.row_version;

    await request(app)
      .post('/log/choose-slot')
      .send({
        logId,
        key: 'rice_size',
        value: '150',
        prevVersion,
        user_id: userId,
      })
      .expect(200);

    await request(app)
      .post('/log/choose-slot')
      .send({
        logId,
        key: 'pork_cut',
        value: 'ロース',
        prevVersion,
        user_id: userId,
      })
      .expect(409);
  });
});
