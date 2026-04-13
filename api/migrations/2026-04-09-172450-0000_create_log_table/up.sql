CREATE TABLE op_log (
    id         SERIAL PRIMARY KEY,
    op_type    VARCHAR   NOT NULL,
    payload    JSONB     NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
