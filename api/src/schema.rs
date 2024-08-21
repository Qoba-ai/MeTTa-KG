// @generated automatically by Diesel CLI.

diesel::table! {
    namespaces (id) {
        id -> Int4,
        name -> Varchar,
        user_id -> Int4,
    }
}

diesel::table! {
    tokens (id) {
        id -> Int4,
        code -> Varchar,
        description -> Varchar,
        user_id -> Int4,
        namespace_id -> Int4,
    }
}

diesel::table! {
    users (id) {
        id -> Int4,
        username -> Varchar,
        email -> Varchar,
    }
}

diesel::joinable!(namespaces -> users (user_id));
diesel::joinable!(tokens -> namespaces (namespace_id));
diesel::joinable!(tokens -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(
    namespaces,
    tokens,
    users,
);
