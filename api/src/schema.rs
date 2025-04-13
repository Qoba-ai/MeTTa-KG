// @generated automatically by Diesel CLI.

diesel::table! {
    tokens (id) {
        id -> Int4,
        code -> Varchar,
        description -> Varchar,
        namespace -> Varchar,
        creation_timestamp -> Timestamp,
        permission_read -> Bool,
        permission_write -> Bool,
        permission_share_share -> Bool,
        permission_share_read -> Bool,
        permission_share_write -> Bool,
        parent -> Nullable<Int4>,
    }
}
