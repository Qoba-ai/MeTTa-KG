use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SpaceEvent {
    Locked { path: String },
    Unlocked { path: String },
    ImportComplete { path: String },
    ImportError { path: String, message: String },
    ClearComplete { path: String },
    ClearError { path: String, message: String },
    TransformComplete { path: String },
    TransformError { path: String, message: String },
}

impl SpaceEvent {
    pub fn path(&self) -> &str {
        match self {
            Self::Locked { path }
            | Self::Unlocked { path }
            | Self::ImportComplete { path }
            | Self::ImportError { path, .. }
            | Self::ClearComplete { path }
            | Self::ClearError { path, .. }
            | Self::TransformComplete { path }
            | Self::TransformError { path, .. } => path,
        }
    }
}

pub struct EventBus(pub broadcast::Sender<SpaceEvent>);

impl EventBus {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(256);
        EventBus(tx)
    }
}
