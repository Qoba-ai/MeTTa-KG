BEGIN;
  ALTER TABLE tokens DROP CONSTRAINT tokens_parent_fkey;
  ALTER TABLE tokens ADD CONSTRAINT tokens_parent_fkey FOREIGN KEY (parent) REFERENCES tokens(id) ON DELETE CASCADE;
COMMIT;
