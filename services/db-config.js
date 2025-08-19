require('dotenv').config();

/**
 * Builds a PostgreSQL connection object based on the specified environment.
 * @param {'development' | 'test' | 'production'} env - The environment name.
 * @returns {object} A Knex-compatible connection object.
 */
function buildPgConnection(env) {
  const isTest = env === 'test';
  const isProd = env === 'production';

  // SSL is enabled if DB_SSL is explicitly 'true', or if in production.
  // It is always disabled for the test environment.
  let useSSL = process.env.DB_SSL === 'true' || isProd;
  if (isTest) {
    useSSL = false;
  }

  const sslOptions = useSSL
    ? { rejectUnauthorized: process.env.DB_SSL_VERIFY === 'true' }
    : false;

  // In test env, TEST_DATABASE_URL takes precedence.
  const url = isTest
    ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    : process.env.DATABASE_URL;

  // In production, the DATABASE_URL is mandatory to prevent accidental fallbacks.
  if (isProd && !url) {
    throw new Error(
      'FATAL: DATABASE_URL is required in the production environment.',
    );
  }

  // For local dev/test, allow fallback to individual variables if URL is not set.
  if (!url) {
    return {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || (isTest ? 5433 : 5432)),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database:
        process.env.DB_DATABASE ||
        (isTest ? 'test_meal_log_db' : 'meal_log_db'),
      ssl: sslOptions,
    };
  }

  // The standard connection object using a connection string.
  return {
    connectionString: url,
    ssl: sslOptions,
  };
}

module.exports = { buildPgConnection };
