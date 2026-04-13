// @generated automatically by Diesel CLI.

diesel::table! {
    op_log (id) {
        id -> Int4,
        op_type -> Varchar,
        created_at -> Timestamp,
    }
}

diesel::table! {
    op_log_clear (id) {
        id -> Int4,
        op_log_id -> Int4,
        path -> Text,
    }
}

diesel::table! {
    op_log_copy (id) {
        id -> Int4,
        op_log_id -> Int4,
        src -> Text,
        dst -> Text,
    }
}

diesel::table! {
    op_log_import (id) {
        id -> Int4,
        op_log_id -> Int4,
        path -> Text,
        uri -> Text,
    }
}

diesel::table! {
    op_log_transform (id) {
        id -> Int4,
        op_log_id -> Int4,
        input_spaces -> Jsonb,
        output_spaces -> Jsonb,
    }
}

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

diesel::joinable!(op_log_clear -> op_log (op_log_id));
diesel::joinable!(op_log_copy -> op_log (op_log_id));
diesel::joinable!(op_log_import -> op_log (op_log_id));
diesel::joinable!(op_log_transform -> op_log (op_log_id));

diesel::allow_tables_to_appear_in_same_query!(
    op_log,
    op_log_clear,
    op_log_copy,
    op_log_import,
    op_log_transform,
    tokens,
);
