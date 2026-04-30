CREATE TABLE op_log_edit (
    id         SERIAL PRIMARY KEY,
    op_log_id  INT   NOT NULL REFERENCES op_log(id) ON DELETE CASCADE,
    path       TEXT  NOT NULL,
    added      JSONB NOT NULL DEFAULT '[]',
    removed    JSONB NOT NULL DEFAULT '[]'
);
