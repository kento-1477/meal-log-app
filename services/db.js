const { Pool, types } = require('pg');

if (global.__pgPoolCreated) {
  throw new Error('Multiple pg.Pool detected: use services/db.js only');
}
global.__pgPoolCreated = true;

const { buildPgConnection } = require('./db-config');

// JSON/JSONB を常に JS オブジェクトで返す
types.setTypeParser(types.builtins.JSON, (v) =>
  v == null ? null : JSON.parse(v),
);
types.setTypeParser(types.builtins.JSONB, (v) =>
  v == null ? null : JSON.parse(v),
);

const env = process.env.NODE_ENV || 'development';
const connectionConfig = buildPgConnection(env);

// Log SSL status for easier debugging on startup, but not during tests.
if (env !== 'test') {
  const useSSL = !!connectionConfig.ssl;
  const verify = useSSL
    ? Boolean(connectionConfig.ssl && connectionConfig.ssl.rejectUnauthorized)
    : 'N/A';
  console.log(
    `DB Connection[${env}]: SSL ${useSSL ? 'enabled' : 'disabled'}. Verification: ${verify}`,
  );
}

const pool = new Pool({
  connectionString: connectionConfig.connectionString,
  ssl: connectionConfig.ssl ?? undefined,
});

// --- DEBUG only ---
const _origQuery = pool.query.bind(pool);
pool.query = (text, params, ...rest) => {
  const placeholders = (text.match(/\$\d+/g) || []).length;
  const count = Array.isArray(params) ? params.length : 0;
  if (count !== placeholders) {
    console.error('[SQL PARAM MISMATCH]', { placeholders, count, text });
    console.error('params:', params);
    // ここでスタックもあると便利
    console.error(new Error('stack trace for mismatch').stack);
  }
  return _origQuery(text, params, ...rest);
};
// --- /DEBUG ---

module.exports = { pool };
