exports.up = function (knex) {
  return knex.schema
    .raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";') // UUID拡張機能を有効化
    .createTable('users', function (table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()')); // UUID型に変更
      table.string('username', 50).notNullable().unique();
      table.string('email', 255).notNullable().unique();
      table.string('password_hash', 255).notNullable();
      table.timestamps(true, true); // created_at, updated_at
    })
    .createTable('user_profiles', function (table) {
      table
        .uuid('user_id')
        .primary()
        .references('users.id')
        .onDelete('CASCADE'); // UUID型に変更
      table.string('gender', 50);
      table.integer('age');
      table.decimal('height_cm');
      table.decimal('weight_kg');
      table.string('activity_level', 50);
      table.timestamps(true, true); // created_at, updated_at
    })
    .createTable('user_goals', function (table) {
      table
        .uuid('user_id')
        .primary()
        .references('users.id')
        .onDelete('CASCADE'); // UUID型に変更
      table.decimal('target_calories');
      table.decimal('target_protein');
      table.decimal('target_fat');
      table.decimal('target_carbs');
      table.timestamps(true, true); // created_at, updated_at
    })
    .createTable('meal_logs', function (table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()')); // UUID型に変更
      table
        .uuid('user_id')
        .notNullable()
        .references('users.id')
        .onDelete('CASCADE'); // UUID型に変更
      table.string('meal_type', 50).notNullable();
      table.string('food_item', 255).notNullable();
      table.decimal('calories', 6, 2).notNullable(); // numeric(6,2)に変更
      table.timestamp('consumed_at').defaultTo(knex.fn.now());
      table.decimal('protein', 6, 2); // numeric(6,2)に変更
      table.decimal('fat', 6, 2); // numeric(6,2)に変更
      table.decimal('carbs', 6, 2); // numeric(6,2)に変更
      table.text('image_path');
      table.text('memo');
    })
    .createTable('reminder_settings', function (table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()')); // UUID型に変更
      table
        .uuid('user_id')
        .notNullable()
        .references('users.id')
        .onDelete('CASCADE'); // UUID型に変更
      table.string('reminder_name', 255).notNullable();
      table.time('notification_time').notNullable();
      table.jsonb('days_of_week').notNullable();
      table.boolean('is_enabled').defaultTo(true);
      table.text('message');
      table.string('coaching_level', 50).defaultTo('gentle');
      table.timestamps(true, true); // created_at, updated_at
    })
    .createTable('notifications', function (table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()')); // UUID型に変更
      table
        .uuid('user_id')
        .notNullable()
        .references('users.id')
        .onDelete('CASCADE'); // UUID型に変更
      table
        .uuid('reminder_id')
        .references('reminder_settings.id')
        .onDelete('SET NULL'); // UUID型に変更
      table.text('message').notNullable();
      table.boolean('is_read').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    })
    .createTable('user_preferences', function (table) {
      table
        .uuid('user_id')
        .primary()
        .references('users.id')
        .onDelete('CASCADE'); // UUID型に変更
      table.text('coaching_level').notNullable().defaultTo('gentle');
      table.timestamps(true, true); // created_at, updated_at
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTable('user_preferences')
    .dropTable('notifications')
    .dropTable('reminder_settings')
    .dropTable('meal_logs')
    .dropTable('user_goals')
    .dropTable('user_profiles')
    .dropTable('users');
};
