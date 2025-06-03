CREATE TABLE tokens (
    id SERIAL PRIMARY KEY NOT NULL,
    code VARCHAR NOT NULL,
    description VARCHAR NOT NULL,
    namespace VARCHAR NOT NULL,
    creation_timestamp TIMESTAMP NOT NULL,
    permission_read BOOLEAN NOT NULL,
    permission_write BOOLEAN NOT NULL,
    permission_share_share BOOLEAN NOT NULL,
    permission_share_read BOOLEAN NOT NULL,
    permission_share_write BOOLEAN NOT NULL,
    parent INTEGER REFERENCES tokens REFERENCES tokens(id)
);

