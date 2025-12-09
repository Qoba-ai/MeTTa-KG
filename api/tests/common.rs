use api::model::{Token, TokenInsert};
use api::schema::tokens;
use api::{db::establish_connection, MIGRATIONS};
use chrono::Utc;
use diesel::pg::PgConnection;
use diesel::prelude::*;
use diesel_migrations::MigrationHarness;
use std::env;

pub fn create_test_database_if_not_exists() {
    let postgres_url = "postgresql://metta-kg-admin:metta-kg-password@localhost/postgres";
    let mut conn = PgConnection::establish(postgres_url)
        .expect("Failed to connect to postgres database for creating test DB");

    let create_sql = r#"CREATE DATABASE "metta-kg-test""#;
    match diesel::sql_query(create_sql).execute(&mut conn) {
        Ok(_) => println!("Test database 'metta-kg-test' created successfully"),
        Err(e) if e.to_string().contains("already exists") => {
            println!("Test database 'metta-kg-test' already exists")
        }
        Err(e) => panic!("Failed to create test database: {}", e),
    }
}

pub fn drop_tokens_table() {
    let conn = &mut establish_connection();
    let sql = r#"DROP TABLE IF EXISTS tokens"#;
    diesel::sql_query(sql)
        .execute(conn)
        .expect("Failed to drop tokens table");
    let sql2 = r#"DROP TABLE IF EXISTS __diesel_schema_migrations"#;
    diesel::sql_query(sql2)
        .execute(conn)
        .expect("Failed to drop migrations table");
}

pub fn teardown_database() {
    drop_tokens_table();
}

pub fn is_database_running() -> bool {
    let postgres_url = "postgresql://metta-kg-admin:metta-kg-password@localhost/postgres";
    PgConnection::establish(postgres_url).is_ok()
}

pub fn create_test_token(namespace: &str, permission_read: bool, permission_write: bool) -> Token {
    let conn = &mut establish_connection();
    let code = format!("test_token_{}", Utc::now().timestamp_nanos_opt().unwrap());

    let token_insert = TokenInsert {
        code: code.clone(),
        description: "Test token".to_string(),
        namespace: namespace.to_string(),
        creation_timestamp: Utc::now().naive_utc(),
        permission_read,
        permission_write,
        permission_share_share: true,
        permission_share_read: true,
        permission_share_write: true,
        parent: None,
    };

    diesel::insert_into(tokens::table)
        .values(&token_insert)
        .get_result(conn)
        .expect("Failed to insert test token")
}

pub fn setup_database() {
    // Tables and seed are handled by embedded migrations in setup
}

pub fn setup(mork_base_url: &str) {
    create_test_database_if_not_exists();
    env::set_var("METTA_KG_MORK_URL", mork_base_url);
    env::set_var("POSTGRES_USER", "metta-kg-admin");
    env::set_var("POSTGRES_PASSWORD", "metta-kg-password");
    env::set_var("POSTGRES_DB", "metta-kg-test");
    env::set_var("POSTGRES_HOST", "localhost");

    let mut connection = establish_connection();
    connection
        .run_pending_migrations(MIGRATIONS)
        .expect("Failed to run migrations in test setup");

    setup_database();
}
