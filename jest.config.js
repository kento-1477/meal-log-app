/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['<rootDir>/tests/visual/'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.js'],
  globalSetup: '<rootDir>/globalSetup.js',
};
