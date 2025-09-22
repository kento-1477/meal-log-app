const crypto = require('crypto');
const { finalizeTotals } = require('../policy');

const BASE64_ID = /^[A-Za-z0-9_-]{22}$/;
const ADAPTER_VERSION = '2025-09-20';

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function ensureBase64Id(bytes) {
  return bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function stableItemId(item, index, seed = '') {
  if (item?.item_id && BASE64_ID.test(item.item_id)) {
    return item.item_id;
  }
  const payload = JSON.stringify({
    index,
    seed,
    code: item?.code ?? null,
    name: item?.name ?? item?.ingredient ?? null,
    grams: item?.grams ?? item?.qty_g ?? item?.quantity_g ?? item?.g ?? null,
  });
  const hash = crypto.createHash('sha256').update(payload).digest();
  const uuidBytes = Buffer.from(hash.subarray(0, 16));
  // UUID v4 variant bits to keep downstream tolerant of UUID expectations
  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x40;
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;
  return ensureBase64Id(uuidBytes);
}

function normalizeItem(item, index, seed) {
  if (!item || typeof item !== 'object') {
    return {
      item_id: stableItemId({}, index, seed),
      code: null,
      name: null,
      grams: 0,
      pending: true,
    };
  }

  const gramsCandidates = [
    item.grams,
    item.qty_g,
    item.quantity_g,
    item.g,
    item.amount,
  ];
  const grams = toNumber(
    gramsCandidates.find((v) => Number.isFinite(Number(v))),
    0,
  );

  const normalized = {
    item_id: stableItemId(item, index, seed),
    code: item.code ?? null,
    name: item.name ?? item.ingredient ?? item.code ?? null,
    grams,
    grams_input: item.grams_input ?? null,
    portion_factor: item.portion_factor ?? null,
    pending: Boolean(item.pending),
    source: item.source ?? null,
    note: item.note ?? null,
    per100: item.per100 ?? null,
    meta: item.meta ?? null,
  };

  Object.keys(normalized).forEach((key) => {
    if (normalized[key] === null) {
      delete normalized[key];
    }
  });

  return normalized;
}

function normalizeBreakdown(breakdown = {}, seed = '') {
  const items = Array.isArray(breakdown.items)
    ? breakdown.items.map((item, idx) => normalizeItem(item, idx, seed))
    : [];

  const warnings = Array.isArray(breakdown.warnings)
    ? breakdown.warnings.slice()
    : [];

  const slots =
    breakdown.slots && typeof breakdown.slots === 'object'
      ? { ...breakdown.slots }
      : undefined;

  const result = { items, warnings };
  if (slots && Object.keys(slots).length > 0) {
    result.slots = slots;
  }
  return result;
}

function normalizeMeta(meta = {}, coverage = null, slot = null, event = null) {
  const base = { ...(meta || {}) };
  if (coverage !== null && coverage !== undefined) {
    base.coverage = coverage;
  }
  if (slot && !base.slot) {
    base.slot = slot;
  }
  if (event && !base.event) {
    base.event = event;
  }
  base.adapter = {
    version: ADAPTER_VERSION,
    source: 'shadow_v2',
  };
  return base;
}

function adaptShadowToLegacy(shadowDto) {
  if (!shadowDto || typeof shadowDto !== 'object') {
    throw new TypeError('shadowDto must be an object');
  }

  const dish = shadowDto.dish || '食事';
  const confidence = toNumber(
    shadowDto.confidence ?? shadowDto.meta?.confidence,
    0.6,
  );

  const nutrition = {
    protein_g: toNumber(shadowDto?.nutrition?.protein_g, 0),
    fat_g: toNumber(shadowDto?.nutrition?.fat_g, 0),
    carbs_g: toNumber(shadowDto?.nutrition?.carbs_g, 0),
    calories: toNumber(shadowDto?.nutrition?.calories, 0),
  };

  const totals = finalizeTotals(
    {
      P: nutrition.protein_g,
      F: nutrition.fat_g,
      C: nutrition.carbs_g,
      kcal: nutrition.calories,
    },
    null,
    null,
  );

  const seed =
    shadowDto.meta?.idempotency_key_hash ||
    shadowDto.meta?.hash ||
    shadowDto.meta?.normalized_hash ||
    shadowDto.dish ||
    'shadow_v2';

  const slot = shadowDto.slot || shadowDto.breakdown?.slot || 'other';
  const event = shadowDto.event || 'eat';
  const breakdown = normalizeBreakdown(shadowDto.breakdown, seed);
  const meta = normalizeMeta(
    shadowDto.meta,
    shadowDto.coverage ?? null,
    slot,
    event,
  );

  return {
    dish,
    confidence,
    nutrition,
    atwater: totals.atwater,
    breakdown,
    meta,
    coverage: shadowDto.coverage ?? null,
  };
}

module.exports = { adaptShadowToLegacy };
