const { Pool } = require('pg');

// --- PostgreSQL接続設定 ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(process.env.NODE_ENV === 'production' && {
    ssl: {
      rejectUnauthorized: false, // Renderなどのホスティングサービスでは必要になることが多い
    },
  }),
});

// --- PostgreSQLデータ操作関数 ---
async function getMealLogs(userId, startDate, endDate) {
  try {
    let query = 'SELECT * FROM meal_logs WHERE user_id = $1';
    const values = [userId];

    if (startDate && endDate) {
      query += ' AND timestamp BETWEEN $2 AND $3';
      // endDateの時刻を23:59:59に設定して、その日全体が含まれるようにする
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      values.push(startDate, endOfDay);
    }

    query += ' ORDER BY timestamp DESC';

    const result = await pool.query(query, values);

    return result.rows.map((row) => ({
      timestamp: row.timestamp.toISOString(), // ISO形式で返す
      mealName: row.meal_name,
      protein: row.protein,
      fat: row.fat,
      carbs: row.carbs,
      calories: row.calories,
      imagePath: row.image_path,
      memo: row.memo,
      id: row.id,
    }));
  } catch (error) {
    console.error('Error fetching meal logs from PostgreSQL:', error);
    return [];
  }
}

async function addMealLog(userId, record) {
  try {
    const query = `INSERT INTO meal_logs (user_id, timestamp, meal_name, protein, fat, carbs, calories, image_path, memo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`;
    const values = [
      userId,
      record.timestamp,
      record.mealName,
      record.protein,
      record.fat,
      record.carbs,
      record.calories,
      record.imagePath,
      record.memo,
    ];
    const result = await pool.query(query, values);
    return result.rows[0].id; // 挿入されたレコードのIDを返す
  } catch (error) {
    console.error('Error adding meal log to PostgreSQL:', error);
    throw error;
  }
}

async function updateMealLog(userId, recordId, updates) {
  try {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const key in updates) {
      if (updates.hasOwnProperty(key)) {
        fields.push(`${key} = ${paramIndex++}`);
        values.push(updates[key]);
      }
    }

    if (fields.length === 0) {
      return { rowCount: 0 }; // 更新するフィールドがない場合
    }

    values.push(recordId);
    values.push(userId);

    const query = `UPDATE meal_logs SET ${fields.join(', ')} WHERE id = ${paramIndex++} AND user_id = ${paramIndex++}`;
    const result = await pool.query(query, values);
    return result;
  } catch (error) {
    console.error('Error updating meal log in PostgreSQL:', error);
    throw error;
  }
}

async function deleteMealLog(userId, recordId) {
  try {
    const query = 'DELETE FROM meal_logs WHERE id = $1 AND user_id = $2';
    const result = await pool.query(query, [recordId, userId]);
    return result;
  } catch (error) {
    console.error('Error deleting meal log from PostgreSQL:', error);
    throw error;
  }
}

async function hasUserSetGoals(userId) {
  try {
    const result = await pool.query(
      'SELECT 1 FROM user_goals WHERE user_id = $1',
      [userId],
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking user goals:', error);
    return false;
  }
}

module.exports = {
  getMealLogs,
  addMealLog,
  updateMealLog,
  deleteMealLog,
  hasUserSetGoals,
  pool, // poolもエクスポートしておくと、必要に応じてテストでモック化しやすい
};
