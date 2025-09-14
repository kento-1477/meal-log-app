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
  const m = text.match(/\$(\d+)/g) || [];
  const maxIndex = m.length ? Math.max(...m.map((s) => +s.slice(1))) : 0;
  const count = Array.isArray(params) ? params.length : 0;
  if (count !== maxIndex)
    console.error('[SQL PARAM MISMATCH]', {
      placeholders: maxIndex,
      count,
      text,
    });
  return _origQuery(text, params, ...rest);
};
// --- /DEBUG ---

module.exports = { pool };
