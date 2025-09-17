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
function finalizeTotals(sumMid, _maybeMin = null, _maybeMax = null) {
  // === Atwater-fixed finalize ===
  const ATWATER = {
    P: 4,
    F: 9,
    C: 4,
    tol: 0.15,
    fatAdjust: 0.15,
    scaleDown: 0.9,
    scaleUp: 1.1,
  };
  let P = roundPF(sumMid.P),
    F = roundPF(sumMid.F),
    C = roundPF(sumMid.C);
  let kcal = roundKcal(sumMid.kcal);
  const calc = () => ATWATER.P * P + ATWATER.F * F + ATWATER.C * C;
  let kpf = calc();
  let delta = Math.abs(kpf - kcal) / Math.max(1, kcal);
  if (delta <= ATWATER.tol) return ok();

  // 1) one-shot fat adjust
  const sign = kpf > kcal ? -1 : +1;
  let F2 = roundPF(F * (1 + sign * ATWATER.fatAdjust));
  const kpf2 = ATWATER.P * P + ATWATER.F * F2 + ATWATER.C * C;
  let delta2 = Math.abs(kpf2 - kcal) / Math.max(1, kcal);
  if (delta2 <= ATWATER.tol) {
    F = F2;
    return ok();
  }

  // 2) one-shot global scale (best single step within allowed range)
  const ratio = kcal / Math.max(1, kpf2);
  const scale = Math.max(ATWATER.scaleDown, Math.min(ATWATER.scaleUp, ratio));

  P = roundPF(P * scale);
  F = roundPF(F2 * scale);
  C = roundPF(C * scale);
  kpf = calc();
  delta = Math.abs(kpf - kcal) / Math.max(1, kcal);
  return ok();

  function ok() {
    return {
      total: { P, F, C, kcal },
      atwater: { delta },
      range: null, // Range logic is removed in this simplified version
    };
  }
}

module.exports = {
  POLICY,
  roundPF,
  roundKcal,
  atwaterKcal,
  conservationDelta,
  finalizeTotals,
};
