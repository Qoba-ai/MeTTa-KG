use diesel::pg::PgConnection;
use diesel::Connection;
use std::env;

pub fn establish_connection() -> PgConnection {
    let database_url =
        env::var("METTA_KG_DATABASE_URL").expect("METTA_KG_DATABASE_URL must be set");

    PgConnection::establish(&database_url)
        .unwrap_or_else(|e| panic!("Error connecting to {database_url} {e}"))
}
