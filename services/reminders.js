const express = require('express');
const { pool } = require('./db');
const router = express.Router();

// 認証ミドルウェア（仮） - 実際の認証ミドルウェアに置き換える必要があります
const isAuthenticated = (req, res, next) => {
  // テスト環境では認証をスキップし、ダミーユーザーを設定
  if (process.env.NODE_ENV === 'test') {
    req.user = { id: 1 }; // ダミーユーザーID
    return next();
  }
  // 実際の認証チェック
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Authentication required.' });
};

// Helper function to get coaching level
async function _getCoachingLevel(userId, reminderId = null) {
  let coachingLevel = 'gentle'; // Default

  if (process.env.FEATURE_REMINDER_LEVEL_OVERRIDE === 'true' && reminderId) {
    const { rows } = await pool.query(
      'SELECT coaching_level FROM reminder_settings WHERE id = $1 AND user_id = $2',
      [reminderId, userId],
    );
    if (rows.length > 0 && rows[0].coaching_level !== null) {
      coachingLevel = rows[0].coaching_level;
    } else {
      // Fallback to user preferences if reminder_settings.coaching_level is NULL
      const { rows: userPrefs } = await pool.query(
        'SELECT coaching_level FROM user_preferences WHERE user_id = $1',
        [userId],
      );
      coachingLevel = userPrefs[0]?.coaching_level || 'gentle';
    }
  } else {
    // Use user preferences
    const { rows } = await pool.query(
      'SELECT coaching_level FROM user_preferences WHERE user_id = $1',
      [userId],
    );
    coachingLevel = rows[0]?.coaching_level || 'gentle';
  }
  return coachingLevel;
}

// --- Reminder Settings API ---

// GET /api/reminder-settings - ユーザーのリマインダー設定を取得
router.get('/reminder-settings', isAuthenticated, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM reminder_settings WHERE user_id = $1 ORDER BY notification_time',
      [req.user.id],
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching reminder settings:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// POST /api/reminder-settings - リマインダー設定を作成・更新
router.post('/reminder-settings', isAuthenticated, async (req, res) => {
  const {
    id,
    reminder_name,
    notification_time,
    days_of_week,
    is_enabled,
    message,
    coaching_level: incoming_coaching_level, // Rename to avoid conflict
  } = req.body;

  // バリデーション
  if (!reminder_name || !notification_time || !days_of_week) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  let coaching_level_to_save = null; // Default to NULL
  if (process.env.FEATURE_REMINDER_LEVEL_OVERRIDE === 'true') {
    coaching_level_to_save = incoming_coaching_level; // Use incoming if feature flag is true
  }

  try {
    let result;
    if (id) {
      // 更新 (UPSERT)
      result = await pool.query(
        `UPDATE reminder_settings 
         SET reminder_name = $1, notification_time = $2, days_of_week = $3, is_enabled = $4, message = $5, coaching_level = $8, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6 AND user_id = $7 RETURNING *`,
        [
          reminder_name,
          notification_time,
          days_of_week,
          is_enabled,
          message,
          id,
          req.user.id,
          coaching_level_to_save,
        ],
      );
    } else {
      // 作成
      result = await pool.query(
        `INSERT INTO reminder_settings (user_id, reminder_name, notification_time, days_of_week, is_enabled, message, coaching_level)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          req.user.id,
          reminder_name,
          notification_time,
          days_of_week,
          is_enabled,
          message,
          coaching_level_to_save,
        ],
      );
    }

    if (result.rows.length === 0) {
      // 権限がないか、IDが見つからない場合
      return res
        .status(404)
        .json({ message: 'Reminder setting not found or permission denied.' });
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error saving reminder setting:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// DELETE /api/reminder-settings/:id - リマインダー設定を削除
router.delete('/reminder-settings/:id', isAuthenticated, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM reminder_settings WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.id],
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: 'Reminder setting not found or permission denied.' });
    }

    res.status(200).json({ message: 'Reminder setting deleted successfully.' });
  } catch (error) {
    console.error('Error deleting reminder setting:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// --- Suggestion API ---

// GET /api/suggest-reminder-times - AIによる食事時間提案
router.get('/suggest-reminder-times', isAuthenticated, async (req, res) => {
  try {
    const seven_days_ago = new Date();
    seven_days_ago.setDate(seven_days_ago.getDate() - 7);

    const { rows } = await pool.query(
      `SELECT meal_type, TO_CHAR(consumed_at, 'HH24:MI:SS') as time
       FROM meal_logs
       WHERE user_id = $1 AND consumed_at >= $2`,
      [req.user.id, seven_days_ago],
    );

    if (rows.length === 0) {
      return res.json({ message: 'No recent meal data to suggest times.' });
    }

    const meal_times = {};
    rows.forEach((row) => {
      if (!meal_times[row.meal_type]) {
        meal_times[row.meal_type] = [];
      }
      const [hours, minutes, seconds] = row.time.split(':').map(Number);
      meal_times[row.meal_type].push(hours * 3600 + minutes * 60 + seconds);
    });

    const suggested_times = {};
    for (const meal_type in meal_times) {
      const times = meal_times[meal_type];
      const average_seconds = times.reduce((a, b) => a + b, 0) / times.length;
      const hours = Math.floor(average_seconds / 3600);
      const minutes = Math.floor((average_seconds % 3600) / 60);
      suggested_times[meal_type] =
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    res.json(suggested_times);
  } catch (error) {
    console.error('Error suggesting reminder times:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// --- Notifications API ---

// GET /api/notifications - 未読の通知を取得
router.get('/notifications', isAuthenticated, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC',
      [req.user.id],
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// POST /api/notifications/mark-as-read - 通知を既読にする
router.post(
  '/notifications/mark-as-read',
  isAuthenticated,
  async (req, res) => {
    const { notificationIds } = req.body; // Expects an array of notification IDs
    if (
      !notificationIds ||
      !Array.isArray(notificationIds) ||
      notificationIds.length === 0
    ) {
      return res.status(400).json({
        message: 'Invalid request body. Expected an array of notification IDs.',
      });
    }
    try {
      const result = await pool.query(
        'UPDATE notifications SET is_read = true WHERE user_id = $1 AND id = ANY($2::int[])',
        [req.user.id, notificationIds],
      );
      res
        .status(200)
        .json({ message: `${result.rowCount} notifications marked as read.` });
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  },
);

module.exports = router;

router.get('/coaching-level', isAuthenticated, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT coaching_level FROM user_preferences WHERE user_id=$1',
      [req.user.id],
    );
    res.json({ coaching_level: r.rows[0]?.coaching_level || 'gentle' });
  } catch (_e) {
    console.error('GET coaching-level error:', _e);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

router.post('/coaching-level', isAuthenticated, async (req, res) => {
  const { coaching_level } = req.body;
  if (!['gentle', 'intense'].includes(coaching_level)) {
    return res.status(400).json({ message: 'Invalid coaching_level' });
  }
  try {
    await pool.query(
      `
      INSERT INTO user_preferences (user_id, coaching_level, updated_at)
      VALUES ($1,$2,NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET coaching_level=EXCLUDED.coaching_level, updated_at=NOW()
    `,
      [req.user.id, coaching_level],
    );
    res.json({ message: 'ok' });
  } catch (_e) {
    console.error('POST coaching-level error:', _e);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
