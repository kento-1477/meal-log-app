require('dotenv').config();

function sanitizeUrl(url) {
  if (!url) return url;
  return url.trim().replace(/^psql\s+/i, ''); // Remove "psql " from the beginning
}

/**
 * Builds a PostgreSQL connection object based on the specified environment.
 * @param {'development' | 'test' | 'production'} env - The environment name.
 * @returns {object} A Knex-compatible connection object.
 */
function buildPgConnection(env) {
  if (env === 'test') {
    let raw = sanitizeUrl(
      process.env.TEST_DATABASE_URL ||
        'postgres://postgres:postgres@127.0.0.1:5432/meal_log_test',
    );

    const match = raw.match(/postgres(ql)?:\/\/[^\s]+/i);
    if (match) {
      raw = match[0].trim();
    }

    try {
      const u = new URL(raw);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        u.searchParams.delete('ssl');
        u.searchParams.delete('sslmode');
        u.searchParams.delete('channel_binding');
        return { connectionString: u.toString(), ssl: false };
      }
      return {
        connectionString: u.toString(),
        ssl: { rejectUnauthorized: false },
      }; // For Neon
    } catch {
      return { connectionString: raw, ssl: false };
    }
  }
  const isTest = env === 'test';
  const isProd = env === 'production';

  // In test env, TEST_DATABASE_URL takes precedence.
  const rawUrl = isTest
    ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    : process.env.DATABASE_URL;
  const url = sanitizeUrl(rawUrl);

  // In production, the DATABASE_URL is mandatory to prevent accidental fallbacks.
  if (isProd && !url) {
    throw new Error(
      'FATAL: DATABASE_URL is required in the production environment.',
    );
  }

  // For local dev/test, allow fallback to individual variables if URL is not set.
  if (!url) {
    const needSSL =
      /\bsslmode=require\b/i.test(url) || process.env.DB_SSL === '1';
    return {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || (isTest ? 5433 : 5432)),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database:
        process.env.DB_DATABASE ||
        (isTest ? 'test_meal_log_db' : 'meal_log_db'),
      ssl: needSSL ? { rejectUnauthorized: false } : false,
    };
  }

  const useSsl = /\bsslmode=require\b/i.test(url) || process.env.DB_SSL === '1';
  // The standard connection object using a connection string.
  return {
    connectionString: url,
    ssl: useSsl
      ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === '1' }
      : false,
  };
}

module.exports = { buildPgConnection };
