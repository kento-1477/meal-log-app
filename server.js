require('dotenv').config();
const { randomUUID: _randomUUID, createHash } = require('crypto');
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
const { register } = client;
const { version: APP_VERSION } = require('./package.json');
const { aiRawParseFail, chooseSlotMismatch } = require('./metrics/aiRaw');

const METRIC_ENV =
  process.env.METRIC_ENV ||
  (process.env.NODE_ENV === 'production'
    ? 'prod'
    : process.env.NODE_ENV || 'local');
const SHADOW_PIPELINE_VERSION =
  process.env.SHADOW_PIPELINE_VERSION ||
  process.env.NORMALIZE_V2_VERSION ||
  'v2';
const METRIC_AI_PROVIDER =
  process.env.GEMINI_MOCK === '1'
    ? 'gemini-mock'
    : process.env.AI_PROVIDER || process.env.NUTRITION_PROVIDER || 'gemini';
const METRIC_MODEL =
  process.env.GEMINI_MODEL ||
  process.env.GENERATIVE_MODEL ||
  'gemini-1.5-flash';

register.setDefaultLabels({
  env: METRIC_ENV,
  shadow_version: SHADOW_PIPELINE_VERSION,
  ai_provider: METRIC_AI_PROVIDER,
});

const appInfoGauge = new client.Gauge({
  name: 'meal_log_app_build_info',
  help: 'Build metadata for meal log shadow pipeline',
  labelNames: ['app_version', 'model'],
});
appInfoGauge.labels(APP_VERSION, METRIC_MODEL).set(1);

const idempotencyCounter = new client.Counter({
  name: 'meal_log_idempotency_total',
  help: 'Idempotency outcomes for /log requests',
  labelNames: ['status'],
});
const shadowWriteDuration = new client.Histogram({
  name: 'meal_log_shadow_write_duration_seconds',
  help: 'Duration of shadow write pipeline',
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});
const shadowWriteErrorCounter = new client.Counter({
  name: 'meal_log_shadow_write_errors_total',
  help: 'Shadow write failures',
});
const diffBreachCounter = new client.Counter({
  name: 'meal_log_shadow_diff_breach_total',
  help: 'Shadow diff threshold breaches',
  labelNames: ['field'],
});
const diffDailyBreachCounter = new client.Counter({
  name: 'meal_log_shadow_daily_diff_breach_total',
  help: 'Shadow diff daily aggregate threshold breaches',
  labelNames: ['field'],
});
const diffAbsoluteHistogram = new client.Histogram({
  name: 'meal_log_shadow_diff_abs',
  help: 'Absolute diff magnitude per record',
  labelNames: ['field'],
  buckets: [0.5, 1, 2, 5, 10, 20, 40, 80, 160, 320, 640],
});
const diffRelativeHistogram = new client.Histogram({
  name: 'meal_log_shadow_diff_rel',
  help: 'Absolute relative diff per record',
  labelNames: ['field'],
  buckets: [0.01, 0.02, 0.05, 0.1, 0.2, 0.4, 0.8, 1.6],
});
const diffDailyAbsoluteHistogram = new client.Histogram({
  name: 'meal_log_shadow_daily_diff_abs',
  help: 'Absolute diff magnitude per user/day snapshot',
  labelNames: ['field'],
  buckets: [1, 5, 10, 20, 40, 80, 160, 320, 640, 1280],
});
const diffDailyRelativeHistogram = new client.Histogram({
  name: 'meal_log_shadow_daily_diff_rel',
  help: 'Absolute relative diff per user/day snapshot',
  labelNames: ['field'],
  buckets: [0.01, 0.02, 0.05, 0.1, 0.2, 0.4, 0.8, 1.6],
});
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

