/* eslint-env jest */

const describeIfDb =
  process.env.RUN_DB_TESTS === '1' ? global.describe : global.describe.skip;

module.exports = describeIfDb;
