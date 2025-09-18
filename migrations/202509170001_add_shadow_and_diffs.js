exports.up = async function up(knex) {
  // meal_logs additive columns
  const addColumnIfMissing = async (column, builder) => {
    const exists = await knex.schema.hasColumn('meal_logs', column);
    if (!exists) {
      await knex.schema.alterTable('meal_logs', (table) => {
        builder(table);
      });
    }
  };

  await addColumnIfMissing('slot', (table) => {
    table.text('slot');
  });

  await addColumnIfMissing('event', (table) => {
    table.text('event').defaultTo('eat');
  });

  await addColumnIfMissing('totals', (table) => {
    table.jsonb('totals');
  });

  await addColumnIfMissing('meta', (table) => {
    table.jsonb('meta');
  });

  await addColumnIfMissing('is_deleted', (table) => {
    table.boolean('is_deleted').notNullable().defaultTo(false);
  });

  // ingest_requests table for idempotency tracking
  const hasIngestRequests = await knex.schema.hasTable('ingest_requests');
  if (!hasIngestRequests) {
    await knex.schema.createTable('ingest_requests', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable();
      table.text('request_key').notNullable();
      table.uuid('log_id');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['user_id', 'request_key']);
      table.index(['created_at']);
    });
  }

  // Shadow table mirrors meal_logs schema for new pipeline writes
  await knex.raw(
    'CREATE TABLE IF NOT EXISTS meal_logs_v2_shadow (LIKE meal_logs INCLUDING DEFAULTS INCLUDING CONSTRAINTS)',
  );
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_meal_logs_v2_shadow_user_date ON meal_logs_v2_shadow (user_id, consumed_at)',
  );

  // diffs table for monitoring new vs legacy outputs
  const hasDiffs = await knex.schema.hasTable('diffs');
  if (!hasDiffs) {
    await knex.schema.createTable('diffs', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table
        .timestamp('ts', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      table.text('phase').notNullable().defaultTo('P0');
      table.uuid('user_id').notNullable();
      table.uuid('log_id');
      table.date('date');
      table.integer('dkcal');
      table.specificType('dp', 'double precision');
      table.specificType('df', 'double precision');
      table.specificType('dc', 'double precision');
      table.specificType('rel_p', 'double precision');
      table.specificType('rel_f', 'double precision');
      table.specificType('rel_c', 'double precision');
      table.text('level').notNullable().defaultTo('record');
      table.jsonb('details');
      table.index(['user_id', 'date']);
      table.index(['ts']);
    });
    await knex.raw(
      "ALTER TABLE diffs ADD CONSTRAINT diffs_phase_chk CHECK (phase IN ('P0','P1','P2','P3'))",
    );
    await knex.raw(
      "ALTER TABLE diffs ADD CONSTRAINT diffs_level_chk CHECK (level IN ('record','day'))",
    );
  }
};

exports.down = async function down() {
  // additive migration – no rollback to avoid destructive operations
  return undefined;
};
