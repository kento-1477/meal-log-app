module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  globalSetup: './globalSetup.js',
  globalTeardown: './globalTeardown.js',
  setupFilesAfterEnv: ['./jest.setup.js'],
};
