exports.up = async (knex) => {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  const hasMedia = await knex.schema.hasTable('media_assets');
  if (!hasMedia) {
    await knex.schema.createTable('media_assets', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.text('url').notNullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.text('kind').defaultTo('image'); // Add kind column with default
      t.text('mime'); // Add mime column
      t.integer('bytes'); // Add bytes column
      t.uuid('user_id'); // Add user_id column
    });
  }
  const hasImageId = await knex.schema.hasColumn('meal_logs', 'image_id');
  if (!hasImageId) {
    await knex.schema.alterTable('meal_logs', (t) => {
      t.uuid('image_id');
    });
    await knex.raw(
      'ALTER TABLE meal_logs ADD CONSTRAINT meal_logs_image_id_fkey ' +
        'FOREIGN KEY (image_id) REFERENCES media_assets(id) ON DELETE SET NULL',
    );
  }
};

exports.down = async (knex) => {
  const hasImageId = await knex.schema.hasColumn('meal_logs', 'image_id');
  if (hasImageId) {
    await knex.schema.alterTable('meal_logs', (t) => t.dropColumn('image_id'));
  }
  // media_assets の drop は必要に応じて
};
