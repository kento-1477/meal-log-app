const DISABLED_MARKERS = new Set(['0', 'false', 'no', 'off', 'disabled', '']);
const ENABLED_MARKERS = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const RETRY_ON_429 = String(process.env.RETRY_ON_429 || '').trim() === '1';

function isAiEnabled() {
  const raw = process.env.ENABLE_AI;
  if (raw === undefined || raw === null) return true;
  const normalized = String(raw).trim().toLowerCase();
  if (ENABLED_MARKERS.has(normalized)) return true;
  if (DISABLED_MARKERS.has(normalized)) return false;
  return true;
}

const crypto = require('crypto');
const { setTimeout: delay } = require('timers/promises');
const geminiProvider = require('./geminiProvider');
const { createDictProvider } = require('./dictProvider');
const { toProviderPayload } = require('../adapters/aiAdapter');
const { computeFromItems } = require('../computeFromItems');
const { GUARDRAIL_VERSION } = require('../guardrails');

const DEFAULT_MODEL = process.env.AI_MODEL || 'gemini-1.5-flash';
const DEFAULT_PROMPT_VERSION = process.env.PROMPT_VERSION || 'v1';
const DEFAULT_MODEL_VERSION = process.env.MODEL_VERSION || '2025-09-25-a';
const DEFAULT_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 8000);
const DEFAULT_MAX_LATENCY_MS = Number(process.env.AI_MAX_LATENCY_MS || 15000);
const DEFAULT_MAX_RETRIES = Number(process.env.NUTRITION_MAX_RETRIES || 1);
const CIRCUIT_FAILURE_THRESHOLD = Number(
  process.env.AI_CIRCUIT_FAILURE_THRESHOLD || 5,
);
const CIRCUIT_OPEN_MS = Number(process.env.AI_CIRCUIT_OPEN_MS || 30000);

function hashRequest(text, locale) {
  return crypto
    .createHash('sha256')
    .update(`${locale || 'ja'}::${text}`)
    .digest('hex');
}

function createCircuitBreaker() {
  let failureCount = 0;
  let openedAt = null;

  function isOpen() {
    if (openedAt == null) return false;
    if (Date.now() - openedAt > CIRCUIT_OPEN_MS) {
      openedAt = null;
      failureCount = 0;
      return false;
    }
    return true;
  }

  function recordSuccess() {
    failureCount = 0;
    openedAt = null;
  }

  function recordFailure() {
    failureCount += 1;
    if (failureCount >= CIRCUIT_FAILURE_THRESHOLD) {
      openedAt = Date.now();
    }
  }

  function trip() {
    openedAt = Date.now();
  }

  return { isOpen, recordSuccess, recordFailure, trip };
}

function computeTotalsFromItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { P: 0, F: 0, C: 0, kcal: 0 };
  }
  const { P, F, C, kcal } = computeFromItems(items);
  return { protein_g: P, fat_g: F, carbs_g: C, kcal };
}

function adaptGeminiResult(result) {
  if (!result || typeof result !== 'object') {
    return {
      totals: { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
      items: [],
      warnings: ['ai_no_result'],
      confidence: null,
      meta: {},
    };
  }

  const totals = {
    kcal: Number(result.calories ?? result?.nutrition?.calories ?? 0),
    protein_g: Number(result.protein_g ?? result?.nutrition?.protein_g ?? 0),
    fat_g: Number(result.fat_g ?? result?.nutrition?.fat_g ?? 0),
    carbs_g: Number(result.carbs_g ?? result?.nutrition?.carbs_g ?? 0),
  };

  const allZero =
    !totals.kcal && !totals.protein_g && !totals.fat_g && !totals.carbs_g;
  if (allZero && Array.isArray(result.items) && result.items.length) {
    const computed = computeTotalsFromItems(result.items);
    totals.kcal = computed.kcal;
    totals.protein_g = computed.protein_g;
    totals.fat_g = computed.fat_g;
    totals.carbs_g = computed.carbs_g;
  }

  return {
    dish: result.dish ?? null,
    totals,
    items: Array.isArray(result.items) ? result.items : [],
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    confidence: Number.isFinite(result.confidence) ? result.confidence : null,
    meta: result.meta ?? {},
  };
}

async function callGemini({ text, locale, prompt }) {
  const response = await geminiProvider.analyze({ text, locale, prompt });
  return adaptGeminiResult(response);
}

function isPermanentError(error) {
  const status =
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    error?.response?.statusCode ||
    null;
  if (status === 404) return true;
  if (status === 429) return !RETRY_ON_429;
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('404') || message.includes('not found')) return true;
  if (message.includes('429') || message.includes('too many requests'))
    return !RETRY_ON_429;
  return false;
}

