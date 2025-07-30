// [DEDUPE-KEY V1]
function floorToMinute(dateIsoUtc) {
  const d = new Date(dateIsoUtc);
  d.setUTCSeconds(0, 0);
  return d.toISOString().slice(0, 16) + 'Z'; // 例: 2025-07-29T10:00Z
}
function makeDedupeKey(reminderId, nowIsoUtc) {
  return `rem:${reminderId}:${floorToMinute(nowIsoUtc)}`;
}
module.exports = { floorToMinute, makeDedupeKey };
// [/DEDUPE-KEY V1]
