use moka::future::Cache;
use tokio::sync::Mutex;

#[derive(Clone, Debug, Default)]
pub struct LockEntry {
    pub is_locked: bool,
    pub descendants_locked: usize,
}

#[derive(Debug)]
pub struct LockManager {
    pub cache: Cache<String, LockEntry>,
    pub op_mutex: Mutex<()>,
}
