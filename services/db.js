const { Pool, types } = require('pg');
require('dotenv').config();

// OID for NUMERIC data type in PostgreSQL
const NUMERIC_OID = 1700;

// Convert NUMERIC type to float
types.setTypeParser(NUMERIC_OID, (val) => {
  return parseFloat(val);
});

const isTest = process.env.NODE_ENV === 'test';

const connectionConfig = {
  user: process.env.DB_USER || 'test_user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_DATABASE || 'test_db',
  password: process.env.DB_PASSWORD || 'test_password',
  port: process.env.DB_PORT || 5433,
};

const pool = new Pool(connectionConfig);

pool.on('connect', () => {
  if (!isTest) {
    console.log('Connected to the DB');
  }
});

if (!isTest) {
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
  });
}

module.exports = { pool };
