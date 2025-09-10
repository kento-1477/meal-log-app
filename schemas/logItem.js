import { z } from 'zod';

export const AiRawSchema = z
  .object({
    dish: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    base_confidence: z.number().min(0).max(1).optional(),
    nutrition: z
      .object({
        protein_g: z.number(),
        fat_g: z.number(),
        carbs_g: z.number(),
        calories: z.number(),
      })
      .optional(),
    breakdown: z
      .object({
        items: z.array(z.any()).optional(),
        slots: z.record(z.any()).optional(),
        warnings: z.array(z.any()).optional(),
      })
      .optional(),
  })
  .passthrough();

export const LogItemSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  // ...必要なフィールド
  ai_raw: AiRawSchema, // ここが肝。null を許可しない
});
