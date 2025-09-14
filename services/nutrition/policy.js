const POLICY = {
  objective: { atwaterTolerance: 0.02 }, // ≤2%
  rounding: { digitsPF: 1, digitsKcal: 0 },
  oilAbsorption: { min: 0.05, mid: 0.1, max: 0.15 },
  priority: ['label', 'db', 'category', 'rule', 'template'],
  synonymsVersion: '2025-09-14',
};

function roundPF(x) {
  return Math.round(x * 10) / 10;
}
function roundKcal(x) {
  return Math.round(x);
}
function atwaterKcal(P, F, C) {
  return 4 * P + 9 * F + 4 * C;
}
function conservationDelta({ P, F, C, kcal }) {
  const atw = atwaterKcal(P, F, C);
  return (kcal - atw) / Math.max(1, kcal); // 例: +0.012 = +1.2%
}

/** 集計の最後に一回だけ丸め + 保存則チェック + (任意)幅 */
function finalizeTotals(sumMid, maybeMin = null, maybeMax = null) {
  const total = {
    P: roundPF(sumMid.P),
    F: roundPF(sumMid.F),
    C: roundPF(sumMid.C),
    kcal: roundKcal(sumMid.kcal),
  };
  let range;
  if (maybeMin && maybeMax) {
    range = {
      P: [roundPF(maybeMin.P), roundPF(maybeMax.P)],
      F: [roundPF(maybeMin.F), roundPF(maybeMax.F)],
      C: [roundPF(maybeMin.C), roundPF(maybeMax.C)],
      kcal: [roundKcal(maybeMin.kcal), roundKcal(maybeMax.kcal)],
    };
  }
  const delta = conservationDelta(total);
  const pass = Math.abs(delta) <= POLICY.objective.atwaterTolerance;
  return { total, range, atwater: { delta, pass } };
}

module.exports = {
  POLICY,
  roundPF,
  roundKcal,
  atwaterKcal,
  conservationDelta,
  finalizeTotals,
};