function stableStringify(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number' || t === 'boolean') return JSON.stringify(value);
  if (t === 'string') return JSON.stringify(value);
  if (t === 'bigint') return `"${value.toString()}"`;
  if (Buffer.isBuffer(value)) {
    return `"buf:${value.toString('hex')}"`;
  }
  if (value && typeof value.toJSON === 'function') {
    return stableStringify(value.toJSON());
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digestFiles(files = []) {
  if (!files.length) return 'nofile';
  const master = createHash('sha256');
  files
    .map((file) => {
      const name = file?.originalname || '';
      const hex = createHash('sha256')
        .update(file?.buffer || Buffer.alloc(0))
        .digest('hex');
      return [name, hex];
    })
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([name, hex]) => {
      master.update(name);
      master.update('\n');
      master.update(hex);
      master.update('\n');
    });
  return master.digest('hex');
}

function computeAutoIdempotencyKey({ userId, body, filesDigest }) {
  const hash = createHash('sha256');
  hash.update(String(userId || ''));
  hash.update('\n');
  hash.update(stableStringify(body || {}));
  hash.update('\n');
  hash.update(filesDigest || 'nofile');
  return `auto:${hash.digest('hex')}`;
}

function advisoryKeyForIdempotency(key) {
  const hex = createHash('sha256').update(key).digest('hex').slice(0, 16);
  const unsigned = BigInt('0x' + hex);
  return BigInt.asIntN(64, unsigned);
}

function diffThresholds(legacy) {
  const kcal = Math.abs(Number(legacy?.calories ?? 0));
  return {
    dkcal: Math.max(40, 0.08 * kcal),
    dp: 4,
    df: 5,
    dc: 6,
    rel_p: 0.12,
    rel_f: 0.12,
    rel_c: 0.12,
  };
}

const DIFF_TZ_OFFSET_MINUTES = (() => {
  const raw = Number.parseInt(process.env.DIFF_TZ_OFFSET_MINUTES || '0', 10);
  return Number.isFinite(raw) ? raw : 0;
})();

function pad2(value) {
  return String(Math.trunc(Math.abs(value))).padStart(2, '0');
}

function computeDiffDate(consumedAt) {
  const base = consumedAt ? new Date(consumedAt) : new Date();
  const offsetMs = DIFF_TZ_OFFSET_MINUTES * 60 * 1000;
  const adjusted = new Date(base.getTime() + offsetMs);
  const year = adjusted.getUTCFullYear();
  const month = pad2(adjusted.getUTCMonth() + 1);
  const day = pad2(adjusted.getUTCDate());
  const dbDate = `${year}-${month}-${day}`;

  const sign = DIFF_TZ_OFFSET_MINUTES >= 0 ? '+' : '-';
  const absMinutes = Math.abs(DIFF_TZ_OFFSET_MINUTES);
  const hours = pad2(Math.floor(absMinutes / 60));
  const minutes = pad2(absMinutes % 60);
  const isoDate = `${dbDate}T00:00:00${sign}${hours}:${minutes}`;

  return {
    dbDate,
    isoDate,
    offsetMinutes: DIFF_TZ_OFFSET_MINUTES,
  };
}

function maskIdempotencyKey(key) {
  if (!key) return null;
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

async function upsertDailyDiff({ client, userId, date, phase }) {
  const { rows } = await client.query(
    `
      WITH aggregated AS (
        SELECT
          $1::uuid AS user_id,
          $2::date AS date,
          COUNT(*) AS records,
          SUM(COALESCE(d.dkcal, 0)) AS sum_dkcal,
          SUM(COALESCE(d.dp, 0)) AS sum_dp,
          SUM(COALESCE(d.df, 0)) AS sum_df,
          SUM(COALESCE(d.dc, 0)) AS sum_dc,
          SUM(COALESCE((d.details->'legacy_totals'->>'calories')::double precision, 0)) AS legacy_calories,
          SUM(COALESCE((d.details->'legacy_totals'->>'protein_g')::double precision, 0)) AS legacy_protein,
          SUM(COALESCE((d.details->'legacy_totals'->>'fat_g')::double precision, 0)) AS legacy_fat,
          SUM(COALESCE((d.details->'legacy_totals'->>'carbs_g')::double precision, 0)) AS legacy_carbs,
          SUM(COALESCE((d.details->'shadow_totals'->>'calories')::double precision, COALESCE((d.details->'legacy_totals'->>'calories')::double precision, 0) + COALESCE(d.dkcal::double precision, 0))) AS shadow_calories,
          SUM(COALESCE((d.details->'shadow_totals'->>'protein_g')::double precision, COALESCE((d.details->'legacy_totals'->>'protein_g')::double precision, 0) + COALESCE(d.dp, 0))) AS shadow_protein,
          SUM(COALESCE((d.details->'shadow_totals'->>'fat_g')::double precision, COALESCE((d.details->'legacy_totals'->>'fat_g')::double precision, 0) + COALESCE(d.df, 0))) AS shadow_fat,
          SUM(COALESCE((d.details->'shadow_totals'->>'carbs_g')::double precision, COALESCE((d.details->'legacy_totals'->>'carbs_g')::double precision, 0) + COALESCE(d.dc, 0))) AS shadow_carbs,
          SUM(COALESCE((d.details->'abs_diff'->>'dkcal')::double precision, ABS(COALESCE(d.dkcal::double precision, 0)))) AS abs_sum_dkcal,
          SUM(COALESCE((d.details->'abs_diff'->>'dp')::double precision, ABS(COALESCE(d.dp, 0)))) AS abs_sum_dp,
          SUM(COALESCE((d.details->'abs_diff'->>'df')::double precision, ABS(COALESCE(d.df, 0)))) AS abs_sum_df,
          SUM(COALESCE((d.details->'abs_diff'->>'dc')::double precision, ABS(COALESCE(d.dc, 0)))) AS abs_sum_dc,
          MAX(COALESCE((d.details->'abs_diff'->>'dkcal')::double precision, ABS(COALESCE(d.dkcal::double precision, 0)))) AS abs_max_dkcal,
          MAX(COALESCE((d.details->'abs_diff'->>'dp')::double precision, ABS(COALESCE(d.dp, 0)))) AS abs_max_dp,
          MAX(COALESCE((d.details->'abs_diff'->>'df')::double precision, ABS(COALESCE(d.df, 0)))) AS abs_max_df,
          MAX(COALESCE((d.details->'abs_diff'->>'dc')::double precision, ABS(COALESCE(d.dc, 0)))) AS abs_max_dc,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY ABS(COALESCE(d.dkcal::double precision, 0))) AS p95_abs_dkcal,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY ABS(COALESCE(d.dp, 0))) AS p95_abs_dp,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY ABS(COALESCE(d.df, 0))) AS p95_abs_df,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY ABS(COALESCE(d.dc, 0))) AS p95_abs_dc,
          SUM(CASE
                WHEN ABS(COALESCE(d.dkcal::double precision, 0)) > COALESCE((d.details->'thresholds'->>'dkcal')::double precision, 1e9)
                  THEN 1
                ELSE 0
              END) AS dkcal_breaches,
          SUM(CASE
                WHEN ABS(COALESCE(d.dp, 0)) > COALESCE((d.details->'thresholds'->>'dp')::double precision, 1e9)
                  THEN 1
                ELSE 0
              END) AS dp_breaches,
          SUM(CASE
                WHEN ABS(COALESCE(d.df, 0)) > COALESCE((d.details->'thresholds'->>'df')::double precision, 1e9)
                  THEN 1
                ELSE 0
              END) AS df_breaches,
          SUM(CASE
                WHEN ABS(COALESCE(d.dc, 0)) > COALESCE((d.details->'thresholds'->>'dc')::double precision, 1e9)
                  THEN 1
                ELSE 0
              END) AS dc_breaches
        FROM diffs d
        WHERE d.level = 'record'
          AND d.user_id = $1
          AND d.date = $2::date
          AND d.phase = $3
      ), deleted AS (
        DELETE FROM diffs
         WHERE phase = $3
           AND user_id = $1
           AND date = $2::date
           AND level = 'day'
        RETURNING 1
      ), inserted AS (
        INSERT INTO diffs
          (phase, user_id, log_id, date, dkcal, dp, df, dc, rel_p, rel_f, rel_c, level, details)
        SELECT
          $3,
          user_id,
          NULL,
          date,
          ROUND(COALESCE(sum_dkcal, 0))::integer,
          ROUND(COALESCE(sum_dp, 0)::numeric, 2)::double precision,
          ROUND(COALESCE(sum_df, 0)::numeric, 2)::double precision,
          ROUND(COALESCE(sum_dc, 0)::numeric, 2)::double precision,
          CASE
            WHEN COALESCE(legacy_protein, 0) = 0 THEN NULL
            ELSE COALESCE(sum_dp, 0) / NULLIF(legacy_protein, 0)
          END,
          CASE
            WHEN COALESCE(legacy_fat, 0) = 0 THEN NULL
            ELSE COALESCE(sum_df, 0) / NULLIF(legacy_fat, 0)
          END,
          CASE
            WHEN COALESCE(legacy_carbs, 0) = 0 THEN NULL
            ELSE COALESCE(sum_dc, 0) / NULLIF(legacy_carbs, 0)
          END,
          'day',
          jsonb_build_object(
            'record_count', records,
            'legacy_totals', jsonb_build_object(
              'calories', COALESCE(legacy_calories, 0),
              'protein_g', COALESCE(legacy_protein, 0),
              'fat_g', COALESCE(legacy_fat, 0),
              'carbs_g', COALESCE(legacy_carbs, 0)
            ),
            'shadow_totals', jsonb_build_object(
              'calories', COALESCE(shadow_calories, 0),
              'protein_g', COALESCE(shadow_protein, 0),
              'fat_g', COALESCE(shadow_fat, 0),
              'carbs_g', COALESCE(shadow_carbs, 0)
            ),
            'abs_diff', jsonb_build_object(
              'sum', jsonb_build_object(
                'dkcal', COALESCE(abs_sum_dkcal, 0),
                'dp', COALESCE(abs_sum_dp, 0),
                'df', COALESCE(abs_sum_df, 0),
                'dc', COALESCE(abs_sum_dc, 0)
              ),
              'max', jsonb_build_object(
                'dkcal', COALESCE(abs_max_dkcal, 0),
                'dp', COALESCE(abs_max_dp, 0),
                'df', COALESCE(abs_max_df, 0),
                'dc', COALESCE(abs_max_dc, 0)
              ),
              'p95', jsonb_build_object(
                'dkcal', COALESCE(p95_abs_dkcal, 0),
                'dp', COALESCE(p95_abs_dp, 0),
                'df', COALESCE(p95_abs_df, 0),
                'dc', COALESCE(p95_abs_dc, 0)
              )
            ),
            'breaches', jsonb_build_object(
              'dkcal', COALESCE(dkcal_breaches, 0),
              'dp', COALESCE(dp_breaches, 0),
              'df', COALESCE(df_breaches, 0),
              'dc', COALESCE(dc_breaches, 0)
            ),
            'generated_at', now()
          )
        FROM aggregated
        WHERE records > 0
        RETURNING *
      )
      SELECT * FROM inserted;
    `,
    [userId, date, phase],
  );
  if (rows.length === 0) {
    return null;
  }
  return rows[0];
}

async function reserveIdempotency({ req, userId, files, pool }) {
  const client = await pool.connect();
  const headerKey = req.get('Idempotency-Key');
  const bodyKey = req.body?.idempotency_key;
  const sanitizedBody = { ...(req.body || {}) };
  delete sanitizedBody.idempotency_key;

  const filesDigest = digestFiles(files);

  const effectiveKey =
    headerKey ||
    bodyKey ||
    computeAutoIdempotencyKey({ userId, body: sanitizedBody, filesDigest });

  const advisoryKey = advisoryKeyForIdempotency(effectiveKey);

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [
      advisoryKey.toString(),
    ]);

    let rows = await client.query(
      `
        INSERT INTO ingest_requests (user_id, request_key, log_id)
        VALUES ($1, $2, NULL)
        ON CONFLICT (user_id, request_key)
        DO NOTHING
        RETURNING id, log_id, created_at
      `,
      [userId, effectiveKey],
    );

    if (rows.rowCount === 0) {
      rows = await client.query(
        `SELECT id, log_id, created_at
           FROM ingest_requests
          WHERE user_id = $1 AND request_key = $2`,
        [userId, effectiveKey],
      );
    }

    const ingestRow = rows.rows[0];
    if (ingestRow.log_id) {
      const { rows: existing } = await client.query(
        `SELECT id, ai_raw::jsonb AS ai_raw_json, landing_type
           FROM meal_logs
          WHERE id = $1 AND user_id = $2`,
        [ingestRow.log_id, userId],
      );
      await client.query('COMMIT');
      client.release();
      if (existing.length === 0) {
        return {
          status: 'stale',
          key: effectiveKey,
          ingestRow,
        };
      }
      return {
        status: 'hit',
        key: effectiveKey,
        ingestRow,
        existing,
      };
    }

    return {
      status: 'new',
      key: effectiveKey,
      ingestRow,
      client,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    throw error;
  }
}

async function writeShadowAndDiff({
  pool,
  userId,
  logId,
  consumedAt,
  foodItem,
  mealType,
  legacyTotals,
  shadowResult,
  imageId,
  landingType,
  idempotencyKey,
}) {
  if (process.env.NORMALIZE_V2_SHADOW !== '1') return;
  if (!shadowResult) return;

  const phase = process.env.NORMALIZE_V2_PHASE || 'P0';
  const dualWriteEnabled = process.env.DUAL_WRITE_V2 === '1';
  const endTimer = shadowWriteDuration.startTimer();
  const consumedAtIso = consumedAt ? new Date(consumedAt).toISOString() : null;
  const diffDateInfo = computeDiffDate(consumedAt);
  const diffDateValue = diffDateInfo.dbDate;
  const normalizedGeneratedAt = new Date().toISOString();

  const totalsNew = shadowResult?.nutrition || {};
  const caloriesNew = Number(totalsNew.calories ?? 0);
  const proteinNew = Number(totalsNew.protein_g ?? 0);
  const fatNew = Number(totalsNew.fat_g ?? 0);
  const carbsNew = Number(totalsNew.carbs_g ?? 0);

  const caloriesLegacy = Number(legacyTotals?.calories ?? 0);
  const proteinLegacy = Number(legacyTotals?.protein_g ?? 0);
  const fatLegacy = Number(legacyTotals?.fat_g ?? 0);
  const carbsLegacy = Number(legacyTotals?.carbs_g ?? 0);

  const diffCalories = Math.round(caloriesNew - caloriesLegacy);
  const diffProtein = proteinNew - proteinLegacy;
  const diffFat = fatNew - fatLegacy;
  const diffCarbs = carbsNew - carbsLegacy;

  const rel = (diff, legacy) =>
    legacy === 0 ? null : diff === 0 ? 0 : diff / legacy;
  const relProtein = rel(diffProtein, proteinLegacy);
  const relFat = rel(diffFat, fatLegacy);
  const relCarbs = rel(diffCarbs, carbsLegacy);

  const meta = {
    ...(shadowResult?.meta || {}),
    source_kind: shadowResult?.meta?.source_kind ?? 'shadow',
    shadow: true,
    idempotency_key: idempotencyKey,
  };
  if (shadowResult?.coverage !== undefined) {
    meta.coverage = shadowResult.coverage;
  }

  const slotValue =
    shadowResult?.breakdown?.slot || shadowResult?.slot || 'other';
  const eventValue = shadowResult?.event || 'eat';
  const shadowWarnings = shadowResult?.breakdown?.warnings ?? [];
  const shadowItems =
    shadowResult?.breakdown?.items ?? shadowResult?.items ?? [];

  const totalsJson = JSON.stringify({
    calories: caloriesNew,
    protein_g: proteinNew,
    fat_g: fatNew,
    carbs_g: carbsNew,
  });

  const normalizedHash = createHash('sha256')
    .update(
      JSON.stringify({
        slot: slotValue,
        event: eventValue,
        totals: {
          calories: caloriesNew,
          protein_g: proteinNew,
          fat_g: fatNew,
          carbs_g: carbsNew,
        },
        items: shadowItems,
        warnings: shadowWarnings,
        coverage: shadowResult?.coverage ?? null,
        landingType,
      }),
    )
    .digest('hex');
  const idempotencyKeyHash = maskIdempotencyKey(idempotencyKey);

  const shadowClient = await pool.connect();
  try {
    await shadowClient.query('BEGIN');

    await shadowClient.query(
      `INSERT INTO meal_logs_v2_shadow
         (user_id, food_item, meal_type, consumed_at, calories, protein_g, fat_g, carbs_g,
          ai_raw, image_id, landing_type, slot, event, totals, meta)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14::jsonb, $15::jsonb)`,
      [
        userId,
        foodItem,
        mealType,
        consumedAt,
        caloriesNew,
        proteinNew,
        fatNew,
        carbsNew,
        JSON.stringify(shadowResult),
        imageId,
        landingType,
        slotValue,
        eventValue,
        totalsJson,
        JSON.stringify(meta),
      ],
    );

    const limits = diffThresholds(legacyTotals);

    const absoluteDiffs = {
      dkcal: diffCalories,
      dp: diffProtein,
      df: diffFat,
      dc: diffCarbs,
    };
    Object.entries(absoluteDiffs).forEach(([field, value]) => {
      if (Number.isFinite(value)) {
        diffAbsoluteHistogram.labels(field).observe(Math.abs(value));
      }
    });

    const relativeDiffs = {
      rel_p: relProtein,
      rel_f: relFat,
      rel_c: relCarbs,
    };
    Object.entries(relativeDiffs).forEach(([field, value]) => {
      if (value !== null && Number.isFinite(value)) {
        diffRelativeHistogram.labels(field).observe(Math.abs(value));
      }
    });

    const diffDetails = {
      warnings: shadowWarnings,
      coverage: shadowResult?.coverage ?? null,
      idempotency_key_hash: idempotencyKeyHash,
      normalized_hash: normalizedHash,
      slot: slotValue,
      event: eventValue,
      legacy_totals: {
        calories: caloriesLegacy,
        protein_g: proteinLegacy,
        fat_g: fatLegacy,
        carbs_g: carbsLegacy,
      },
      shadow_totals: {
        calories: caloriesNew,
        protein_g: proteinNew,
        fat_g: fatNew,
        carbs_g: carbsNew,
      },
      abs_diff: {
        dkcal: Math.abs(diffCalories),
        dp: Math.abs(diffProtein),
        df: Math.abs(diffFat),
        dc: Math.abs(diffCarbs),
      },
      rel_diff: {
        rel_p: relProtein,
        rel_f: relFat,
        rel_c: relCarbs,
      },
      thresholds: limits,
      item_count: shadowItems.length,
    };

    if (dualWriteEnabled) {
      const v2MetaPatch = {
        v2: {
          hash: normalizedHash,
          generated_at: normalizedGeneratedAt,
          idempotency_key_hash: idempotencyKeyHash,
          slot: slotValue,
          event: eventValue,
          coverage: shadowResult?.coverage ?? null,
          warnings: shadowWarnings,
        },
      };

      await shadowClient.query(
        `UPDATE meal_logs
            SET slot = $1,
                event = $2,
                totals = $3::jsonb,
                meta = COALESCE(meta, '{}'::jsonb) || $4::jsonb
          WHERE id = $5
            AND (
              meta IS NULL
              OR (meta->'v2'->>'hash') IS DISTINCT FROM $6
            )`,
        [
          slotValue,
          eventValue,
          totalsJson,
          JSON.stringify(v2MetaPatch),
          logId,
          normalizedHash,
        ],
      );
    }

    if (Math.abs(diffCalories) > limits.dkcal) {
      diffBreachCounter.labels('dkcal').inc();
    }
    if (Math.abs(diffProtein) > limits.dp) {
      diffBreachCounter.labels('dp').inc();
    }
    if (Math.abs(diffFat) > limits.df) {
      diffBreachCounter.labels('df').inc();
    }
    if (Math.abs(diffCarbs) > limits.dc) {
      diffBreachCounter.labels('dc').inc();
    }
    if (relProtein !== null && Math.abs(relProtein) > limits.rel_p) {
      diffBreachCounter.labels('rel_p').inc();
    }
    if (relFat !== null && Math.abs(relFat) > limits.rel_f) {
      diffBreachCounter.labels('rel_f').inc();
    }
    if (relCarbs !== null && Math.abs(relCarbs) > limits.rel_c) {
      diffBreachCounter.labels('rel_c').inc();
    }

    await shadowClient.query(
      `INSERT INTO diffs
         (phase, user_id, log_id, date, dkcal, dp, df, dc, rel_p, rel_f, rel_c, level, details)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'record', $12::jsonb)`,
      [
        phase,
        userId,
        logId,
        diffDateValue,
        diffCalories,
        diffProtein,
        diffFat,
        diffCarbs,
        relProtein,
        relFat,
        relCarbs,
        JSON.stringify(diffDetails),
      ],
    );

    const shouldLogDiff =
      Math.abs(diffCalories) > 0 ||
      Math.abs(diffProtein) > 0 ||
      Math.abs(diffFat) > 0 ||
      Math.abs(diffCarbs) > 0 ||
      shadowWarnings.length > 0;

    if (shouldLogDiff) {
      const diffLogEntry = {
        msg: 'shadow_diff_record',
        phase,
        user_id: userId ? String(userId) : null,
        log_id: logId ? String(logId) : null,
        consumed_at: consumedAtIso,
        diff_date: diffDateValue,
        diff: absoluteDiffs,
        rel_diff: relativeDiffs,
        thresholds: limits,
        warnings: shadowWarnings,
        coverage: shadowResult?.coverage ?? null,
        slot: slotValue,
        event: eventValue,
        legacy_totals: diffDetails.legacy_totals,
        shadow_totals: diffDetails.shadow_totals,
        abs_diff: diffDetails.abs_diff,
        item_count: shadowItems.length,
        idempotency_key_hash: idempotencyKeyHash,
        normalized_hash: normalizedHash,
        diff_timezone_offset_minutes: diffDateInfo.offsetMinutes,
      };
      console.log(JSON.stringify(diffLogEntry));
    }

    const daySnapshot = await upsertDailyDiff({
      client: shadowClient,
      userId,
      date: diffDateValue,
      phase,
    });

    if (daySnapshot) {
      const dayThresholds = diffThresholds(
        daySnapshot.details?.legacy_totals || {},
      );
      if (dayThresholds) {
        daySnapshot.details = {
          ...(daySnapshot.details || {}),
          thresholds: dayThresholds,
        };
        await shadowClient.query(
          `UPDATE diffs
              SET details = details || $1::jsonb
            WHERE id = $2`,
          [JSON.stringify({ thresholds: dayThresholds }), daySnapshot.id],
        );
      }

      const absDaily = {
        dkcal: Math.abs(daySnapshot.dkcal ?? 0),
        dp: Math.abs(daySnapshot.dp ?? 0),
        df: Math.abs(daySnapshot.df ?? 0),
        dc: Math.abs(daySnapshot.dc ?? 0),
      };
      Object.entries(absDaily).forEach(([field, value]) => {
        if (Number.isFinite(value)) {
          diffDailyAbsoluteHistogram.labels(field).observe(value);
        }
      });

      const relDaily = {
        rel_p: daySnapshot.rel_p,
        rel_f: daySnapshot.rel_f,
        rel_c: daySnapshot.rel_c,
      };
      Object.entries(relDaily).forEach(([field, value]) => {
        if (value === null || value === undefined) return;
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
          diffDailyRelativeHistogram.labels(field).observe(Math.abs(numeric));
        }
      });

      const dailyLimits = dayThresholds;
      if (
        dailyLimits &&
        Math.abs(Number(daySnapshot.dkcal ?? 0)) > dailyLimits.dkcal
      ) {
        diffDailyBreachCounter.labels('dkcal').inc();
      }
      if (
        dailyLimits &&
        Math.abs(Number(daySnapshot.dp ?? 0)) > dailyLimits.dp
      ) {
        diffDailyBreachCounter.labels('dp').inc();
      }
      if (
        dailyLimits &&
        Math.abs(Number(daySnapshot.df ?? 0)) > dailyLimits.df
      ) {
        diffDailyBreachCounter.labels('df').inc();
      }
      if (
        dailyLimits &&
        Math.abs(Number(daySnapshot.dc ?? 0)) > dailyLimits.dc
      ) {
        diffDailyBreachCounter.labels('dc').inc();
      }
      if (
        dailyLimits &&
        daySnapshot.rel_p !== null &&
        daySnapshot.rel_p !== undefined &&
        Math.abs(Number(daySnapshot.rel_p)) > dailyLimits.rel_p
      ) {
        diffDailyBreachCounter.labels('rel_p').inc();
      }
      if (
        dailyLimits &&
        daySnapshot.rel_f !== null &&
        daySnapshot.rel_f !== undefined &&
        Math.abs(Number(daySnapshot.rel_f)) > dailyLimits.rel_f
      ) {
        diffDailyBreachCounter.labels('rel_f').inc();
      }
      if (
        dailyLimits &&
        daySnapshot.rel_c !== null &&
        daySnapshot.rel_c !== undefined &&
        Math.abs(Number(daySnapshot.rel_c)) > dailyLimits.rel_c
      ) {
        diffDailyBreachCounter.labels('rel_c').inc();
      }

      console.log(
        JSON.stringify({
          msg: 'shadow_diff_daily',
          phase,
          user_id: userId ? String(userId) : null,
          diff_date: diffDateValue,
          diff_timezone_offset_minutes: diffDateInfo.offsetMinutes,
          dkcal: daySnapshot.dkcal,
          dp: daySnapshot.dp,
          df: daySnapshot.df,
          dc: daySnapshot.dc,
          rel_p: daySnapshot.rel_p,
          rel_f: daySnapshot.rel_f,
          rel_c: daySnapshot.rel_c,
          record_count: daySnapshot.details?.record_count ?? null,
          abs_diff: daySnapshot.details?.abs_diff ?? null,
          breaches: daySnapshot.details?.breaches ?? null,
          thresholds: dailyLimits,
        }),
      );
    }

    await shadowClient.query('COMMIT');
  } catch (err) {
    await shadowClient.query('ROLLBACK').catch(() => {});
    shadowWriteErrorCounter.inc();
    console.error('shadow write failed', err);
  } finally {
    shadowClient.release();
    endTimer();
  }
}

