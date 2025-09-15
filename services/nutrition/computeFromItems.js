// services/nutrition/computeFromItems.js

const { canon } = require('./nameResolver');

// 100gあたり代表値（DBが無くても動く）
const REP = {
  ごはん: { kcal: 168, P: 2.5, F: 0.3, C: 37.0 },
  とんかつ: { kcal: 420, P: 22, F: 30, C: 15 }, // 衣と油を考慮した代表値
  うどん: { kcal: 105, P: 2.6, F: 0.4, C: 21.6 }, // 茹で麺
  小麦粉: { kcal: 367, P: 8.0, F: 1.5, C: 76.0 },
  片栗粉: { kcal: 330, P: 0.0, F: 0.0, C: 82.6 },
  サラダ油: { kcal: 900, P: 0.0, F: 100, C: 0.0 },
  鶏肉: { kcal: 197, P: 18.3, F: 12.1, C: 0.0 }, // 鶏もも生ベース
  豚肉: { kcal: 263, P: 20.5, F: 19.3, C: 0.0 }, // 生豚肉の代表値
  醤油: { kcal: 71, P: 7.7, F: 0.1, C: 3.4 }, // 少量なのでPFCは微小
  キャベツ: { kcal: 23, P: 1.3, F: 0.1, C: 5.2 }, // 100gあたりの代表値（日本食品標準成分表に近い）
};

function getGrams(it) {
  const raw =
    it.grams ??
    it.qty_g ??
    it.quantity_g ??
    it.weight_g ??
    it.g ??
    it.amount ??
    it.quantity ??
    0;
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const { POLICY, finalizeTotals } = require('./policy.js');

function addOilAbsorption(sum, finishedGrams, factor) {
  const oilG = Math.max(0, Math.round((finishedGrams || 0) * factor));
  // サラダ油の代表値（100gあたり）
  sum.P += (0 * oilG) / 100;
  sum.F += (100 * oilG) / 100;
  sum.C += (0 * oilG) / 100;
  sum.kcal += (900 * oilG) / 100;
  return oilG;
}

function per100FromName(name) {
  const key = canon(name); // ← canon済みキーで照会
  const hit = REP[key] ? { per100: REP[key], source: `category:${key}` } : null;
  console.debug('[per100]', { raw: name, canon: key, hit: !!hit });

  if (hit) return hit;

  // ヒューリスティック（最後の砦）
  if (/キャベツ|cabbage/i.test(name)) {
    return { per100: REP['キャベツ'], source: 'heuristic:cabbage' };
  }
  if (/とんかつ|豚.?カツ/.test(name)) {
    return { per100: REP['とんかつ'], source: 'heuristic:tonkatsu_ja' };
  }
  if (/cutlet|tonkatsu|pork.*cutlet/i.test(name)) {
    return { per100: REP['とんかつ'], source: 'heuristic:tonkatsu' };
  }
  if (/油|オイル/.test(key))
    return { per100: REP['サラダ油'], source: 'heuristic:oil' };
  if (/砂糖|シロップ/.test(key))
    return {
      per100: { kcal: 400, P: 0, F: 0, C: 100 },
      source: 'heuristic:sugar',
    };
  if (/米|飯/.test(key))
    return { per100: REP['ごはん'], source: 'heuristic:rice' };
  return null;
}

// ★エクスポート：既存の呼び出しに合わせた形
function computeFromItems(items = [], dishName = '') {
  const sumMid = { P: 0, F: 0, C: 0, kcal: 0 };
  let warnings = [];
  const resolved = [];
  let finishedGrams = 0;

  for (const it of items) {
    const name = it.name || it.ingredient || it.code || '';
    const grams = getGrams(it);

    const key = canon(name);
    const hit = per100FromName(name); // per100FromName already calls canon
    console.debug('[itemsum]', { raw: name, canon: key, grams, hit: !!hit });

    if (!name || grams <= 0) {
      resolved.push({ ...it, pending: true });
      continue;
    }
    finishedGrams += grams;

    if (hit) {
      sumMid.P += (hit.per100.P * grams) / 100;
      sumMid.F += (hit.per100.F * grams) / 100;
      sumMid.C += (hit.per100.C * grams) / 100;
      sumMid.kcal += (hit.per100.kcal * grams) / 100;
      resolved.push({
        ...it,
        pending: it.pending === true ? true : false,
        source: hit.source,
        per100: hit.per100,
      });
    } else {
      resolved.push({ ...it, pending: true });
    }
  }

  const isDeepFriedDish = /揚|フライ|唐揚|天ぷら/i.test(dishName);
  let sumMin = null,
    sumMax = null;

  if (isDeepFriedDish) {
    sumMin = { ...sumMid };
    sumMax = { ...sumMid };
    addOilAbsorption(sumMin, finishedGrams, POLICY.oilAbsorption.min);
    addOilAbsorption(sumMid, finishedGrams, POLICY.oilAbsorption.mid);
    addOilAbsorption(sumMax, finishedGrams, POLICY.oilAbsorption.max);
  }

  const out = finalizeTotals(sumMid, sumMin, sumMax);

  /** totalが0で、すべてのアイテムが未確定/0gならここで保険（必要ならdefaultsForDishを呼ぶ） */
  // if ((!sumMid.kcal || sumMid.kcal === 0) && Array.isArray(items) && items.length && items.every(i => !Number(i?.grams))) {
  //   // TODO: dishNameに応じた既定レシピをここで適用し、finalizeTotalsでoutを上書きする実装を入れる
  // }

  // 互換性維持
  return {
    P: out.total.P,
    F: out.total.F,
    C: out.total.C,
    kcal: out.total.kcal,
    atwater: out.atwater,
    range: out.range,
    warnings,
    items: resolved,
  };
}

module.exports = { computeFromItems };
