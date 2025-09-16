const nameMap = require('../../src/data/food_names.json');

// --- START: Canon & Alias logic (moved from computeFromItems.js) ---
function _norm(s = '') {
  // Full-width to half-width, lowercase, and trim
  const halfWidth = String(s).replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
  return halfWidth.trim().toLowerCase().replace(/\s+/g, '_');
}

const ALIAS = {
  // ごはん
  白米: 'ごはん',
  白ごはん: 'ごはん',
  ご飯: 'ごはん',
  rice: 'ごはん',
  cooked_rice: 'ごはん',
  rice_cooked: 'ごはん',

  // とんかつ
  とんかつ: 'とんかつ',
  豚カツ: 'とんかつ',
  豚かつ: 'とんかつ',
  tonkatsu: 'とんかつ',
  pork_cutlet: 'とんかつ',
  pork_loin_cutlet: 'とんかつ',

  // うどん（今後のため）
  udon: 'うどん',
  うどん: 'うどん',

  // 既存のSYNからの移行
  米: 'ごはん',
  精白米: 'ごはん',
  うるち米: 'ごはん',
  米飯: 'ごはん',
  白飯: 'ごはん',
  片栗粉: '片栗粉',
  でん粉: '片栗粉',
  澱粉: '片栗粉',
  ポテトスターチ: '片栗粉',
  コーンスターチ: '片栗粉',
  小麦粉: '小麦粉',
  薄力粉: '小麦粉',
  中力粉: '小麦粉',
  強力粉: '小麦粉',
  '小麦粉（薄力粉）': '小麦粉',
  サラダ油: 'サラダ油',
  植物油: 'サラダ油',
  オイル: 'サラダ油',
  食用油: 'サラダ油',
  菜種油: 'サラダ油',
  キャノーラ油: 'サラダ油',
  鶏肉: '鶏肉',
  鶏もも: '鶏肉',
  鶏むね: '鶏肉',
  鶏ささみ: '鶏肉',
  とり肉: '鶏肉',
  醤油: '醤油',
  しょうゆ: '醤油',
  ショウユ: '醤油',
  // キャベツ
  cabbage: 'キャベツ',
  shredded_cabbage: 'キャベツ',
  キャベツ: 'キャベツ',
};

function canon(nameOrCode = '') {
  const k = _norm(nameOrCode);
  // Special case for とんかつ variants not covered by simple norm
  if (/とんかつ|豚カツ|カツ|cutlet|ヒレ|フィレ|ロース/i.test(nameOrCode)) {
    return 'とんかつ';
  }
  return ALIAS[k] || nameOrCode; // Fallback to the original if no alias found
}
// --- END: Canon & Alias logic ---

/**
 * Resolves display names for a list of food items.
 * If an item's name is the same as its code, it attempts to replace it
 * with a user-friendly Japanese name from the map.
 * @param {Array<object>} items - The array of food items.
 * @returns {Array<object>} The array of food items with resolved names.
 */
function resolveNames(items = []) {
  if (!items || items.length === 0) {
    return [];
  }

  return items.map((item) => {
    // Use canon to get a normalized Japanese name for display
    const canonicalName = canon(item.name || item.code || '');
    // If the canonical name is different and not just the original code, use it.
    // Also, if nameMap has a more specific display name for the code, use that.
    if (item.name === item.code && nameMap[item.code]) {
      return {
        ...item,
        name: nameMap[item.code],
      };
    } else if (
      canonicalName !== (item.name || item.code || '') &&
      canonicalName !== item.name
    ) {
      // If canon provides a better name and it's not already the item's name
      return {
        ...item,
        name: canonicalName,
      };
    }
    return item;
  });
}

module.exports = { resolveNames, canon };
