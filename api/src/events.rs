use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SpaceEvent {
    Locked { path: String },
    Unlocked { path: String },
}

/// Holds the broadcast sender. The Receiver is created per-subscriber.
pub struct EventBus(pub broadcast::Sender<SpaceEvent>);

impl EventBus {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(256);
        EventBus(tx)
    }
}
