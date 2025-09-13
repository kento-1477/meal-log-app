BEGIN;

-- 既存の NULL を埋め戻し
UPDATE meal_logs SET ai_raw = '{}'::jsonb WHERE ai_raw IS NULL;

-- 将来の NULL/不正型を防ぐ
ALTER TABLE meal_logs
  ALTER COLUMN ai_raw SET DEFAULT '{}'::jsonb,
  ALTER COLUMN ai_raw SET NOT NULL;

-- ai_raw は必ず JSON オブジェクト（配列や文字列を拒否）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meal_logs_ai_raw_is_object'
  ) THEN
    ALTER TABLE meal_logs
      ADD CONSTRAINT meal_logs_ai_raw_is_object
      CHECK (jsonb_typeof(ai_raw) = 'object');
  END IF;
END $$;

COMMIT;
