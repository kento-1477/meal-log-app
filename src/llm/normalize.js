// [NORMALIZE-LLM V1]
function toTone(v) {
  const s = String(v || '').toLowerCase();
  if (s.includes('gentle') || s.includes('soft') || s.includes('やさ'))
    return 'gentle';
  if (s.includes('intense') || s.includes('strong') || s.includes('厳'))
    return 'intense';
  return 'gentle';
}
function normalize(raw) {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      message: String(obj.message || '').trim(),
      tone: toTone(obj.tone),
      dedupe_key: String(obj.dedupe_key || '').trim(),
    };
  } catch (_e) {
    return { message: '', tone: 'gentle', dedupe_key: '' };
  }
}
function isValid(n) {
  return !!(
    n.message &&
    n.dedupe_key &&
    (n.tone === 'gentle' || n.tone === 'intense')
  );
}
module.exports = { normalize, isValid };
// [/NORMALIZE-LLM V1]
