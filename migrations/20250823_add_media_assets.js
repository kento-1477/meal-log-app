exports.up = async function (knex) {
  // Ensure pgcrypto extension is available for gen_random_uuid()
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // media_assets テーブル
  await knex.schema.createTable('media_assets', function (table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id');
    table.text('kind').notNullable(); // 'image', 'video' etc.
    table.text('mime');
    table.integer('bytes');
    table.text('url').notNullable();
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.index(['user_id', 'created_at']);
  });

  // meal_logs 拡張
  await knex.schema.alterTable('meal_logs', function (table) {
    table
      .uuid('image_id')
      .references('id')
      .inTable('media_assets')
      .onDelete('SET NULL');
    table.text('meal_tag'); // e.g., 'breakfast', 'lunch', 'dinner', 'snack'
    // The index on created_at might already exist, but we ensure it.
    // It's better to create indexes in separate migrations if they are complex or on large tables.
  });

  // Ensure index on meal_logs.created_at for faster sorting
  // Using raw not to fail if it exists. A better approach is a separate check.
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_meal_logs_created_at ON meal_logs (created_at DESC)',
  );
};

exports.down = async function (knex) {
  // Rollback in reverse order of creation
  const hasImageId = await knex.schema.hasColumn('meal_logs', 'image_id');
  if (hasImageId) {
    await knex.schema.alterTable('meal_logs', function (table) {
      table.dropColumn('image_id');
    });
  }
  const hasMealTag = await knex.schema.hasColumn('meal_logs', 'meal_tag');
  if (hasMealTag) {
    await knex.schema.alterTable('meal_logs', function (table) {
      table.dropColumn('meal_tag');
    });
  }

  await knex.schema.dropTableIfExists('media_assets');
  // The index on meal_logs is kept as it might be useful anyway.
};
