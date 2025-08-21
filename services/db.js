const { Pool } = require('pg');
const { buildPgConnection } = require('./db-config');

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

module.exports = { pool };
