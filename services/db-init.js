const fs = require('fs').promises;
const path = require('path');
const pool = require('./db'); // Correctly import the exported pool

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
    const schemaSQL = await fs.readFile(schemaPath, 'utf8');

    console.log('Initializing database and ensuring tables exist...');
    await pool.query(schemaSQL);
    console.log('Database initialization complete.');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    // Exit the process if the database cannot be initialized,
    // as the application cannot run without it.
    process.exit(1);
  }
}

module.exports = { initializeDatabase };
