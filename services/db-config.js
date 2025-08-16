function buildPgConnection(env) {
  const isTest = env === 'test';

  // Use SSL if DB_SSL is set, or if in production (but not for tests).
  const useSSL =
    !isTest &&
    (process.env.DB_SSL?.toLowerCase() === 'require' || env === 'production');

  const sslOptions = useSSL
    ? { rejectUnauthorized: process.env.DB_SSL_VERIFY !== 'true' }
    : false;

  // In test environment, prioritize TEST_DATABASE_URL.
  const connectionString = isTest
    ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    : process.env.DATABASE_URL;

  if (!connectionString) {
    // Fallback for local development without DATABASE_URL
    // Note: This part is not covered by the builder's env logic directly
    // but can be integrated if needed. For now, we assume DATABASE_URL is set.
    // console.warn('DATABASE_URL not set, falling back to individual DB variables.');
    return {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || (isTest ? 5433 : 5432),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database:
        process.env.DB_DATABASE ||
        (isTest ? 'test_meal_log_db' : 'meal_log_db'),
      ssl: sslOptions,
    };
  }

  return {
    connectionString: connectionString,
    ssl: sslOptions,
  };
}

module.exports = { buildPgConnection };
