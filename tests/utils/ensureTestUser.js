const { pool } = require('../../services/db');

const TEST_USER_ID =
  process.env.TEST_USER_ID || '00000000-0000-0000-0000-000000000001';

async function ensureTestUser() {
  await pool.query(
    `INSERT INTO users (id, username, email, password_hash)
     VALUES ($1, 'testuser', 'test@example.com', 'password_hash_placeholder')
     ON CONFLICT (id) DO UPDATE
       SET username = EXCLUDED.username,
           email = EXCLUDED.email`,
    [TEST_USER_ID],
  );
  return TEST_USER_ID;
}

module.exports = { ensureTestUser, TEST_USER_ID };
