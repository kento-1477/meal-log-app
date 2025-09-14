// services/nutrition/computeFromItems.js
function norm(s = '') {
  return String(s)
    .trim()
    .replace(/\s+/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    );
}

// ざっくり同義語（必要に応じて拡張）
const SYN = {
  白ごはん: ['ごはん', 'ご飯', '白飯', '米飯', '白米ご飯'],
  米: ['精白米', 'うるち米', '米飯', '白飯', 'ご飯'],
  片栗粉: ['でん粉', '澱粉', 'ポテトスターチ', 'コーンスターチ'],
  小麦粉: ['薄力粉', '中力粉', '強力粉', '小麦粉（薄力粉）'],
  サラダ油: ['植物油', 'オイル', '食用油', '菜種油', 'キャノーラ油'],
  鶏肉: ['鶏もも', '鶏むね', '鶏ささみ', 'とり肉'],
  醤油: ['しょうゆ', 'ショウユ'],
};

// 100gあたり代表値（DBが無くても動く）
const REP = {
  白ごはん: { kcal: 168, P: 2.5, F: 0.3, C: 37.0 },
  米: { kcal: 168, P: 2.5, F: 0.3, C: 37.0 },
  小麦粉: { kcal: 367, P: 8.0, F: 1.5, C: 76.0 },
  片栗粉: { kcal: 330, P: 0.0, F: 0.0, C: 82.6 },
  サラダ油: { kcal: 900, P: 0.0, F: 100, C: 0.0 },
  鶏肉: { kcal: 197, P: 18.3, F: 12.1, C: 0.0 }, // 鶏もも生ベース
  豚肉: { kcal: 263, P: 20.5, F: 19.3, C: 0.0 }, // 生豚肉の代表値
  醤油: { kcal: 71, P: 7.7, F: 0.1, C: 3.4 }, // 少量なのでPFCは微小
};

// 名寄せ→代表値キーへ（なければそのまま）
function canon(raw = '') {
  const s = norm(raw);

  // とんかつ系は豚肉に寄せる
  if (/とんかつ|豚カツ|カツ|cutlet|ヒレ|ﾋﾚ|フィレ|ﾌｨﾚ|ロース|ﾛｰｽ/i.test(s)) {
    return '豚肉';
  }

  for (const [k, alts] of Object.entries(SYN)) {
    if (s.includes(k) || alts.some((a) => s.includes(norm(a)))) return k;
  }
  return s;
}

function getGrams(it) {
  const raw = it.grams ?? it.qty_g ?? it.quantity_g ?? it.g ?? it.amount ?? 0;
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
  const c = canon(name);
  if (REP[c]) return { per100: REP[c], source: `category:${c}` };
  // ヒューリスティック（最後の砦）
  if (/油|オイル/.test(c))
    return { per100: REP['サラダ油'], source: 'heuristic:oil' };
  if (/砂糖|シロップ/.test(c))
    return {
      per100: { kcal: 400, P: 0, F: 0, C: 100 },
      source: 'heuristic:sugar',
    };
  if (/米|飯/.test(c))
    return { per100: REP['白ごはん'], source: 'heuristic:rice' };
  return null;
}

// ★エクスポート：既存の呼び出しに合わせた形
function computeFromItems(items = [], dishName = '') {
  const sumMid = { P: 0, F: 0, C: 0, kcal: 0 };
  let warnings = [];
  const resolved = [];
  let finishedGrams = 0;

  for (const it of items) {
    const name = it.name || it.ingredient || '';
    const grams = getGrams(it);
    if (!name || grams <= 0) {
      resolved.push({ ...it, pending: true });
      continue;
    }
    finishedGrams += grams;

    const hit = per100FromName(name);
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
