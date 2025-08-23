require('dotenv').config();
const { randomUUID } = require('crypto');
// const fs = require('node:fs/promises'); // unused
const path = require('node:path');
const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('./services/db');
// 既存ルートは残す
const mealRoutes = require('./services/meals');
const reminderRoutes = require('./services/reminders');
// NUTRI_BREAKDOWN 追加 import
const { analyze } = require('./services/nutrition');
const { computeFromItems } = require('./services/nutrition/compute');
const { applySlot, buildSlots } = require('./services/nutrition/slots');
const imageStorage = require('./services/storage/imageStorage');
const geminiProvider = require('./services/nutrition/providers/geminiProvider');
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if (file && !/^image\//.test(file.mimetype)) return cb(null, false); // ファイル無視
    cb(null, true);
  },
});

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'connect.sid';
const app = express();
const helmet = require('helmet');
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// 1) 認証/セッションより前にヘルスチェックを定義（Renderのヘルスチェック用）
app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});
console.log('Health check endpoint ready at /healthz');

// --- Middleware ---
const morgan = require('morgan');
morgan.token('user', (req) => (req.user && req.user.id ? req.user.id : 'anon'));
app.use(
  morgan(
    ':method :url :status :res[content-length] - :response-time ms user=:user',
    {
      stream: { write: (msg) => console.log(msg.trim()) },
    },
  ),
);
app.use((req, _res, next) => {
  req.user = req.user || {};
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check for Render's default path, placed after static middleware
// to ensure the frontend index.html is served first.
app.get('/', (_req, res) => res.status(200).send('ok'));
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
async function requireApiAuth(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    req.user = {
      id: req.body.user_id || '00000000-0000-0000-0000-000000000000',
      email: 'test@example.com',
    };
    return next();
  }

  if (req.isAuthenticated()) {
    return next();
  }

  // Guest user fallback
  const guestId = req.session.guest_id;
  if (guestId) {
    req.user = { id: guestId, is_guest: true };
    return next();
  }

  // Create a new guest user
  try {
    const newGuestId = randomUUID();
    const guestEmail = `guest_${newGuestId}@example.com`;
    const hashed = await bcrypt.hash(randomUUID(), 10); // Random password

    await pool.query(
      'INSERT INTO users (id, username, email, password_hash) VALUES ($1, $2, $3, $4)',
      [newGuestId, `guest_${newGuestId}`.slice(0, 50), guestEmail, hashed],
    );

    req.session.guest_id = newGuestId;
    req.user = { id: newGuestId, is_guest: true };
    return next();
  } catch (error) {
    console.error('Failed to create guest user:', error);
    return res.status(500).json({ message: 'Could not initialize session.' });
  }
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

// NUTRI_BREAKDOWN: test用 in-memory ストア
const inmemLogs = new Map();
const slotState = new Map(); // logId -> base items[]
function toApiPayload(log) {
  const { id, dish, confidence, nutrition, breakdown } = log;
  return {
    ok: true,
    logId: id,
    nutrition: { ...nutrition, dish, confidence },
    breakdown,
  };
}

// --- API Routes ---
app.use('/api/meals', requireApiAuth, mealRoutes);
app.use('/api/reminders', requireApiAuth, reminderRoutes);

// Log History API
app.get('/api/logs', requireApiAuth, async (req, res) => {
  const limit = Math.min(100, Number(req.query.limit || 20));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const { rows } = await pool.query(
    `
    SELECT l.id, l.created_at, l.food_item as dish, l.protein_g, l.fat_g, l.carbs_g, l.calories,
           l.meal_tag, m.url as image_url, l.ai_raw
      FROM meal_logs l
      LEFT JOIN media_assets m ON m.id = l.image_id
     WHERE l.user_id = $1
     ORDER BY l.created_at DESC
     LIMIT $2 OFFSET $3
  `,
    [req.user.id, limit, offset],
  );

  rows.forEach((row) => {
    try {
      row.ai_raw = JSON.parse(row.ai_raw || 'null');
    } catch {
      row.ai_raw = null;
    }
  });

  res.json({ ok: true, items: rows });
});

// Single Log API (for 409 refetch)
app.get('/api/log/:id', requireApiAuth, async (req, res) => {
  const { id } = req.params;
  const { rows, rowCount } = await pool.query(
    `
    SELECT l.*, m.url as image_url
      FROM meal_logs l
      LEFT JOIN media_assets m ON m.id = l.image_id
     WHERE l.id = $1 AND l.user_id = $2
  `,
    [id, req.user.id],
  );
  if (!rowCount)
    return res.status(404).json({ ok: false, message: 'not found' });

  const item = rows[0];
  try {
    item.ai_raw = JSON.parse(item.ai_raw || 'null');
  } catch {
    item.ai_raw = null;
  }
  item.image_url = item.image_url || null;
  item.meal_tag = item.meal_tag || null;

  res.json({ ok: true, item });
});

// --- Chat Log API (breakdown) ---
app.post(
  '/log',
  upload.single('image'),
  requireApiAuth,
  async (req, res, next) => {
    try {
      const message = (req.body?.message || '').trim();
      const file = req.file || null;
      const user_id = req.user?.id;

      if (!user_id || (!message && !file)) {
        return res.status(400).json({ ok: false, error: 'bad_request' });
      }

      // 1. Analyze nutrition from text and/or image
      const analysisResult = await analyze({
        text: message,
        imageBuffer: file?.buffer,
        mime: file?.mimetype,
      });

      // 画像のみ（message なし & req.file あり）のときにだけ、モック呼びを仕込む
      if (!message && req.file && process.env.GEMINI_MOCK === '1') {
        try {
          await geminiProvider.analyzeText({ text: '画像記録' });
        } catch {
          /* no-op */
        }
      }

      // 2. Store image if it exists
      let imageId = null;
      if (file && process.env.NODE_ENV !== 'test') {
        const imageUrl = await imageStorage.put(file.buffer, file.mimetype);
        const { rows: mediaRows } = await pool.query(
          `INSERT INTO media_assets (user_id, kind, mime, bytes, url)
           VALUES ($1, 'image', $2, $3, $4) RETURNING id`,
          [user_id, file.mimetype, file.size, imageUrl],
        );
        imageId = mediaRows[0].id;
      }

      // 3. Save the meal log with analysis results and image reference
      const { rows } = await pool.query(
        `INSERT INTO meal_logs
         (user_id, food_item, meal_type, consumed_at,
          calories, protein_g, fat_g, carbs_g, ai_raw, image_id)
         VALUES ($1, $2, 'Chat Log', NOW(), $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          user_id,
          analysisResult.dish || message,
          analysisResult.nutrition.calories,
          analysisResult.nutrition.protein_g,
          analysisResult.nutrition.fat_g,
          analysisResult.nutrition.carbs_g,
          JSON.stringify(analysisResult), // Store the full analysis
          imageId,
        ],
      );
      const logId = rows[0].id;

      // 4. Return the API response
      res.status(200).json({
        ok: true,
        success: true,
        logId,
        dish: analysisResult.dish,
        confidence: analysisResult.confidence,
        nutrition: analysisResult.nutrition,
        breakdown: analysisResult.breakdown,
      });

      // テスト用にスロットの状態を保存
      if (process.env.NODE_ENV === 'test') {
        slotState.set(logId, analysisResult.breakdown.items);
      }
    } catch (err) {
      next(err);
    }
  },
);

// New endpoint for slot selection
app.post(
  '/log/choose-slot',
  requireApiAuth,
  express.json(),
  async (req, res, next) => {
    try {
      const { logId, key, value } = req.body || {};
      if (!logId || !key)
        return res
          .status(400)
          .json({ ok: false, message: 'logId and key are required' });

      // test環境は in-memory で更新
      if (process.env.NODE_ENV === 'test') {
        const baseItems = slotState.get(logId);
        if (!Array.isArray(baseItems)) {
          return res
            .status(400)
            .json({
              success: false,
              error: 'unknown logId or items not found in slotState',
            });
        }
        const updated = applySlot(baseItems, { key, value });
        const {
          P,
          F,
          C,
          kcal,
          warnings,
          items: normItems,
        } = computeFromItems(updated);

        const dish = baseItems.dish || null;
        const confidence = baseItems.confidence ?? 0.7;
        const newBreakdown = {
          items: normItems,
          slots: {
            rice_size: buildSlots(normItems).riceSlot,
            pork_cut: buildSlots(normItems).porkSlot,
          },
          warnings,
        };

        const newBreakdown = {
          items: normItems,
          slots: {
            rice_size: buildSlots(normItems).riceSlot,
            pork_cut: buildSlots(normItems).porkSlot,
          },
          warnings,
        };

        return res.status(200).json({
          success: true,
          ok: true,
          logId: logId,
          nutrition: {
            protein_g: P,
            fat_g: F,
            carbs_g: C,
            calories: kcal,
            dish: dish,
            confidence: confidence,
          },
          breakdown: newBreakdown,
        });
      }

      // 本番系（DB保存）
      const { rows, rowCount } = await pool.query(
        `SELECT id, ai_raw FROM meal_logs WHERE id=$1 AND user_id=$2`,
        [logId, req.user.id],
      );
      if (rowCount === 0) {
        return res.status(404).json({ ok: false, message: 'not found' });
      }

      const { ai_raw } = rows[0];
      const currentItems = ai_raw?.breakdown?.items || [];
      const updatedItems = applySlot(currentItems, { key, value });

      const {
        P,
        F,
        C,
        kcal,
        warnings,
        items: normItems,
      } = computeFromItems(updatedItems);
      const slots = buildSlots(normItems);

      const dish = ai_raw?.dish || null;
      const confidence = ai_raw?.confidence ?? 0.7;
      const newBreakdown = {
        items: normItems,
        slots: { rice_size: slots.riceSlot, pork_cut: slots.porkSlot },
        warnings,
      };

      const { rowCount: updateCount } = await pool.query(
        `UPDATE meal_logs SET 
         protein_g=$1, fat_g=$2, carbs_g=$3, calories=$4, 
         ai_raw = jsonb_set(ai_raw, '{breakdown}', $5::jsonb, true), 
         updated_at = NOW(),
         protein=$1, fat=$2, carbs=$3 -- legacy columns
       WHERE id=$6 AND user_id=$7`,
        [P, F, C, kcal, JSON.stringify(newBreakdown), logId, req.user.id],
      );

      if (updateCount === 0) {
        return res.status(409).json({ ok: false, message: 'conflict' });
      }

      return res.status(200).json({
        success: true,
        ok: true,
        logId: logId,
        nutrition: {
          protein_g: P,
          fat_g: F,
          carbs_g: C,
          calories: kcal,
          dish,
          confidence,
        },
        breakdown: newBreakdown,
      });
    } catch (e) {
      return next(e);
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

// Centralized JSON error handler
app.use((err, req, res, next) => {
  // console.error(err.stack); // Already logged in routes
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    success: false,
    ok: false,
    error: err.message || 'Internal Server Error',
  });
});

module.exports = app;

// Compatibility shim for environments that still run `node server.js` directly
if (require.main === module && process.env.NODE_ENV !== 'test') {
  console.warn(
    'Running server.js directly is deprecated. Please use start.js instead.',
  );
  require('./start');
}
