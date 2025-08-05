exports.up = function (knex) {
  return knex.schema.createTable('meal_logs', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('meal_type');
    table.string('food_item');
    table.float('calories');
    table.float('protein');
    table.float('fat');
    table.float('carbs');
    table.string('image_path');
    table.text('memo');
    table.timestamp('consumed_at').defaultTo(knex.fn.now()); // 食事日時
    table.timestamps(true, true); // created_at, updated_at

    table
      .foreign('user_id')
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('meal_logs');
};
