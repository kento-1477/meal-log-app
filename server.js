require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const bcrypt = require('bcrypt');
const passport = require('passport');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('./services/db');
const mealRoutes = require('./services/meals');
const reminderRoutes = require('./services/reminders');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
const isProd = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1);
app.use(
  session({
    store: new pgSession({
      pool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProd, // 本番のみ true
      sameSite: isProd ? 'lax' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

// --- Health Check ---
app.get('/healthz', (req, res) => res.status(200).send('ok'));

// --- Passport Configuration ---
require('./services/auth').initialize(passport, pool);

// --- Authentication Middleware ---
function requireApiAuth(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    req.user = { id: 1, email: 'test@example.com' };
    return next();
  }
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Authentication required.' });
}

function requirePageAuth(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    req.user = { id: 1, email: 'test@example.com' };
    return next();
  }
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login.html');
}

// --- API Routes ---
app.use('/api/meals', requireApiAuth, mealRoutes);
app.use('/api/reminders', requireApiAuth, reminderRoutes);

// --- Protected HTML Routes ---
app.get('/', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/dashboard', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/reminder-settings', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reminder-settings.html'));
});

// --- DB Initialization and Server Start ---
async function initializeAndStart() {
  try {
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schemaSQL = await fs.readFile(schemaPath, 'utf8');
      await pool.query(schemaSQL);
      console.log('Database schema checked/initialized.');
    } catch (schemaError) {
      if (schemaError.code === 'ENOENT') {
        console.log('schema.sql not found, skipping initialization.');
      } else {
        console.error('Fatal: Error applying schema.sql:', schemaError);
        process.exit(1); // 致命的なエラーの場合は終了
      }
    }

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  initializeAndStart();
}

module.exports = app;
