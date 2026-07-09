use diesel::pg::PgConnection;
use diesel::r2d2::{ConnectionManager, Pool, PooledConnection};
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use tracing::info;

use crate::error::ApiError;

pub type DbPool = Pool<ConnectionManager<PgConnection>>;
pub type DbConn = PooledConnection<ConnectionManager<PgConnection>>;

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");

pub fn init_pool() -> DbPool {
    let database_url = &crate::config::config().database_url;
    let manager = ConnectionManager::<PgConnection>::new(database_url.clone());
    let pool = Pool::builder()
        .max_size(10)
        .build(manager)
        .expect("Failed to create database connection pool");
    info!("Database connection pool initialized");
    pool
}

pub fn run_migrations(pool: &DbPool) {
    let mut conn = pool
        .get()
        .expect("Failed to acquire connection for migrations");
    let applied = conn
        .run_pending_migrations(MIGRATIONS)
        .expect("Failed to run pending migrations");
    if applied.is_empty() {
        info!("Database schema up to date; no migrations applied");
    } else {
        let versions: Vec<String> = applied.iter().map(|v| v.to_string()).collect();
        info!(count = applied.len(), versions = ?versions, "Applied pending migrations");
    }
}

pub fn get_conn(pool: &DbPool) -> Result<DbConn, ApiError> {
    pool.get()
        .map_err(|e| ApiError::Internal(format!("connection pool: {}", e)))
}
