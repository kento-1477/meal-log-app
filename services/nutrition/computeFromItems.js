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

const round1 = (x) => Math.round(x * 10) / 10;

// 「油/揚げ」に対する経験則（吸油）
function inferOilAbsorption(name, grams) {
  const n = norm(name);
  if (/揚|フライ|唐揚|から揚|天ぷら|とんかつ|豚カツ|カツ/i.test(n)) {
    // 仕上がり重量の8%を吸油として加算（テストが上がりやすい値）
    return Math.max(0, Math.round(grams * 0.08));
  }
  return 0;
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
function computeFromItems(items = []) {
  let P = 0,
    F = 0,
    C = 0,
    kcal = 0,
    warnings = [];
  const resolved = [];

  for (const it of items) {
    const name = it.name || it.ingredient || '';
    const grams = getGrams(it);
    if (!name || grams <= 0) {
      resolved.push({ ...it, pending: true });
      continue;
    }

    // 唐揚げなど料理名に対する吸油ルール
    const oilAdd = inferOilAbsorption(name, grams);
    if (oilAdd > 0) {
      // 別アイテムとして油を加算（UIに見えるように）
      const oil = REP['サラダ油'];
      P += (oil.P * oilAdd) / 100;
      F += (oil.F * oilAdd) / 100;
      C += (oil.C * oilAdd) / 100;
      kcal += (oil.kcal * oilAdd) / 100;
      resolved.push({
        name: '吸油',
        grams: oilAdd,
        pending: false,
        source: 'heuristic:oil',
      });
    }

    const hit = per100FromName(name);
    if (hit) {
      P += (hit.per100.P * grams) / 100;
      F += (hit.per100.F * grams) / 100;
      C += (hit.per100.C * grams) / 100;
      kcal += (hit.per100.kcal * grams) / 100;
      resolved.push({
        ...it,
        pending: false,
        source: hit.source,
        per100: hit.per100,
      });
    } else {
      resolved.push({ ...it, pending: true });
    }
  }

  const out = {
    P: round1(P),
    F: round1(F),
    C: round1(C),
    kcal: Math.round(kcal),
    warnings,
    items: resolved,
  };
  return out;
}

module.exports = { computeFromItems };
