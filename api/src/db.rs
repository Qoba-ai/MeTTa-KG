use diesel::pg::PgConnection;
use diesel::Connection;
use std::env;
use tracing::{debug, error, instrument};

#[instrument]
pub fn establish_connection() -> PgConnection {
    let database_url = env::var("METTA_KG_DATABASE_URL")
        .map_err(|_| {
            error!("METTA_KG_DATABASE_URL environment variable is missing");
        })
        .expect("METTA_KG_DATABASE_URL must be set");

    match PgConnection::establish(&database_url) {
        Ok(conn) => {
            debug!("Established database connection");
            conn
        }
        Err(e) => {
            error!(
                error = %e,
                "Failed to establish database connection"
            );
            panic!("Database connection failed: {}", e);
        }
    }
}
