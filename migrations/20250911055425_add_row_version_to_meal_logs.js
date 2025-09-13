exports.up = async function (knex) {
  const hasCol = await knex.schema.hasColumn('meal_logs', 'row_version');
  if (!hasCol) {
    await knex.schema.alterTable('meal_logs', (t) => {
      t.integer('row_version').notNullable().defaultTo(0);
    });
  }
};

exports.down = async function (knex) {
  const hasCol = await knex.schema.hasColumn('meal_logs', 'row_version');
  if (hasCol) {
    await knex.schema.alterTable('meal_logs', (t) => {
      t.dropColumn('row_version');
    });
  }
};
