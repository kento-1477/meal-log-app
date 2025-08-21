-- アプリ用ユーザー meal_app を作成/更新（パスワードは psql 変数 APP_DB_PASSWORD から受け取る）
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'meal_app') THEN
    EXECUTE 'CREATE ROLE meal_app WITH LOGIN PASSWORD ' || quote_literal(:APP_DB_PASSWORD) || ' INHERIT';
  ELSE
    EXECUTE 'ALTER ROLE meal_app WITH LOGIN PASSWORD ' || quote_literal(:APP_DB_PASSWORD) || ' INHERIT';
  END IF;
END$$;

-- 接続＆スキーマ利用
GRANT CONNECT ON DATABASE neondb TO meal_app;
GRANT USAGE ON SCHEMA public TO meal_app;

-- 既存オブジェクトのR/W
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO meal_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO meal_app;

-- これから作られるオブジェクトの既定権限
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO meal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO meal_app;

-- 任意：検索パス
ALTER ROLE meal_app SET search_path = public;