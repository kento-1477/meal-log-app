const { buildPgConnection } = require('./services/db-config');

module.exports = {
  development: {
    client: 'pg',
    connection: buildPgConnection('development'),
    migrations: { directory: './migrations' },
    seeds: { directory: './seeds' },
  },

  test: {
    client: 'pg',
    connection: buildPgConnection('test'),
    migrations: { directory: './migrations' },
    seeds: { directory: './seeds' },
  },

  production: {
    client: 'pg',
    connection: buildPgConnection('production'),
    migrations: { directory: './migrations' },
    seeds: { directory: './seeds' },
  },
};
