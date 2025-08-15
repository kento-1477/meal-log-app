const { pool } = require('../../services/db.js');

async function createTestUser() {
  const uniqueSuffix = Date.now();
  const result = await pool.query(
    `
    INSERT INTO users(username, email, password_hash)
    VALUES ($1, $2, 'dummy')
    RETURNING id
  `,
    [`testuser_${uniqueSuffix}`, `test_${uniqueSuffix}@example.com`],
  );
  return result.rows[0].id; // uuid string
}

module.exports = { createTestUser };
