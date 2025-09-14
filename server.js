require('dotenv').config();
const { randomUUID: _randomUUID } = require('crypto');
const path = require('node:path');
const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('./services/db');
const mealRoutes = require('./services/meals');
const reminderRoutes = require('./services/reminders');
const { analyze, computeFromItems } = require('./services/nutrition');
// const { LogItemSchema } = require('./schemas/logItem');
const client = require('prom-client');
const { aiRawParseFail, chooseSlotMismatch } = require('./metrics/aiRaw');
const {
  createInitialSlots: _createInitialSlots,
  applySlot,
  buildSlots,
} = require('./services/nutrition/slots');
const { resolveNames } = require('./services/nutrition/nameResolver');
const {
  createLog: _createLog,
  getLogsForUser: _getLogsForUser,
  getLogById: _getLogById,
  updateLog: _updateLog,
  deleteLog: _deleteLog,
} = require('./services/meals');
let _imageStorage, _geminiProvider;
const getImageStorage = () =>
  (_imageStorage ??= require('./services/storage/imageStorage'));
const getGeminiProvider = () =>
  (_geminiProvider ??= require('./services/nutrition/providers/geminiProvider'));
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if (file && !/^image\//.test(file.mimetype)) return cb(null, false);
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

// 1) Health check endpoint (before any session/auth middleware)
app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});
console.log('Health check endpoint ready at /healthz');

// --- Core Middleware ---
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Session & Passport Middleware ---
const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

if (!isTest) {
  // これを戻す（セッションの secure / プロキシ配下挙動のため）
  app.set('trust proxy', 1);
  app.use(
    session({
      name: SESSION_COOKIE_NAME,
      store: new pgSession({
        pool,
        tableName: 'session',
        createTableIfMissing: true,
        pruneSessionInterval: 60,
      }),
      secret: process.env.SESSION_SECRET || 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: isProd,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    }),
  );
} else {
  // テスト時はダミー session を差し込む（Store無し）
  app.use((req, _res, next) => {
    req.session = {};
    next();
  });
}
app.use(passport.initialize());
app.use(passport.session());
require('./services/auth').initialize(passport, pool);

// --- Authentication Middleware ---
async function requireApiAuth(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    // テスト時は body / query / header の順で user_id を拾う
    const hdr = req.headers['x-test-user-id'];
    const qid = req.query.user_id;
    const bid = req.body && req.body.user_id;
    const uid =
      (typeof bid === 'string' && bid) ||
      (typeof qid === 'string' && qid) ||
      (typeof hdr === 'string' && hdr) ||
      '00000000-0000-0000-0000-000000000000';
    req.user = { id: uid, email: 'test@example.com' };
    return next();
  }
  if (req.isAuthenticated()) {
    return next();
  }
  // Temporarily bypass guest user creation to debug pool.query issue
  req.user = { id: '00000000-0000-0000-0000-000000000000', is_guest: true }; // Use a fixed guest ID
  return next();
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

