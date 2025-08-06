const { pool } = require('../services/db.js');

async function createTestUser() {
  const result = await pool.query(`
    INSERT INTO users(username, email, password_hash)
    VALUES ('testuser', 'test@example.com', 'dummy')
    RETURNING id
  `);
  return result.rows[0].id; // uuid string
}

module.exports = { createTestUser };
