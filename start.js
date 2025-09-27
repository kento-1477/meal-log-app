// --- PG GLOBAL DEBUG (dev only) ---
const { Client } = require('pg');
const origClientQuery = Client.prototype.query;
Client.prototype.query = function (text, params, ...rest) {
  if (typeof text === 'string' && text.includes('INSERT INTO "session"')) {
    return origClientQuery.call(this, text, params, ...rest);
  }
  const m = (typeof text === 'string' ? text.match(/\$(\d+)/g) : null) || [];
  const maxIndex = m.length ? Math.max(...m.map((s) => +s.slice(1))) : 0;
  const count = Array.isArray(params) ? params.length : 0;
  if (count !== maxIndex) {
    console.error('[PG GLOBAL MISMATCH]', {
      placeholders: maxIndex,
      count,
      text,
    });
  }
  return origClientQuery.call(this, text, params, ...rest);
};
// --- /PG GLOBAL DEBUG ---

// --- AI Boot Config Dump ---
function tail(s) {
  return typeof s === 'string' && s.length ? s.slice(-6) : 'none';
}

function toBool(v) {
  return /^(1|true|yes|on)$/i.test(String(v || '').trim());
}

console.log('[ai] boot config', {
  AI_PROVIDER: process.env.AI_PROVIDER,
  NUTRITION_PROVIDER: process.env.NUTRITION_PROVIDER,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL,
  GEMINI_KEY_tail: tail(process.env.GEMINI_API_KEY),
  ENABLE_AI_raw: process.env.ENABLE_AI,
  ENABLE_AI: toBool(process.env.ENABLE_AI),
  NODE_CMD: process.env.npm_lifecycle_event || 'unknown',
});
// --- /AI Boot Config Dump ---

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
