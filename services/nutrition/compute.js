const PER_G = {
  // Staples
  rice_cooked: { P: 0.025, F: 0.003, C: 0.38 }, // ~1.68 kcal/g
  ramen_noodles: { P: 0.1, F: 0.01, C: 0.6 },
  udon_noodles: { P: 0.06, F: 0.01, C: 0.55 },
  soba_noodles: { P: 0.12, F: 0.01, C: 0.55 },
  spaghetti_napolitan: { P: 0.08, F: 0.08, C: 0.35 },

  // Main Dishes
  pork_loin_cutlet: { P: 0.18, F: 0.22, C: 0.09 }, // ~3.06 kcal/g
  pork_fillet_cutlet: { P: 0.22, F: 0.12, C: 0.09 }, // ~2.32 kcal/g
  karaage_chicken: { P: 0.14, F: 0.24, C: 0.04 },
  pork_shogayaki: { P: 0.21, F: 0.11, C: 0.04 },
  beef_sukiyaki_style: { P: 0.16, F: 0.24, C: 0.1 }, // Gyudon ingredients
  chicken_egg_donburi: { P: 0.084, F: 0.052, C: 0.056 }, // Oyakodon ingredients
  pork_cutlet_donburi: { P: 0.069, F: 0.075, C: 0.134 }, // Katsudon ingredients
  grilled_salmon: { P: 0.25, F: 0.15, C: 0 },
  hamburger_steak: { P: 0.15, F: 0.2, C: 0.1 },
  chashu_pork: { P: 0.15, F: 0.3, C: 0.01 },

  // Soups & Sauces
  miso_soup: { P: 0.015, F: 0.007, C: 0.028 },
  ramen_soup_shoyu: { P: 0.02, F: 0.03, C: 0.04 },
  udon_soup: { P: 0.01, F: 0.01, C: 0.05 },
  soba_tsuyu: { P: 0.02, F: 0, C: 0.15 },
  curry_sauce_jp: { P: 0.05, F: 0.1, C: 0.15 },

  // Sides & Toppings
  ajitama_egg: { P: 0.13, F: 0.1, C: 0.01 },
  menma: { P: 0.02, F: 0.005, C: 0.04 },
  cabbage_raw: { P: 0.013, F: 0.001, C: 0.06 },
  tsukemono: { P: 0.01, F: 0, C: 0.05 },
};

const round1 = (n) => Math.round(n * 10) / 10;

function computeFromItems(items = []) {
  let P = 0,
    F = 0,
    C = 0;
  const warnings = [];

  const normalized = (items || []).map((i) => {
    const code = i.code || null;
    const qty_g =
      typeof i.qty_g === 'number'
        ? i.qty_g
        : i.unit === 'g' && typeof i.qty === 'number'
          ? i.qty
          : 0;

    // Only add to sum if item is not pending
    if (!i.pending) {
      const m = code && PER_G[code];
      if (m) {
        P += qty_g * m.P;
        F += qty_g * m.F;
        C += qty_g * m.C;
      } else if (code) {
        warnings.push(`成分未登録: ${code}`);
      }
    }

    return { ...i, code, qty_g };
  });

  const kcal = P * 4 + F * 9 + C * 4;
  return {
    P: round1(P),
    F: round1(F),
    C: round1(C),
    kcal: round1(kcal),
    warnings,
    items: normalized,
  };
}

module.exports = { computeFromItems };
