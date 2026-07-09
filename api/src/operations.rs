use moka::future::Cache;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum OperationStatus {
    Pending,
    Complete,
    Error,
}

#[derive(Serialize, Clone, Debug)]
pub struct OperationRecord {
    pub id: String,
    pub op_type: String,
    pub status: OperationStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    pub path: String,
}

#[derive(Clone)]
pub struct OperationStore {
    cache: Cache<String, OperationRecord>,
}

impl OperationStore {
    pub fn new() -> Self {
        OperationStore {
            cache: Cache::builder()
                .max_capacity(10_000)
                .time_to_live(Duration::from_secs(3600))
                .build(),
        }
    }

    pub async fn insert(&self, record: OperationRecord) {
        self.cache.insert(record.id.clone(), record).await;
    }

    pub async fn get(&self, id: &str) -> Option<OperationRecord> {
        self.cache.get(id).await
    }

    pub async fn update(&self, id: &str, status: OperationStatus, message: Option<String>) {
        if let Some(mut record) = self.cache.get(id).await {
            record.status = status;
            record.message = message;
            self.cache.insert(id.to_string(), record).await;
        }
    }
}
