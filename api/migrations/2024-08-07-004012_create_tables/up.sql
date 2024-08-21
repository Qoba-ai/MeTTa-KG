CREATE TABLE users (
    id INTEGER PRIMARY KEY NOT NULL,
    username VARCHAR NOT NULL,
    email VARCHAR NOT NULL
);

CREATE TABLE namespaces (
    id INTEGER PRIMARY KEY NOT NULL,
    name VARCHAR NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE tokens (
    id INTEGER PRIMARY KEY NOT NULL,
    code VARCHAR NOT NULL,
    description VARCHAR NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    namespace_id INTEGER NOT NULL REFERENCES namespaces(id)
);

