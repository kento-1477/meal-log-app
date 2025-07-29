const { runReminderCheck } = require('../server');
const { pool } = require('../services/db');

function pad(n) {
  return String(n).padStart(2, '0');
}
function timeHHMM(now) {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
}
function weekdayEnLower(now) {
  return now.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
}

describe('Reminder Cron Job', () => {
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE notifications, reminder_settings, user_preferences RESTART IDENTITY CASCADE',
    );
  });

  test('should create only one notification per minute for the same reminder', async () => {
    const now = new Date();
    const currentTime = timeHHMM(now);
    const currentDay = weekdayEnLower(now);

    await pool.query(
      `INSERT INTO reminder_settings
       (user_id, reminder_name, notification_time, days_of_week, is_enabled, message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        1,
        'Test Reminder',
        currentTime,
        JSON.stringify([currentDay]),
        true,
        'Time to eat!',
      ],
    );

    await runReminderCheck(pool, now);
    await runReminderCheck(pool, now); // 同一分で2回実行しても1件

    const { rows } = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1',
      [1],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].message).toMatch(/Time to eat!/);
  });

  test('should change message based on coaching_level', async () => {
    const now = new Date();
    const currentTime = timeHHMM(now);
    const currentDay = weekdayEnLower(now);

    await pool.query(
      `INSERT INTO reminder_settings
       (user_id, reminder_name, notification_time, days_of_week, is_enabled, message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        1,
        'Coaching Reminder',
        currentTime,
        JSON.stringify([currentDay]),
        true,
        'Eat well!',
      ],
    );

    // デフォルト gentle
    await runReminderCheck(pool, now);
    let { rows } = await pool.query(
      'SELECT message FROM notifications WHERE user_id = $1',
      [1],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].message).toMatch(/^\[Gentle\] Eat well!/);

    // intense に更新して同一分で再実行
    await pool.query('TRUNCATE notifications');
    await pool.query(
      `INSERT INTO user_preferences (user_id, coaching_level)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET coaching_level = EXCLUDED.coaching_level`,
      [1, 'intense'],
    );
    await runReminderCheck(pool, now);
    ({ rows } = await pool.query(
      'SELECT message FROM notifications WHERE user_id = $1',
      [1],
    ));
    expect(rows.length).toBe(1);
    expect(rows[0].message).toMatch(/^\[Intense\] Eat well!/);
  });

  test('should not create notification if is_enabled is false', async () => {
    const now = new Date();
    const currentTime = timeHHMM(now);
    const currentDay = weekdayEnLower(now);

    await pool.query(
      `INSERT INTO reminder_settings
       (user_id, reminder_name, notification_time, days_of_week, is_enabled, message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        1,
        'Disabled Reminder',
        currentTime,
        JSON.stringify([currentDay]),
        false,
        'Should not appear',
      ],
    );

    await runReminderCheck(pool, now);

    const { rows } = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1',
      [1],
    );
    expect(rows.length).toBe(0);
  });
});
