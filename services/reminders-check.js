const { _pool } = require('./db');

function pad(n) {
  return String(n).padStart(2, '0');
}
function timeHHMM(now) {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
}
function weekdayEnLower(now) {
  return now.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
}
function prefixByLevel(level) {
  const v = (level || 'gentle').toLowerCase();
  return v === 'intense' ? '[Intense] ' : '[Gentle] ';
}

/**
 * リマインダー実行（同一分の重複抑止）
 * @param {import('pg').Pool} pool
 * @param {Date} now  テスト注入用の論理時刻（デフォルト: 現在時刻）
 */
async function runReminderCheck(pool, now = new Date()) {
  const timeStr = timeHHMM(now);
  const day = weekdayEnLower(now);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const due = await client.query(
      `
      SELECT id, user_id, reminder_name, message
      FROM reminder_settings
      WHERE is_enabled = true
        AND notification_time = $1
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text((days_of_week)::jsonb) d(day)
          WHERE d.day = $2
        )
      `,
      [timeStr, day],
    );

    for (const r of due.rows) {
      const pref = await client.query(
        `SELECT coaching_level FROM user_preferences WHERE user_id = $1`,
        [r.user_id],
      );
      const finalMessage =
        prefixByLevel(pref.rows[0]?.coaching_level) + r.message;

      // 同一分の重複をNOT EXISTSで抑止（notifications.created_atが必要）
      await client.query(
        `
        INSERT INTO notifications (user_id, message)
        SELECT $1, $2
        WHERE NOT EXISTS (
          SELECT 1
          FROM notifications n
          WHERE n.user_id = $1
            AND n.message = $2
            AND n.created_at >= date_trunc('minute', $3::timestamptz)
            AND n.created_at <  date_trunc('minute', $3::timestamptz) + interval '1 minute'
        )
        `,
        [r.user_id, finalMessage, now.toISOString()],
      );
    }

    await client.query('COMMIT');
  } catch (_e) {
    await client.query('ROLLBACK');
    throw _e;
  } finally {
    client.release();
  }
}

module.exports = { runReminderCheck };
