const crypto = require('crypto');

const { createAiProvider } = require('./providers/aiProvider');
const { createHybridProvider } = require('./providers/hybridProvider');
const { createDictProvider } = require('./providers/dictProvider');
const { createGuardrailRunner, GUARDRAIL_VERSION } = require('./guardrails');
const { createCache } = require('./cache');
const { computeFromItems } = require('./computeFromItems');

const AI_MODEL = process.env.AI_MODEL || 'gemini-1.5-flash';
const MODEL_VERSION = process.env.MODEL_VERSION || '2025-09-25-a';
const PROMPT_VERSION = process.env.PROMPT_VERSION || 'v1';
const CACHE_ENABLED = process.env.CACHE_ENABLED !== '0';
const CACHE_TTL_SEC = Number(process.env.CACHE_TTL_SEC || 60 * 60 * 24 * 7);

const guardrailRunner = createGuardrailRunner();
const cache = createCache({ ttlSeconds: CACHE_TTL_SEC });

const providerFactories = {
  ai: () =>
    createAiProvider({
      model: AI_MODEL,
      modelVersion: MODEL_VERSION,
      promptVersion: PROMPT_VERSION,
      guardrailVersion: guardrailRunner.version,
    }),
  hybrid: () =>
    createHybridProvider({
      guardrailVersion: guardrailRunner.version,
    }),
  dict: () => createDictProvider(),
};

const providerCache = {};

function normalizeText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim().toLowerCase();
}

function selectProviderName() {
  const mode = (process.env.NUTRITION_PROVIDER || 'ai').toLowerCase();
  if (providerFactories[mode]) return mode;
  return 'ai';
}

function getProvider(name = null) {
  const resolved = name || selectProviderName();
  if (!providerCache[resolved]) {
    providerCache[resolved] = providerFactories[resolved]();
  }
  return providerCache[resolved];
}

function buildCacheKey({ text, locale, providerName }) {
  const normalized = normalizeText(text);
  const payload = JSON.stringify({
    normalized,
    locale,
    providerName,
    model: AI_MODEL,
    modelVersion: MODEL_VERSION,
    promptVersion: PROMPT_VERSION,
    guardrailVersion: guardrailRunner.version,
  });
  return `nutrition:${crypto.createHash('sha256').update(payload).digest('hex')}`;
}

async function runAnalysis({ text, locale = 'ja', userId = null }) {
  const providerName = selectProviderName();
  const provider = getProvider(providerName);
  const raw = await provider.analyze({ text, locale, userId });
  let safe;
  try {
    safe = guardrailRunner.run(raw, {
      inputText: text,
    });
  } catch (error) {
    safe = {
      dish: text || null,
      totals: { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
      items: [],
      warnings: ['guardrail_failed', error?.message].filter(Boolean),
      confidence: null,
      meta: { guardrail_error: error?.message },
    };
  }
  const warnings = Array.from(new Set(safe.warnings || []));
  return {
    ...safe,
    warnings,
    meta: {
      ...(safe.meta || {}),
      provider: providerName,
      model: AI_MODEL,
      modelVersion: MODEL_VERSION,
      promptVersion: PROMPT_VERSION,
      guardrail_version: guardrailRunner.version,
    },
  };
}

async function analyze({ text, locale = 'ja', userId = null }) {
  const providerName = selectProviderName();
  const cacheKey = buildCacheKey({ text, locale, providerName });
  if (CACHE_ENABLED) {
    return cache.wrap(cacheKey, () => runAnalysis({ text, locale, userId }), {
      ttlSec: CACHE_TTL_SEC,
    });
  }
  return runAnalysis({ text, locale, userId });
}

async function analyzeLegacy(input) {
  const dict = getProvider('dict');
  if (typeof dict.analyzeLegacy === 'function') {
    return dict.analyzeLegacy(input);
  }
  return dict.analyze(input);
}

module.exports = { analyze, analyzeLegacy, computeFromItems, getProvider };
