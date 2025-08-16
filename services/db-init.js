const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const { pool } = require('./db'); // Correctly import the exported pool

/**
 * Initializes the database by executing the schema.sql file.
 * This ensures all necessary tables are created if they don't exist.
 */
async function initializeDatabase() {
  try {
    console.log('Attempting to connect to the database...');
    await pool.query('SELECT 1'); // Connection check
    console.log('Database connection successful.');

    const schemaPath = path.join(__dirname, '..', 'schema.sql');

    // ① schema.sql がなければ安全にスキップ（ここで return）
    if (!fssync.existsSync(schemaPath)) {
      console.log('schema.sql not found, skipping initialization.');
      return;
    }

    console.log('Initializing database and ensuring tables exist...');
    const schemaSQL = await fs.readFile(schemaPath, 'utf8');
    if (schemaSQL.trim().length > 0) {
      await pool.query(schemaSQL);
    }
    console.log('Database initialization complete.');
  } catch (error) {
    // ② ENOENT は想定内（上の existsSync で基本防げるが二重防御）
    if (error?.code === 'ENOENT') {
      console.warn('schema.sql not found during init, skipping.');
      return;
    }
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

module.exports = { initializeDatabase };
