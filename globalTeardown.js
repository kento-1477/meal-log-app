const { execSync } = require('child_process');

module.exports = async () => {
  if (process.env.CI) {
    console.log('CI environment detected, skipping local Docker teardown.');
    return;
  }

  console.log('Stopping local test database...');
  execSync('docker-compose down -v', { stdio: 'inherit' });
};
