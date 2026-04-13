ALTER TABLE op_log DROP COLUMN payload;

CREATE TABLE op_log_import (
    id         SERIAL PRIMARY KEY,
    op_log_id  INT  NOT NULL REFERENCES op_log(id) ON DELETE CASCADE,
    path       TEXT NOT NULL,
    uri        TEXT NOT NULL
);

CREATE TABLE op_log_clear (
    id         SERIAL PRIMARY KEY,
    op_log_id  INT  NOT NULL REFERENCES op_log(id) ON DELETE CASCADE,
    path       TEXT NOT NULL
);

CREATE TABLE op_log_copy (
    id         SERIAL PRIMARY KEY,
    op_log_id  INT  NOT NULL REFERENCES op_log(id) ON DELETE CASCADE,
    src        TEXT NOT NULL,
    dst        TEXT NOT NULL
);

CREATE TABLE op_log_transform (
    id            SERIAL PRIMARY KEY,
    op_log_id     INT   NOT NULL REFERENCES op_log(id) ON DELETE CASCADE,
    input_spaces  JSONB NOT NULL,
    output_spaces JSONB NOT NULL
);
