DROP TABLE IF EXISTS op_log_transform;
DROP TABLE IF EXISTS op_log_copy;
DROP TABLE IF EXISTS op_log_clear;
DROP TABLE IF EXISTS op_log_import;

ALTER TABLE op_log ADD COLUMN payload JSONB NOT NULL DEFAULT '{}'::jsonb;
