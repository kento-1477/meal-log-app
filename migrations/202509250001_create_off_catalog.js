/* eslint-disable no-console */

exports.up = async function up(knex) {
  try {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  } catch (error) {
    console.warn(
      '[migration] pg_trgm extension not created (insufficient privileges?)',
      error.message,
    );
  }

  const exists = await knex.schema.hasTable('off_products');
  if (!exists) {
    await knex.schema.createTable('off_products', (table) => {
      table.text('code').primary();
      table.text('name').notNullable();
      table.text('name_normalized').notNullable();
      table.text('brand');
      table.text('lang');
      table.specificType('countries_tags', 'text[]');
      table.text('serving_size');
      table.decimal('serving_qty_g');
      table.decimal('kcal_100g');
      table.decimal('p_100g');
      table.decimal('f_100g');
      table.decimal('c_100g');
      table.decimal('kcal_serv');
      table.decimal('p_serv');
      table.decimal('f_serv');
      table.decimal('c_serv');
      table.text('source').notNullable().defaultTo('off');
      table.text('rev');
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  await knex.raw(
    'CREATE INDEX IF NOT EXISTS off_products_name_trgm ON off_products USING gin (name_normalized gin_trgm_ops)',
  );
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS off_products_brand_trgm ON off_products USING gin (brand gin_trgm_ops)',
  );
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS off_products_brand_trgm');
  await knex.raw('DROP INDEX IF EXISTS off_products_name_trgm');
  await knex.schema.dropTableIfExists('off_products');
};
