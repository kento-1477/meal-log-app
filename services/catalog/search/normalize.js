const BRAND_STOPWORDS = [
  'セブンイレブン',
  'セブン',
  'ファミリーマート',
  'ファミマ',
  'ローソン',
  'ミニストップ',
  'セブンの',
  'ファミマの',
  'ローソンの',
  'セイコーマート',
];

function kanaToHiragana(text) {
  return text.replace(/[\u30a1-\u30f6]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) - 0x60),
  );
}

function removeStopwords(text) {
  let result = text;
  for (const word of BRAND_STOPWORDS) {
    result = result.replace(new RegExp(word, 'gi'), '');
  }
  return result;
}

function normalizeQuery(text = '') {
  if (!text) return '';
  const nfkc = text.normalize('NFKC');
  const lower = nfkc.toLowerCase();
  const kana = kanaToHiragana(lower);
  const cleaned = kana
    .replace(/[\s\u3000]+/g, ' ')
    .replace(/[\uFF0C,、，；;]+/g, ' ')
    .replace(/[\u2010-\u2015\u2212\u30fc\-]+/g, '-')
    .trim();
  const withoutBrands = removeStopwords(cleaned);
  return withoutBrands.replace(/\s+/g, ' ').trim();
}

module.exports = {
  normalizeQuery,
  kanaToHiragana,
};
