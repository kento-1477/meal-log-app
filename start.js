// --- PG GLOBAL DEBUG (dev only) ---
const { Client } = require('pg');
const _ClientQuery = Client.prototype.query;
Client.prototype.query = function (config, values, callback) {
  let text, params;
  if (typeof config === 'string') {
    text = config;
    params = values;
  } else {
    text = config && config.text;
    params = config && config.values;
  }
  const placeholders = ((text && text.match(/\$\d+/g)) || []).length;
  const count = Array.isArray(params) ? params.length : 0;
  if (count !== placeholders) {
    console.error('[PG GLOBAL MISMATCH]', { placeholders, count, text });
    console.error('params:', params);
    console.error(new Error('stack trace').stack);
  }
  return _ClientQuery.call(this, config, values, callback);
};
// --- /PG GLOBAL DEBUG ---

const app = require('./server');
const { initializeDatabase } = require('./services/db-init');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

/**
 * Starts the application.
 * Initializes the database and then starts the Express server.
 */
async function startApp() {
  // Ensure the database schema is up-to-date before starting the server.
  await initializeDatabase();

  app.listen(PORT, HOST, () => {
    console.log(`Server listening on ${HOST}:${PORT}`);
  });
}

startApp();