function buildShadowCandidate({ result, dishName }) {
  if (process.env.NORMALIZE_V2_SHADOW !== '1') return null;
  if (!result) return null;

  const items =
    (result.breakdown &&
      Array.isArray(result.breakdown.items) &&
      result.breakdown.items) ||
    (Array.isArray(result.items) ? result.items : []);

  const computeInput = items.map((item) => ({ ...item }));
  const dish = dishName || result.dish || '食事';
  const computed = computeFromItems(computeInput, dish);

  return {
    dish,
    nutrition: {
      protein_g: computed.P,
      fat_g: computed.F,
      carbs_g: computed.C,
      calories: computed.kcal,
    },
    breakdown: {
      items: computeInput,
      warnings: computed.warnings || [],
    },
    meta: {
      ...(result.meta || {}),
      source_kind: result.meta?.source_kind || 'shadow',
      fallback_level: result.meta?.fallback_level ?? 0,
    },
    coverage: result.coverage ?? null,
    event: result.event || 'eat',
  };
}

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
    let reservation;
    try {
      const message = (req.body?.message || '').trim();
      const file = req.file || null;
      const user_id = req.user?.id;
      if (!user_id || (!message && !file)) {
        return res.status(400).json({ ok: false, error: 'bad_request' });
      }

      const files = Array.isArray(req.files) ? req.files : file ? [file] : [];

      reservation = await reserveIdempotency({
        req,
        userId: user_id,
        files,
        pool,
      });

      if (reservation.status === 'hit') {
        const existing = reservation.existing[0];
        let aiPayload = existing?.ai_raw_json;
        if (typeof aiPayload === 'string') {
          try {
            aiPayload = JSON.parse(aiPayload);
          } catch (err) {
            console.warn('failed to parse ai_raw for idempotent hit', err);
            aiPayload = {};
          }
        }
        idempotencyCounter.labels('hit').inc();
        return res.status(200).json({
          ok: true,
          success: true,
          idempotent: true,
          idempotency_key: reservation.key,
          logId: existing?.id ?? null,
          dish: aiPayload?.dish ?? null,
          confidence: aiPayload?.confidence ?? null,
          nutrition: aiPayload?.nutrition ?? null,
          breakdown: aiPayload?.breakdown ?? null,
          meta: aiPayload?.meta ?? null,
          landing_type:
            aiPayload?.meta?.source_kind ?? existing?.landing_type ?? null,
        });
      }

      if (reservation.status === 'stale') {
        idempotencyCounter.labels('stale').inc();
        return res.status(409).json({
          ok: false,
          success: false,
          idempotent: true,
          error: 'stale_idempotency',
          message:
            'Previous result no longer available. Retry without Idempotency-Key.',
        });
      }

      const client = reservation.client;

      const analysisResult = await analyze({
        text: message,
        imageBuffer: file?.buffer,
        mime: file?.mimetype,
      });

      // PATCH_LOG_GUARD_START
      // The analyze() function now handles all nutrition calculation and fallbacks.
      // We can directly use its output.
      const finalAnalysisResult = {
        ...(analysisResult || {}),
        breakdown: analysisResult?.breakdown || {}, // Ensure breakdown is always present
        nutrition: analysisResult?.nutrition || {
          protein_g: 0,
          fat_g: 0,
          carbs_g: 0,
          calories: 0,
        }, // Ensure nutrition is always present
      };
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
        const { rows: mediaRows } = await client.query(
          `INSERT INTO media_assets (user_id, kind, mime, bytes, url)
           VALUES ($1, 'image', $2, $3, $4) RETURNING id`,
          [user_id, file.mimetype, file.size, imageUrl],
        );
        imageId = mediaRows[0].id;
      }
      const landing_type = finalAnalysisResult.meta.source_kind;

      const { rows } = await client.query(
        `INSERT INTO meal_logs
       (user_id, food_item, meal_type, consumed_at,
        calories, protein_g, fat_g, carbs_g, ai_raw, image_id, landing_type)
       VALUES ($1, $2, 'Chat Log', NOW(), $3, $4, $5, $6, $7::jsonb, $8, $9)
       RETURNING id, food_item, meal_type, consumed_at, calories, protein_g, fat_g, carbs_g, landing_type`,
        [
          user_id,
          finalAnalysisResult.dish || message,
          finalAnalysisResult.nutrition.calories,
          finalAnalysisResult.nutrition.protein_g,
          finalAnalysisResult.nutrition.fat_g,
          finalAnalysisResult.nutrition.carbs_g,
          JSON.stringify(finalAnalysisResult),
          imageId,
          landing_type,
        ],
      );
      const insertedRow = rows[0];
      const logId = insertedRow.id;
      await client.query('UPDATE ingest_requests SET log_id=$1 WHERE id=$2', [
        logId,
        reservation.ingestRow.id,
      ]);
      await client.query('COMMIT');
      reservation.client.release();
      reservation.client = null;

      const shadowCandidate = buildShadowCandidate({
        result: finalAnalysisResult,
        dishName: finalAnalysisResult.dish || message,
      });

      setImmediate(() => {
        writeShadowAndDiff({
          pool,
          userId: user_id,
          logId,
          consumedAt: insertedRow.consumed_at,
          foodItem: insertedRow.food_item,
          mealType: insertedRow.meal_type,
          legacyTotals: insertedRow,
          shadowResult: shadowCandidate,
          imageId,
          landingType: landing_type,
          idempotencyKey: reservation.key,
        }).catch(() => {});
      });
      res.status(200).json({
        ok: true,
        success: true,
        idempotent: false,
        idempotency_key: reservation.key,
        logId,
        dish: finalAnalysisResult.dish,
        confidence: finalAnalysisResult.confidence,
        nutrition: finalAnalysisResult.nutrition,
        breakdown: finalAnalysisResult.breakdown,
        meta: finalAnalysisResult.meta,
        landing_type: finalAnalysisResult.meta.source_kind, // for backward compatibility
      });
      idempotencyCounter.labels('new').inc();
      const volatileOn = process.env.ENABLE_VOLATILE_SLOTS === '1';
      if (volatileOn) {
        slotState.set(logId, analysisResult); // Store the full analysisResult
      }
    } catch (err) {
      if (reservation && reservation.status === 'new' && reservation.client) {
        await reservation.client.query('ROLLBACK').catch(() => {});
        reservation.client.release();
        reservation.client = null;
      }
      console.error('POST /log failed', err);
      idempotencyCounter.labels('error').inc();
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
