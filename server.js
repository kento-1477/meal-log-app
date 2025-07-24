require('dotenv').config(); // 環境変数を最初に読み込む
const express = require('express');
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

// --- Passport Configuration (from services/auth.js or similar) ---
// (実際の認証ロジックは別ファイルに切り出すのが望ましい)
require('./services/auth').initialize(passport, pool);

// --- API Routes ---
app.use('/api/meals', mealRoutes);

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

app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// --- Server Start ---
const PORT = process.env.PORT || 3000;
let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// For testing, we export the app and a function to close the server
module.exports = app;
