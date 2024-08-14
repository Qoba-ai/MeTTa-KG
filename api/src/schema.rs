// @generated automatically by Diesel CLI.

diesel::table! {
    namespaces (id) {
        id -> Integer,
        name -> Text,
        user_id -> Integer,
    }
}

diesel::table! {
    tokens (id) {
        id -> Integer,
        code -> Text,
        description -> Text,
        user_id -> Integer,
        namespace_id -> Integer,
    }
}

diesel::table! {
    users (id) {
        id -> Integer,
        username -> Text,
        email -> Text,
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
