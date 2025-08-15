exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE meal_logs
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT NOW();

    CREATE OR REPLACE FUNCTION set_meal_logs_updated_at()
    RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_meal_logs_set_updated_at'
      ) THEN
        CREATE TRIGGER trg_meal_logs_set_updated_at
        BEFORE UPDATE ON meal_logs
        FOR EACH ROW EXECUTE FUNCTION set_meal_logs_updated_at();
      END IF;
    END;
    $$;
  `);
};

exports.down = async (knex) => {
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_meal_logs_set_updated_at ON meal_logs;
    DROP FUNCTION IF EXISTS set_meal_logs_updated_at;
    -- 列は保持（ダウンで消すと影響が大きいため）
  `);
};
