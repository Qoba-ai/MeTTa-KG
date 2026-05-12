use diesel::pg::PgConnection;
use diesel::r2d2::{ConnectionManager, Pool, PooledConnection};
use tracing::info;

use crate::error::ApiError;

pub type DbPool = Pool<ConnectionManager<PgConnection>>;
pub type DbConn = PooledConnection<ConnectionManager<PgConnection>>;

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

pub fn get_conn(pool: &DbPool) -> Result<DbConn, ApiError> {
    pool.get()
        .map_err(|e| ApiError::Internal(format!("connection pool: {}", e)))
}
