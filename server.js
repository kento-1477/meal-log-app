require('dotenv').config(); // 環境変数を最初に読み込む
const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const passport = require('passport');
const session = require('express-session');
const { pool } = require('./services/db'); // 修正: db.jsからpoolをインポート
const mealRoutes = require('./services/meals'); // 修正: meals.jsからルートをインポート

const app = express();

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// [REQ-LOGGER]
app.use((req, _res, next) => {
  console.log('[REQ]', req.method, req.url);
  next();
});

// --- Session and Passport Initialization ---
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'a-very-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

// --- Passport Configuration ---
require('./services/auth').initialize(passport, pool);

// --- User Registration API ---
app.post('/api/register', async (req, res) => {
  let { username, email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: 'Email and password are required.' });
  }

  try {
    // usernameが空ならemailから生成し、一意化
    if (!username || !username.trim()) {
      const base = (email.split('@')[0] || 'user').toLowerCase();
      let candidate = base;
      let i = 1;
      while (true) {
        const { rowCount } = await pool.query(
          'SELECT 1 FROM users WHERE username=$1',
          [candidate],
        );
        if (rowCount === 0) break;
        i += 1;
        candidate = `${base}${i}`;
      }
      username = candidate;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hashedPassword],
    );
    res
      .status(201)
      .json({ message: 'User registered successfully', user: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      // Unique violation
      return res
        .status(409)
        .json({ message: 'Email or username already exists.' });
    }
    console.error('Error registering user:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// --- User Login API ---
app.post('/api/login', passport.authenticate('local'), (req, res) => {
  res.json({
    message: 'Logged in successfully',
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
    },
  });
});

// --- User Logout API ---
app.post('/api/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ message: 'Error logging out' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// --- API Routes ---
const reminderRoutes = require('./services/reminders');

app.use('/api/meals', mealRoutes);
app.use('/api/reminders', reminderRoutes); // ★ ここを限定

// --- Authentication Middleware ---
function isAuthenticated(req, res, next) {
  // テスト環境では認証をスキップし、ダミーユーザーを設定
  if (process.env.NODE_ENV === 'test') {
    req.user = { id: 1, email: 'test@example.com' };
    return next();
  }
  // 実際の認証チェック
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Authentication required.' });
}

// --- Protected HTML Routes ---
app.get('/', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/reminder-settings', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reminder-settings.html'));
});

app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// 全体404は最後にだけ
app.use('/api/*', (_req, res) =>
  res.status(404).json({ message: 'Not Found' }),
);

// [ROUTES-LISTING V2]
if (process.env.NODE_ENV !== 'production') {
  const listRoutes = (stack, base = '', acc = []) => {
    for (const layer of stack) {
      if (layer.route && layer.route.path) {
        const methods = Object.keys(layer.route.methods)
          .map((m) => m.toUpperCase())
          .sort()
          .join(',');
        acc.push(`${methods} ${base}${layer.route.path}`);
      } else if (
        layer.name === 'router' &&
        layer.handle &&
        layer.handle.stack
      ) {
        const mount = (() => {
          if (layer.regexp && layer.regexp.fast_slash) return '/';
          if (layer.regexp) {
            return layer.regexp
              .toString()
              .replace('/^\\', '/')
              .replace('\\/?(?=\\\/|$)/i', '')
              .replace('\\/?(?=\\\/|$)/', '')
              .replace('$/i', '')
              .replace('$/', '')
              .replace(/\\\//g, '/')
              .replace(/\\\./g, '.')
              .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':param');
          }
          return '/';
        })();
        listRoutes(layer.handle.stack, base + mount, acc);
      }
    }
    return acc;
  };

  app.get('/_routes', (_req, res) => {
    const routes = listRoutes(app._router.stack);
    res.json([...new Set(routes)].sort());
  });
}

// --- Server Start ---
const PORT = process.env.PORT || 3000;
let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

const { runReminderCheck } = require('./services/reminders-check');

// --- スケジューラーのセットアップ ---
if (process.env.NODE_ENV !== 'test' && process.env.ENABLE_CRON !== 'false') {
  const cron = require('node-cron');
  cron.schedule('* * * * *', () => runReminderCheck(pool));
}

// For testing, we export the app and a function to close the server
module.exports = app;

module.exports.runReminderCheck = runReminderCheck; // Export for testing
