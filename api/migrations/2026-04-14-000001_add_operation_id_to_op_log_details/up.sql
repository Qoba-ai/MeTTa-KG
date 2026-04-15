ALTER TABLE op_log_import    ADD COLUMN operation_id TEXT;
ALTER TABLE op_log_clear     ADD COLUMN operation_id TEXT;
ALTER TABLE op_log_copy      ADD COLUMN operation_id TEXT;
ALTER TABLE op_log_transform ADD COLUMN operation_id TEXT;
