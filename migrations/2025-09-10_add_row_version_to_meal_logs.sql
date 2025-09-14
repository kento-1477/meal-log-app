ALTER TABLE meal_logs
  ADD COLUMN row_version integer NOT NULL DEFAULT 0;