// ---- Protected HTML Routes (must be before static assets) ----
app.get(['/', '/index.html'], requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get(['/dashboard', '/dashboard.html'], requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Catch-all for other .html files to protect them, excluding login.
app.get(/^\/(?!login(?:\.html)?$).+\.html$/, requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', req.path));
});

// ---- Publicly Accessible Login Page ----
app.get(['/login', '/login.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ---- Static Asset Serving (CSS, JS, images) ----
// This is last for routing, with directory indexing disabled.
app.use(
  express.static(path.join(__dirname, 'public'), {
    index: false,
    redirect: false,
    extensions: false,
  }),
);

// --- API Routes ---
const slotState = new Map(); // logId -> base items[]

app.get('/me', (req, res) => {
  const user = req.user
    ? { id: req.user.id, email: req.user.email, username: req.user.username }
    : null;
  res.json({ authenticated: !!req.user, user });
});

app.post('/api/register', async (req, res) => {
  try {
    let { username, email, password } = req.body || {};
    if (!email || !password)
      return res
        .status(400)
        .json({ message: 'Email and password are required.' });

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

app.post('/api/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ message: 'Error logging out' });
    res.json({ message: 'Logged out successfully' });
  });
});

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

// Stubbed API endpoints for dashboard
app.get('/api/meal-data', requireApiAuth, async (req, res) => {
  // TODO: Implement actual data fetching
  res.json({ items: [], summary: { kcal: 0, P: 0, F: 0, C: 0 } });
});

app.get('/api/ai-advice', requireApiAuth, async (req, res) => {
  // TODO: Implement actual AI advice generation
  res.json({ advice: [] });
});

app.use('/api/meals', requireApiAuth, mealRoutes);
app.use('/api/reminders', requireApiAuth, reminderRoutes);

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/api/logs', requireApiAuth, async (req, res) => {
  const limit = Math.min(100, Number(req.query.limit || 20));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const { rows } = await pool.query(
    `
    SELECT l.id, l.created_at, l.food_item as dish, l.protein_g, l.fat_g, l.carbs_g, l.calories,
           l.meal_tag, m.url as image_url, l.ai_raw::jsonb as ai_raw
      FROM meal_logs l
      LEFT JOIN media_assets m ON m.id = l.image_id
     WHERE l.user_id = $1
     ORDER BY l.created_at DESC
     LIMIT $2 OFFSET $3
  `,
    [req.user.id, limit, offset],
  );

  res.json({ ok: true, items: rows });
});

app.get('/api/log/:id', requireApiAuth, async (req, res) => {
  const { id } = req.params;
  const { rows, rowCount } = await pool.query(
    `
    SELECT
      l.id, l.user_id, l.food_item, l.meal_type, l.consumed_at,
      l.created_at, l.updated_at, l.protein_g, l.fat_g, l.carbs_g, l.calories,
      l.meal_tag, l.landing_type, l.image_id, l.row_version,
      l.ai_raw::jsonb AS ai_payload,
      m.url AS image_url
    FROM meal_logs l
    LEFT JOIN media_assets m ON m.id = l.image_id
    WHERE l.id = $1 AND l.user_id = $2
  `,
    [id, req.user.id],
  );
  if (!rowCount)
    return res.status(404).json({ ok: false, message: 'not found' });

  const item = rows[0];
  // Final guard: If TypeParser failed, manually parse it.
  if (typeof item.ai_payload === 'string') {
    try {
      item.ai_payload = JSON.parse(item.ai_payload);
    } catch {
      aiRawParseFail.inc();
    }
  }

  // Rename ai_payload back to ai_raw for the client
  item.ai_raw = item.ai_payload;
  delete item.ai_payload;

  /* try {
    LogItemSchema.parse(item);
  } catch (e) {
    // ここでアラート/ログ
    console.error({ err: e, item }, 'log-item schema violation');
    return res.status(500).json({ ok: false, message: 'schema violation' });
  } */

  item.image_url = item.image_url || null;
  item.meal_tag = item.meal_tag || null;
  res.json({ ok: true, item });
});

app.post(
  '/log',
  upload.single('image'),
  requireApiAuth, // Temporarily disabled authentication middleware
  async (req, res, next) => {
    try {
      const message = (req.body?.message || '').trim();
      const file = req.file || null;
      const user_id = req.user?.id;
      if (!user_id || (!message && !file)) {
        return res.status(400).json({ ok: false, error: 'bad_request' });
      }
      const analysisResult = await analyze({
        text: message,
        imageBuffer: file?.buffer,
        mime: file?.mimetype,
      });

      // PATCH_LOG_GUARD_START
      const items = Array.isArray(analysisResult?.breakdown?.items)
        ? analysisResult.breakdown.items
        : [];
      const allPending =
        items.length > 0 && items.every((i) => i?.pending === true);
      const isMock = String(process.env.GEMINI_MOCK || '') === '1';

      let agg = null;
      try {
        agg = computeFromItems(items);
      } catch {
        agg = null;
      }

      const nutrition =
        isMock && allPending
          ? { protein_g: 0, fat_g: 0, carbs_g: 0, calories: 0 }
          : {
              protein_g: agg?.P ?? 0,
              fat_g: agg?.F ?? 0,
              carbs_g: agg?.C ?? 0,
              calories: agg?.kcal ?? 0,
            };

      // ai_raw とレスポンスの両方で同じ形を使う
      analysisResult.breakdown = {
        ...(analysisResult.breakdown || {}),
        items,
      };
      analysisResult.nutrition = nutrition;
      // PATCH_LOG_GUARD_END

      if (!message && req.file && process.env.GEMINI_MOCK === '1') {
        try {
          await getGeminiProvider().analyzeText({ text: '画像記録' });
        } catch (_err) {
          // 開発時のみデバッグに出す（本番では黙って握りつぶす設計）
          if (process.env.NODE_ENV !== 'production') {
            console.debug(
              'mock analyzeText prewarm failed:',
              _err?.message || _err,
            );
          }
        }
      }
      let imageId = null;
      if (file && process.env.NODE_ENV !== 'test') {
        const imageUrl = await getImageStorage().put(
          file.buffer,
          file.mimetype,
        );
        const { rows: mediaRows } = await pool.query(
          `INSERT INTO media_assets (user_id, kind, mime, bytes, url)
           VALUES ($1, 'image', $2, $3, $4) RETURNING id`,
          [user_id, file.mimetype, file.size, imageUrl],
        );
        imageId = mediaRows[0].id;
      }
      const landing_type =
        analysisResult?.landing_type ??
        (analysisResult?.provider ||
          (analysisResult?.archetype_id ? 'archetype' : 'deterministic'));

      const { rows } = await pool.query(
        `INSERT INTO meal_logs
       (user_id, food_item, meal_type, consumed_at,
        calories, protein_g, fat_g, carbs_g, ai_raw, image_id, landing_type)
       VALUES ($1, $2, 'Chat Log', NOW(), $3, $4, $5, $6, $7::jsonb, $8, $9)
       RETURNING id`,
        [
          user_id,
          analysisResult.dish || message,
          analysisResult.nutrition.calories,
          analysisResult.nutrition.protein_g,
          analysisResult.nutrition.fat_g,
          analysisResult.nutrition.carbs_g,
          JSON.stringify(analysisResult),
          imageId,
          landing_type,
        ],
      );
      const logId = rows[0].id;
      res.status(200).json({
        ok: true,
        success: true,
        logId,
        dish: analysisResult.dish,
        confidence: analysisResult.confidence,
        nutrition: analysisResult.nutrition,
        breakdown: analysisResult.breakdown,
      });
      const volatileOn = process.env.ENABLE_VOLATILE_SLOTS === '1';
      if (volatileOn) {
        slotState.set(logId, analysisResult); // Store the full analysisResult
      }
    } catch (err) {
      next(err);
    }
  },
);

app.post(
  '/log/choose-slot',
  requireApiAuth,
  express.json(),
  async (req, res, next) => {
    try {
      const { logId, key, value } = req.body || {};
      const prevVersion = Number(req.body?.prevVersion);
      if (!Number.isInteger(prevVersion)) {
        return res.status(400).json({
          ok: false,
          message: 'Bad Request: prevVersion must be an integer',
        });
      }

      const volatileOn = process.env.ENABLE_VOLATILE_SLOTS === '1';

      // 一時的なデバッグログ：どちらの分岐に入ったかを確認
      console.debug('choose-slot branch:', {
        volatileOn,
        env: process.env.NODE_ENV,
      });

      if (volatileOn) {
        const baseAnalysisResult = slotState.get(logId);
        if (
          !baseAnalysisResult ||
          !Array.isArray(baseAnalysisResult.breakdown.items)
        ) {
          return res.status(400).json({
            success: false,
            error: 'unknown logId or items not found in slotState',
          });
        }
        const updated = applySlot(
          baseAnalysisResult.breakdown.items,
          { key, value },
          baseAnalysisResult.archetype_id,
        );
        const {
          P,
          F,
          C,
          kcal,
          warnings: slotWarnings,
          items: normItems,
        } = computeFromItems(updated);
        const resolved = resolveNames(normItems);
        const dish = baseAnalysisResult.dish || null;
        const allConfirmed = updated.every((i) => !i.pending);
        const confidence = allConfirmed
          ? (baseAnalysisResult.base_confidence ??
            baseAnalysisResult.confidence ??
            0.7)
          : 0;
        const slots = buildSlots(resolved, baseAnalysisResult.archetype_id); // Pass archetype_id to buildSlots
        const newBreakdown = {
          items: resolved,
          slots,
          warnings: slotWarnings,
        };
        // Update the stored state with the new items and potentially updated archetype_id/confidence
        slotState.set(logId, {
          ...baseAnalysisResult,
          breakdown: newBreakdown,
          nutrition: {
            protein_g: P,
            fat_g: F,
            carbs_g: C,
            calories: kcal,
          },
        });
        return res.status(200).json({
          success: true,
          ok: true,
          logId: logId,
          dish: dish,
          confidence: confidence,
          nutrition: {
            protein_g: P,
            fat_g: F,
            carbs_g: C,
            calories: kcal,
          },
          breakdown: newBreakdown,
          row_version: Number.isInteger(prevVersion) ? prevVersion + 1 : 0,
        });
      }

      const { rows, rowCount } = await pool.query(
        `SELECT id, ai_raw FROM meal_logs WHERE id=$1 AND user_id=$2`,
        [logId, req.user.id],
      );
      if (rowCount === 0) {
        return res.status(404).json({ ok: false, message: 'not found' });
      }
      const { ai_raw } = rows[0];
      const currentItems = ai_raw?.breakdown?.items || [];
      const updatedItems = applySlot(
        currentItems,
        { key, value },
        ai_raw.archetype_id,
      );
      const { warnings: slotWarnings, items: normItems } =
        computeFromItems(updatedItems);
      const resolved = resolveNames(normItems);
      const slots = buildSlots(resolved, ai_raw?.archetype_id);
      const dish = ai_raw?.dish || null;
      const allConfirmed = normItems.every((i) => !i.pending);
      const confidence = allConfirmed
        ? (ai_raw?.base_confidence ?? ai_raw?.confidence ?? 0.7)
        : 0;
      const newBreakdown = {
        items: resolved,
        slots,
        warnings: slotWarnings,
      };

      const src =
        typeof ai_raw === 'string'
          ? (() => {
              try {
                return JSON.parse(ai_raw || '{}');
              } catch {
                return {};
              }
            })()
          : ai_raw || {};

      const items = newBreakdown.items;
      const agg = computeFromItems(items);

      const updatedAnalysisResult = {
        ...src,
        dish,
        confidence,
        base_confidence: src.base_confidence ?? src.confidence ?? 0.3,
        nutrition: {
          protein_g: agg.P,
          fat_g: agg.F,
          carbs_g: agg.C,
          calories: agg.kcal,
        },
        breakdown: newBreakdown,
        landing_type: src.landing_type,
      };

      const sql = `
     UPDATE meal_logs SET
       protein_g=$1, fat_g=$2, carbs_g=$3, calories=$4,
       ai_raw=$5::jsonb, updated_at=NOW(),
       protein=$1, fat=$2, carbs=$3,
       landing_type=COALESCE($8, landing_type),
       row_version=row_version+1
     WHERE id=$6 AND user_id=$7 AND row_version=$9
     RETURNING id, ai_raw, updated_at, row_version
   `;
      const params = [
        agg.P,
        agg.F,
        agg.C,
        agg.kcal,
        JSON.stringify(updatedAnalysisResult),
        logId,
        req.user.id,
        updatedAnalysisResult.landing_type ?? null,
        prevVersion,
      ];
      const { rows: updatedRows, rowCount: updateCount } = await pool.query(
        sql,
        params,
      );

      if (updateCount === 0) {
        return res
          .status(409)
          .json({ ok: false, message: 'Conflict: stale row_version' });
      }

      const savedAiRaw = updatedRows?.[0]?.ai_raw ?? null;
      const newUpdatedAt = updatedRows?.[0]?.updated_at ?? null;
      let newRowVersion = updatedRows?.[0]?.row_version ?? null;

      // 念のため、RETURNINGで row_version を拾えなかった場合は再読込
      if (newRowVersion == null) {
        const { rows: vrows } = await pool.query(
          'SELECT row_version FROM meal_logs WHERE id=$1 AND user_id=$2',
          [logId, req.user.id],
        );
        newRowVersion = vrows?.[0]?.row_version ?? null;
      }

      // AI結果の不一致メトリクス（統計用）
      if (
        savedAiRaw &&
        JSON.stringify(savedAiRaw) !== JSON.stringify(updatedAnalysisResult)
      ) {
        chooseSlotMismatch.inc();
      }

      return res.status(200).json({
        success: true,
        ok: true,
        logId,
        dish,
        confidence,
        nutrition: updatedAnalysisResult.nutrition,
        breakdown: newBreakdown,
        updatedAt: newUpdatedAt,
        row_version: newRowVersion,
      });
    } catch (e) {
      return next(e);
    }
  },
);

// --- Error Handlers ---
app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ ok: false, message: err.message });
  }
  next(err);
});

app.use((err, req, res, next) => {
  if (err && /deserialize user/i.test(err.message || '')) {
    try {
      if (req.session) req.session.destroy(() => {});
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    } catch (_err) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(
          'session cleanup error (ignored): ',
          _err?.message || _err,
        );
      }
    }
    return res.status(401).json({ error: 'Session expired' });
  }
  return next(err);
});

app.use((err, req, res, next) => {
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

if (require.main === module && process.env.NODE_ENV !== 'test') {
  console.warn(
    'Running server.js directly is deprecated. Please use start.js instead.',
  );
  require('./start');
}
