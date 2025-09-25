const { execSync } = require('child_process');
const { Client } = require('pg');

if (process.env.SKIP_DB === '1') {
  module.exports = async () => {};
} else {
  const host = process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost';
  const port = Number(process.env.DB_PORT || process.env.POSTGRES_PORT || 5433);
  const user = process.env.DB_USER || process.env.POSTGRES_USER || 'test_user';
  const password =
    process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'test_password';
  const dbName =
    process.env.DB_DATABASE ||
    process.env.POSTGRES_DB ||
    process.env.TEST_DB_DATABASE ||
    'test_meal_log_db';

  const connSettings = { host, port, user, password, database: dbName };

  const seedData = async (client) => {
    console.log('Seeding initial data for tests...');
    const seedUserId =
      process.env.TEST_USER_ID || '00000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO users (id, username, email, password_hash)
       VALUES ($1, 'testuser', 'test@example.com', 'password_hash_placeholder')
       ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username`,
      [seedUserId],
    );
    await client.query(
      `INSERT INTO meal_logs (user_id, meal_type, food_item, calories, consumed_at)
       VALUES ($1, 'Breakfast', 'Test Toast', 200, '2025-07-24T09:00:00Z')
       ON CONFLICT DO NOTHING`,
      [seedUserId],
    );
    console.log('Database seeding complete.');
  };

  const waitForDb = (retries = 25, delay = 4000) => {
    return new Promise((resolve, reject) => {
      const tryConnect = (attempts) => {
        const client = new Client(connSettings);
        client.connect(async (err) => {
          if (err) {
            client.end();
            // ECONNRESET: Connection reset by peer, DB might be starting up.
            // 3D000: Database does not exist, might be initializing.
            if (
              (err.code === 'ECONNRESET' ||
                err.code === '3D000' ||
                err.code === 'ECONNREFUSED') &&
              attempts < retries
            ) {
              console.log(
                `Database not ready yet (Code: ${err.code}). Retrying in ${delay / 1000}s... (${attempts + 1}/${retries})`,
              );
              setTimeout(() => tryConnect(attempts + 1), delay);
            } else {
              console.error('DB connection failed with fatal error:', err);
              reject(err);
            }
          } else {
            console.log('Successfully connected to the database.');
            try {
              console.log('Applying database migrations...');
              execSync(
                `psql "postgresql://${user}:${password}@${host}:${port}/${dbName}" -f sql/20250729_add_notifications_created_at.sql`,
                { stdio: 'inherit' },
              );
              await seedData(client);
              await client.end();
              resolve();
            } catch (seedError) {
              await client.end();
              console.error('Error during database seeding:', seedError);
              reject(seedError);
            }
          }
        });
      };
      tryConnect(0);
    });
  };

  module.exports = async () => {
    if (process.env.CI) {
      console.log('CI environment detected, skipping local Docker setup.');
      return;
    }

    // Clean up any previous instances to ensure a fresh start
    console.log('Cleaning up old Docker containers and volumes...');
    execSync('docker-compose down -v', { stdio: 'inherit' });

    console.log('Starting local test database via docker-compose...');
    // The --wait flag is now more reliable due to the healthcheck
    execSync('docker-compose up -d --wait', { stdio: 'inherit' });

    console.log('Waiting for database to be ready and seeded...');
    // This script now acts as a final confirmation and seeder
    await waitForDb();
  };
}
