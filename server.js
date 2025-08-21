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
const nutritionService = require('./src/services/nutrition');
const multer = require('multer');

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'connect.sid';
const app = express();

// 1) 認証/セッションより前にヘルスチェックを定義（Renderのヘルスチェック用）
app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});
console.log('Health check endpoint ready at /healthz');

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
const isProd = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1);
app.use(
  session({
    name: SESSION_COOKIE_NAME,
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

// --- User Registration API ---
app.post('/api/register', async (req, res) => {
  try {
    let { username, email, password } = req.body || {};
    if (!email || !password)
      return res
        .status(400)
        .json({ message: 'Email and password are required.' });

    // username 未指定なら email から生成（ユニーク化）
    if (!username || !username.trim()) {
      const base = (email.split('@')[0] || 'user').toLowerCase();
      let candidate = base,
        i = 1;
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

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1,$2,$3) RETURNING id, username, email',
      [username, email, hashed],
    );
    res
      .status(201)
      .json({ message: 'User registered successfully', user: result.rows[0] });
  } catch (_e) {
    if (_e.code === '23505')
      return res
        .status(409)
        .json({ message: 'Email or username already exists.' });
    console.error('Error registering user:', _e);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// --- Login API ---
app.post('/api/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res
        .status(401)
        .json({ message: info?.message || 'Invalid credentials' });
    }
    req.logIn(user, (err2) => {
      if (err2) return next(err2);
      return res.json({
        message: 'Logged in successfully',
        user: { id: user.id, username: user.username, email: user.email },
      });
    });
  })(req, res, next);
});

// --- Logout API ---
app.post('/api/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ message: 'Error logging out' });
    res.json({ message: 'Logged out successfully' });
  });
});

// --- Current Login Status API ---
app.get('/api/session', (req, res) => {
  if (!req.user) return res.status(401).json({ authenticated: false });
  res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
    },
  });
});

// --- Passport Configuration ---
require('./services/auth').initialize(passport, pool);

// --- Authentication Middleware ---
function requireApiAuth(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
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

// --- Chat Log API ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype))
      return cb(new Error('only image/* allowed'));
    cb(null, true);
  },
});
app.post('/log', requireApiAuth, upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const message = req.body?.message || '';
    if (!file && !message)
      return res
        .status(400)
        .json({ ok: false, message: 'message or image is required' });

    const userId = req.user.id;
    const { rows } = await pool.query(
      `INSERT INTO meal_logs (user_id, meal_type, food_item, memo) VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, 'Chat Log', message || '画像記録', message],
    );
    const logId = rows[0].id;

    try {
      const payload = await nutritionService.analyze({ text: message || '' });
      if (payload) {
        const { dish, confidence, nutrition, breakdown, snapshot } = payload;
        await pool.query(
          `UPDATE meal_logs SET 
             dish=$1, protein_g=$2, fat_g=$3, carbs_g=$4, calories=$5, 
             confidence=$6, ai_raw=$7, version=1, 
             protein=$2, fat=$3, carbs=$4 -- legacy columns
           WHERE id=$8`,
          [
            dish,
            nutrition.protein_g,
            nutrition.fat_g,
            nutrition.carbs_g,
            nutrition.calories,
            confidence,
            JSON.stringify({
              breakdown,
              snapshot,
              model: 'gemini-pro',
              input: { message },
              at: new Date().toISOString(),
            }),
            logId,
          ],
        );
        return res.json({
          ok: true,
          logId,
          nutrition: { dish, ...nutrition, confidence },
          breakdown,
        });
      }
    } catch (e) {
      console.error('Nutrition analyze failed:', e);
    }
    return res.json({ ok: true, logId, nutrition: null, breakdown: null });
  } catch (_e) {
    console.error(_e);
    return res.status(500).json({ ok: false, message: 'internal error' });
  }
});

// New endpoint for slot selection
app.post(
  '/log/choose-slot',
  requireApiAuth,
  express.json(),
  async (req, res) => {
    try {
      const { logId, key, value } = req.body || {};
      if (!logId || !key)
        return res
          .status(400)
          .json({ ok: false, message: 'logId and key are required' });

      const { rows } = await pool.query(
        `SELECT id, ai_raw FROM meal_logs WHERE id=$1 AND user_id=$2`,
        [logId, req.user.id],
      );
      if (!rows?.length)
        return res.status(404).json({ ok: false, message: 'not found' });

      const ai_raw = rows[0].ai_raw || {};
      const currentItems = ai_raw?.breakdown?.items || [];
      const updatedItems = applySlot(currentItems, { key, value });

      const { computeFromItems } = require('./src/services/nutrition/compute');
      const { buildSlots } = require('./src/services/nutrition/slots');
      const { P, F, C, kcal, warnings, items } = computeFromItems(updatedItems);
      const slots = buildSlots(items);

      const dish = ai_raw?.dish || null;
      const confidence = ai_raw?.confidence ?? 0.7;
      const newBreakdown = {
        items,
        slots: { rice_size: slots.riceSlot, pork_cut: slots.porkSlot },
        warnings,
      };

      await pool.query(
        `UPDATE meal_logs SET 
         protein_g=$1, fat_g=$2, carbs_g=$3, calories=$4, 
         ai_raw = jsonb_set(ai_raw, '{breakdown}', $5::jsonb, true), 
         version = version + 1, 
         protein=$1, fat=$2, carbs=$3 -- legacy columns
       WHERE id=$6`,
        [P, F, C, kcal, JSON.stringify(newBreakdown), logId],
      );

      return res.json({
        ok: true,
        logId,
        nutrition: {
          dish,
          protein_g: P,
          fat_g: F,
          carbs_g: C,
          calories: kcal,
          confidence,
        },
        breakdown: newBreakdown,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, message: 'internal error' });
    }
  },
);

// --- Multer Error Handling ---
app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ ok: false, message: err.message });
  }
  next(err);
});

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

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 2) パスポートのセッション復元失敗を無害化するエラーハンドラ（最後尾）
app.use((err, req, res, next) => {
  if (err && /deserialize user/i.test(err.message || '')) {
    try {
      if (req.session) req.session.destroy(() => {});
      // 使っているクッキー名が既定なら connect.sid
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    } catch (_) {
      // ignore errors
    }
    return res.status(401).json({ error: 'Session expired' });
  }
  return next(err);
});

module.exports = app;

// Compatibility shim for environments that still run `node server.js` directly
if (require.main === module && process.env.NODE_ENV !== 'test') {
  console.warn(
    'Running server.js directly is deprecated. Please use start.js instead.',
  );
  require('./start');
}