function createAiProvider({
  llm = null,
  dictFallback = null,
  promptVersion = DEFAULT_PROMPT_VERSION,
  model = DEFAULT_MODEL,
  modelVersion = DEFAULT_MODEL_VERSION,
  guardrailVersion = GUARDRAIL_VERSION,
  logger = console,
} = {}) {
  const breaker = createCircuitBreaker();
  const fallbackProvider =
    dictFallback || createDictProvider({ useGemini: false });

  async function analyze({ text, locale = 'ja', _userId = null }) {
    const requestId = hashRequest(text, locale);
    const meta = {
      provider: 'ai',
      model,
      modelVersion,
      promptVersion,
      guardrailVersion,
      requestId,
    };

    const fallbackToDict = async (reason) => {
      try {
        if (fallbackProvider?.analyzeLegacy) {
          const legacy = await fallbackProvider.analyzeLegacy({ text, locale });
          const payload = adaptGeminiResult({
            dish: legacy.dish,
            confidence: legacy.confidence,
            calories: legacy.nutrition?.calories,
            protein_g: legacy.nutrition?.protein_g,
            fat_g: legacy.nutrition?.fat_g,
            carbs_g: legacy.nutrition?.carbs_g,
            items: legacy.breakdown?.items,
            warnings: legacy.breakdown?.warnings || [],
            meta: { ...legacy.meta, fallback_used: true },
          });
          const warningSet = new Set(payload.warnings || []);
          warningSet.add('ai_fallback_dict');
          if (reason) warningSet.add(reason);
          logger.info?.('aiProvider.fallback_dict', { requestId, reason });
          return {
            ...payload,
            warnings: Array.from(warningSet),
            meta: { ...meta, ...payload.meta, fallback: reason },
          };
        }
      } catch (fallbackError) {
        logger.error?.('aiProvider.dictFallbackError', {
          requestId,
          error: fallbackError?.message,
        });
      }
      return {
        dish: text || null,
        totals: { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
        items: [],
        warnings: ['ai_failed', reason].filter(Boolean),
        confidence: null,
        meta: { ...meta, fallback: reason, fallback_error: true },
      };
    };

    const aiEnabled = isAiEnabled();
    if (!aiEnabled) {
      logger.warn?.('aiProvider.disabled', { requestId });
      return fallbackToDict('ai_disabled');
    }

    if (breaker.isOpen()) {
      logger.warn?.('aiProvider.circuitOpen', { requestId });
      return fallbackToDict('ai_circuit_open');
    }

    const maxRetries = Math.max(0, DEFAULT_MAX_RETRIES);
    const timeoutMs = DEFAULT_TIMEOUT_MS;
    const maxLatency = DEFAULT_MAX_LATENCY_MS;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const raw = llm
          ? await llm.complete({
              text,
              locale,
              promptVersion,
              signal: controller.signal,
            })
          : await callGemini({ text, locale, prompt: promptVersion });
        clearTimeout(timeout);
        const duration = Date.now() - start;
        if (duration > maxLatency) {
          breaker.recordFailure();
          logger.warn?.('aiProvider.latencyExceeded', {
            requestId,
            duration,
          });
          continue;
        }
        breaker.recordSuccess();
        const payload = toProviderPayload(raw, { fallbackDish: text });
        return {
          ...payload,
          meta: { ...meta, ...payload.meta, latencyMs: duration },
        };
      } catch (error) {
        breaker.recordFailure();
        const permanent = isPermanentError(error);
        if (permanent) {
          breaker.trip();
          logger.warn?.('aiProvider.permanentError', {
            requestId,
            attempt,
            error: error?.message,
          });
        } else {
          logger.error?.('aiProvider.error', {
            requestId,
            attempt,
            error: error?.message,
          });
        }
        if (!permanent && attempt < maxRetries) {
          const backoff = 200 * 2 ** attempt;
          await delay(backoff);
          continue;
        }
        const reason = permanent ? 'dict_permanent_error' : 'dict_error';
        return fallbackToDict(reason);
      }
    }
    return fallbackToDict('dict_unavailable');
  }

  return { analyze, meta: { model, modelVersion, promptVersion } };
}

module.exports = { createAiProvider };
