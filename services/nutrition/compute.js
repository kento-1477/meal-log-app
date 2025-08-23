const PER_G = {
  rice_cooked: { P: 0.025, F: 0.003, C: 0.38 }, // ~1.68 kcal/g
  pork_loin_cutlet: { P: 0.18, F: 0.22, C: 0.09 }, // ~3.06 kcal/g
  pork_fillet_cutlet: { P: 0.22, F: 0.12, C: 0.09 }, // ~2.32 kcal/g
};

const round1 = (n) => Math.round(n * 10) / 10;

function computeFromItems(items = []) {
  let P = 0,
    F = 0,
    C = 0;
  const normalized = (items || [])
    .filter((i) => i && i.include !== false)
    .map((i) => {
      const code = i.code || null;
      const qty_g =
        typeof i.qty_g === 'number'
          ? i.qty_g
          : i.unit === 'g' && typeof i.qty === 'number'
            ? i.qty
            : 0;

      const m = (code && PER_G[code]) || { P: 0, F: 0, C: 0 };
      P += qty_g * m.P;
      F += qty_g * m.F;
      C += qty_g * m.C;

      return { ...i, code, qty_g };
    });

  const kcal = P * 4 + F * 9 + C * 4;
  return {
    P: round1(P),
    F: round1(F),
    C: round1(C),
    kcal: round1(kcal),
    warnings: [],
    items: normalized,
  };
}

module.exports = { computeFromItems };
