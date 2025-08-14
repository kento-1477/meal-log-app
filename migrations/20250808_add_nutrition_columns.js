// migrations/20250808_add_nutrition_columns.js
exports.up = async (knex) => {
  await knex.schema.alterTable('meal_logs', (t) => {
    t.decimal('calories', 8, 2).nullable();
    t.decimal('protein_g', 8, 2).nullable();
    t.decimal('fat_g', 8, 2).nullable();
    t.decimal('carbs_g', 8, 2).nullable();
    t.jsonb('ai_raw').nullable();
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('meal_logs', (t) => {
    t.dropColumns('calories', 'protein_g', 'fat_g', 'carbs_g', 'ai_raw');
  });
};
