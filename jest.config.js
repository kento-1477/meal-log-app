module.exports = {
  testEnvironment: 'node',
  // テストファイルのパターン
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  // モジュール解決のエイリアスなど、必要に応じて追加
  globalSetup: './globalSetup.js',
  globalTeardown: './globalTeardown.js',
};
