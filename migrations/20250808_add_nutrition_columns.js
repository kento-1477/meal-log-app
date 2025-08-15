exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE meal_logs
      ADD COLUMN IF NOT EXISTS calories DECIMAL(8,2),
      ADD COLUMN IF NOT EXISTS protein_g DECIMAL(8,2),
      ADD COLUMN IF NOT EXISTS fat_g DECIMAL(8,2),
      ADD COLUMN IF NOT EXISTS carbs_g DECIMAL(8,2),
      ADD COLUMN IF NOT EXISTS ai_raw JSONB
  `);
};
exports.down = async (knex) => {
  --no - op;
};
