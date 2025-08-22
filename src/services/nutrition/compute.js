// NUTRI_BREAKDOWN_START compute.js
const foods = require('../../data/foods.json');
const density = require('../../data/density.json');

const FOOD_BY_CODE = Object.fromEntries(foods.map((f) => [f.code, f]));

function mlToG(code, ml) {
  const d = density?.[code] ?? 1.0;
  return Math.round((ml || 0) * d);
}

function reconcileKcal({ P, F, C, kcal }) {
  const rule = Math.round(P * 4 + F * 9 + C * 4);
  const gap = Math.abs((kcal ?? rule) - rule) / Math.max(1, rule);
  const fixed = gap > 0.15 ? rule : Math.round(kcal ?? rule);
  const warned = gap > 0.15;
  return { kcal: fixed, warned, rule };
}

function computeFromItems(itemsInput) {
  const items = (itemsInput || []).filter((it) => it?.include !== false);
  let P = 0,
    F = 0,
    C = 0,
    kcalSum = 0;
  const warnings = [];
  const normItems = [];

  for (const it of items) {
    const code = it.code;
    const food = FOOD_BY_CODE[code];
    if (!food) {
      warnings.push(`unknown_code:${code}`);
      continue;
    }

    const qty_g = it.qty_g ?? mlToG(code, it.qty_ml);
    const ratio = (qty_g || 0) / 100;

    const p = (food.per100g.p || 0) * ratio;
    const f = (food.per100g.f || 0) * ratio;
    const c = (food.per100g.c || 0) * ratio;
    const k = (food.per100g.kcal || 0) * ratio;

    P += p;
    F += f;
    C += c;
    kcalSum += k;

    normItems.push({
      code,
      name: food.name,
      qty_g,
      include: true,
      method: it.method,
      tags: it.tags || [],
    });
  }

  P = Math.round(P);
  F = Math.round(F);
  C = Math.round(C);
  const { kcal, warned } = reconcileKcal({
    P,
    F,
    C,
    kcal: Math.round(kcalSum),
  });
  if (warned) warnings.push('kcal_reconciled');

  return { P, F, C, kcal, warnings, items: normItems };
}

module.exports = { computeFromItems, mlToG, FOOD_BY_CODE };
// NUTRI_BREAKDOWN_END compute.js
