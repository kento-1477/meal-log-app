const { execSync } = require('child_process');
const { Client } = require('pg');

const LOCAL_DOCKER = !process.env.CI; // CI では service コンテナが起動済み
const PORT = 5433;
const CONN = `postgresql://test_user:test_password@localhost:${PORT}/test_meal_log_db`;

module.exports = async () => {
  if (LOCAL_DOCKER) {
    console.log('▶︎ starting test_db via docker‑compose');
    execSync('docker-compose up -d test_db', { stdio: 'inherit' });
  }

  // ── DB が立ち上がるまで待機 ──────────────────────────────
  for (let i = 0; i < 10; i++) {
    try {
      const tmp = new Client({ connectionString: CONN });
      await tmp.connect();
      await tmp.end();
      console.log('✅ test_db is ready');
      break;
    } catch (e) {
      console.log('⏳ waiting for test_db...', e.code || e.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  // ── スキーマ & シード投入 ────────────────────────────────
  execSync(`psql ${CONN} -f ./schema.sql`, { stdio: 'inherit' });
  execSync(
    `psql ${CONN} -c "INSERT INTO users (id,email,password_hash)
            VALUES (1,'test@example.com','x') ON CONFLICT (id) DO NOTHING"`,
    { stdio: 'inherit' },
  );
  execSync(
    `psql ${CONN} -c "INSERT INTO meal_logs (user_id,meal_name,protein,fat,carbs,calories,timestamp)
            VALUES (1,'Test Meal',10,5,20,200,'2024-01-01T12:00:00Z')
            ON CONFLICT (id) DO NOTHING"`,
    { stdio: 'inherit' },
  );

  console.log('✅ schema & seed loaded');
};
