const { z } = require('zod');
const { cloneTotals } = require('../types');

const NumberLike = z.union([z.number(), z.string()]).transform((value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
});

const ItemSchema = z
  .object({
    name: z.string().optional().nullable(),
    code: z.string().optional().nullable(),
    source: z.string().optional().nullable(),
    grams: NumberLike.optional(),
    qty_g: NumberLike.optional(),
    quantity_g: NumberLike.optional(),
    g: NumberLike.optional(),
    amount: NumberLike.optional(),
    kcal: NumberLike.optional(),
    protein_g: NumberLike.optional(),
    fat_g: NumberLike.optional(),
    carbs_g: NumberLike.optional(),
    protein: NumberLike.optional(),
    fat: NumberLike.optional(),
    carbs: NumberLike.optional(),
    confidence: NumberLike.optional(),
    note: z.string().optional().nullable(),
  })
  .transform((item) => {
    const gramsCandidates = [
      item.grams,
      item.qty_g,
      item.quantity_g,
      item.g,
      item.amount,
    ].map((n) => (Number.isFinite(n) ? n : NaN));
    const grams = gramsCandidates.find((n) => Number.isFinite(n)) || null;
    return {
      name: item.name ?? item.code ?? null,
      code: item.code ?? null,
      source: item.source ?? null,
      grams,
      kcal: Number.isFinite(item.kcal) ? item.kcal : null,
      protein_g: Number.isFinite(item.protein_g)
        ? item.protein_g
        : Number.isFinite(item.protein)
          ? item.protein
          : null,
      fat_g: Number.isFinite(item.fat_g)
        ? item.fat_g
        : Number.isFinite(item.fat)
          ? item.fat
          : null,
      carbs_g: Number.isFinite(item.carbs_g)
        ? item.carbs_g
        : Number.isFinite(item.carbs)
          ? item.carbs
          : null,
      confidence: Number.isFinite(item.confidence) ? item.confidence : null,
      note: item.note ?? null,
    };
  });

const TotalsSchema = z
  .object({
    kcal: NumberLike,
    protein_g: NumberLike.optional(),
    fat_g: NumberLike.optional(),
    carbs_g: NumberLike.optional(),
    protein: NumberLike.optional(),
    fat: NumberLike.optional(),
    carbs: NumberLike.optional(),
  })
  .transform((totals) =>
    cloneTotals({
      kcal: totals.kcal,
      protein_g: Number.isFinite(totals.protein_g)
        ? totals.protein_g
        : totals.protein,
      fat_g: Number.isFinite(totals.fat_g) ? totals.fat_g : totals.fat,
      carbs_g: Number.isFinite(totals.carbs_g) ? totals.carbs_g : totals.carbs,
    }),
  );

const NutritionSchema = z
  .object({
    calories: NumberLike.optional(),
    protein_g: NumberLike.optional(),
    fat_g: NumberLike.optional(),
    carbs_g: NumberLike.optional(),
  })
  .optional();

const RawSchema = z
  .object({
    dish: z.string().optional().nullable(),
    totals: TotalsSchema.optional(),
    nutrition: NutritionSchema,
    items: z.array(ItemSchema).optional(),
    warnings: z.array(z.string()).optional(),
    confidence: NumberLike.optional(),
    meta: z.record(z.string(), z.any()).optional(),
  })
  .transform((raw) => {
    const totals = raw.totals
      ? raw.totals
      : cloneTotals({
          kcal: raw.nutrition?.calories ?? 0,
          protein_g: raw.nutrition?.protein_g ?? 0,
          fat_g: raw.nutrition?.fat_g ?? 0,
          carbs_g: raw.nutrition?.carbs_g ?? 0,
        });
    return {
      dish: raw.dish ?? null,
      totals,
      items: raw.items ?? [],
      warnings: raw.warnings ?? [],
      confidence: Number.isFinite(raw.confidence) ? raw.confidence : null,
      meta: raw.meta ?? {},
    };
  });

function parse(raw) {
  return RawSchema.parse(raw);
}

module.exports = { parse };
