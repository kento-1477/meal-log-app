const { execSync } = require('child_process');

module.exports = async () => {
  console.log('\nTeardown test environment...');
  // Docker Composeでテスト用DBを停止
  execSync('docker-compose down -v');
};
