use diesel::pg::PgConnection;
use diesel::Connection;
use tracing::{debug, error, instrument};

#[instrument]
pub fn establish_connection() -> PgConnection {
    let database_url = &crate::config::config().database_url;

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
