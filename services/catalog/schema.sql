CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS off_products (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  brand TEXT,
  lang TEXT,
  countries_tags TEXT[],
  serving_size TEXT,
  serving_qty_g NUMERIC,
  kcal_100g NUMERIC,
  p_100g NUMERIC,
  f_100g NUMERIC,
  c_100g NUMERIC,
  kcal_serv NUMERIC,
  p_serv NUMERIC,
  f_serv NUMERIC,
  c_serv NUMERIC,
  source TEXT NOT NULL DEFAULT 'off',
  rev TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS off_products_name_trgm
  ON off_products USING gin (name_normalized gin_trgm_ops);

CREATE INDEX IF NOT EXISTS off_products_brand_trgm
  ON off_products USING gin (brand gin_trgm_ops);
